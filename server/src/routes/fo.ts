import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote } from '../services/marketData.js';
import { blackScholes, generateOptionChain } from '../services/blackScholes.js';
import {
  LOT_SIZES, getBaseIV, getStrikeInterval, getExpiriesForSymbol,
  formatExpiry, timeToExpiryYears, chainSeed, WEEKLY_EXPIRY_SYMBOLS,
} from '../services/foData.js';

const router = Router();
const RISK_FREE_RATE = 0.065; // RBI repo rate
const DEFAULT_STRIKES_EACH_SIDE = 15;

// ── GET /api/fo/eligible ── List of F&O-eligible symbols + lot sizes ──────
router.get('/eligible', (req, res) => {
  const symbols = Object.entries(LOT_SIZES).map(([symbol, lotSize]) => ({
    symbol,
    lotSize,
    isIndex: WEEKLY_EXPIRY_SYMBOLS.has(symbol),
  }));
  res.json(symbols);
});

// ── GET /api/fo/expiries/:symbol ── Expiry dates for a symbol ─────────────
router.get('/expiries/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const expiries = getExpiriesForSymbol(symbol, 4);
  res.json(expiries.map(formatExpiry));
});

// ── GET /api/fo/chain/:symbol ── Full option chain ────────────────────────
router.get('/chain/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const expiryParam = req.query.expiry as string | undefined;
    const strikeCount = Math.min(Number(req.query.strikes) || DEFAULT_STRIKES_EACH_SIDE, 30);

    // Resolve expiry
    const expiries = getExpiriesForSymbol(symbol, 4);
    if (!expiries.length) return res.status(400).json({ error: 'No expiries available' });

    let expiry: string;
    if (expiryParam && expiries.map(formatExpiry).includes(expiryParam)) {
      expiry = expiryParam;
    } else {
      expiry = formatExpiry(expiries[0]);
    }

    // Get current price
    // Indices use dedicated Yahoo symbols; stocks use .NS suffix
    const isIndex = WEEKLY_EXPIRY_SYMBOLS.has(symbol);
    let spot: number;

    if (isIndex) {
      // Index mapping to Yahoo Finance tickers
      const INDEX_TICKERS: Record<string, string> = {
        NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', FINNIFTY: 'NIFTY_FIN_SERVICE.NS',
        MIDCPNIFTY: 'NIFTY_MIDCAP_100.NS', SENSEX: '^BSESN', BANKEX: 'BSE-BANK.BO',
      };
      const ticker = INDEX_TICKERS[symbol];
      if (!ticker) return res.status(400).json({ error: `Index ${symbol} not supported` });
      const q = await getQuote(ticker.replace('^', ''), ticker.startsWith('^') ? 'NSE' : 'NSE');
      if (!q) return res.status(503).json({ error: 'Price unavailable' });
      spot = q.price;
    } else {
      const q = await getQuote(symbol, 'NSE');
      if (!q) return res.status(503).json({ error: 'Price unavailable for ' + symbol });
      spot = q.price;
    }

    const T = timeToExpiryYears(expiry);
    const baseIV = getBaseIV(symbol);
    const strikeInterval = getStrikeInterval(symbol, spot);
    const seed = chainSeed(symbol, expiry);
    const lotSize = LOT_SIZES[symbol] ?? 1;

    const chain = generateOptionChain(spot, baseIV, T, RISK_FREE_RATE, strikeInterval, strikeCount, seed);

    // ATM strike
    const atm = Math.round(spot / strikeInterval) * strikeInterval;

    // PCR (Put-Call Ratio) = total put OI / total call OI
    const totalCallOI = chain.reduce((s, c) => s + c.CE.oi, 0);
    const totalPutOI  = chain.reduce((s, c) => s + c.PE.oi, 0);
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    // Max Pain = strike where total option seller loss is minimized
    let maxPainStrike = atm;
    let minPain = Infinity;
    for (const row of chain) {
      // At this strike expiring: calls below strike are ITM, puts above are ITM
      const pain = chain.reduce((sum, c) => {
        const callPain = c.strike < row.strike ? (row.strike - c.strike) * c.CE.oi : 0;
        const putPain  = c.strike > row.strike ? (c.strike - row.strike) * c.PE.oi : 0;
        return sum + callPain + putPain;
      }, 0);
      if (pain < minPain) { minPain = pain; maxPainStrike = row.strike; }
    }

    res.json({
      symbol,
      spot,
      expiry,
      expiries: expiries.map(formatExpiry),
      atm,
      lotSize,
      pcr: Math.round(pcr * 100) / 100,
      maxPain: maxPainStrike,
      chain,
    });
  } catch (err: any) {
    console.error('[fo/chain]', err?.message);
    res.status(500).json({ error: 'Failed to generate option chain' });
  }
});

// ── POST /api/fo/orders ── Paper-trade an option ──────────────────────────
router.post('/orders', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { symbol, instrumentType, strikePrice, expiryDate, lots, transactionType, price } = req.body;

  if (!symbol || !instrumentType || !expiryDate || !lots || !transactionType || !price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['CE', 'PE', 'FUT'].includes(instrumentType)) return res.status(400).json({ error: 'Invalid instrument type' });
  if (!['BUY', 'SELL'].includes(transactionType)) return res.status(400).json({ error: 'Invalid transaction type' });
  if (lots < 1 || lots > 50) return res.status(400).json({ error: 'Lots must be between 1 and 50' });

  const lotSize = LOT_SIZES[symbol.toUpperCase()] ?? 1;
  const totalPremium = price * lotSize * lots;

  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (transactionType === 'BUY' && user.balance < totalPremium) {
    return res.status(400).json({ error: `Insufficient balance. Required: ₹${totalPremium.toFixed(2)}` });
  }

  try {
    if (transactionType === 'BUY') {
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(totalPremium, userId);

      // Add to positions (or increase existing)
      const existing = db.prepare(
        `SELECT id, quantity_lots, avg_buy_price FROM fo_positions
         WHERE user_id = ? AND symbol = ? AND instrument_type = ? AND strike_price = ? AND expiry_date = ?`
      ).get(userId, symbol.toUpperCase(), instrumentType, strikePrice ?? null, expiryDate) as any;

      if (existing) {
        const newLots = existing.quantity_lots + lots;
        const newAvg = (existing.avg_buy_price * existing.quantity_lots + price * lots) / newLots;
        db.prepare('UPDATE fo_positions SET quantity_lots = ?, avg_buy_price = ? WHERE id = ?')
          .run(newLots, newAvg, existing.id);
      } else {
        db.prepare(
          `INSERT INTO fo_positions (user_id, symbol, instrument_type, strike_price, expiry_date, lot_size, quantity_lots, avg_buy_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(userId, symbol.toUpperCase(), instrumentType, strikePrice ?? null, expiryDate, lotSize, lots, price);
      }
    } else {
      // SELL = square off position
      const position = db.prepare(
        `SELECT id, quantity_lots, avg_buy_price FROM fo_positions
         WHERE user_id = ? AND symbol = ? AND instrument_type = ? AND strike_price = ? AND expiry_date = ?`
      ).get(userId, symbol.toUpperCase(), instrumentType, strikePrice ?? null, expiryDate) as any;

      if (!position || position.quantity_lots < lots) {
        return res.status(400).json({ error: 'Insufficient position to sell' });
      }

      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalPremium, userId);

      if (position.quantity_lots === lots) {
        db.prepare('DELETE FROM fo_positions WHERE id = ?').run(position.id);
      } else {
        db.prepare('UPDATE fo_positions SET quantity_lots = quantity_lots - ? WHERE id = ?').run(lots, position.id);
      }
    }

    // Record order history
    const order = db.prepare(
      `INSERT INTO fo_orders (user_id, symbol, instrument_type, strike_price, expiry_date, lot_size, quantity_lots, transaction_type, price, total_premium)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).get(userId, symbol.toUpperCase(), instrumentType, strikePrice ?? null, expiryDate, lotSize, lots, transactionType, price, totalPremium) as any;

    res.json({ success: true, order, totalPremium });
  } catch (err: any) {
    console.error('[fo/orders]', err?.message);
    res.status(500).json({ error: 'Order failed' });
  }
});

// ── GET /api/fo/positions ── User's open F&O positions ────────────────────
router.get('/positions', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  try {
    const positions = db.prepare(
      `SELECT * FROM fo_positions WHERE user_id = ? ORDER BY created_at DESC`
    ).all(userId) as any[];

    // Enrich with current price and P&L
    const enriched = await Promise.all(positions.map(async (pos) => {
      let currentPrice = pos.avg_buy_price;
      try {
        const T = timeToExpiryYears(pos.expiry_date);
        if (T > 0 && pos.instrument_type !== 'FUT') {
          const q = await getQuote(pos.symbol, 'NSE');
          if (q) {
            const iv = getBaseIV(pos.symbol);
            const bs = blackScholes(q.price, pos.strike_price, T, RISK_FREE_RATE, iv, pos.instrument_type as 'CE' | 'PE');
            currentPrice = bs.price;
          }
        }
      } catch {}

      const lotSize = pos.lot_size;
      const totalQuantity = pos.quantity_lots * lotSize;
      const pnl = (currentPrice - pos.avg_buy_price) * totalQuantity;
      const pnlPct = pos.avg_buy_price > 0 ? (pnl / (pos.avg_buy_price * totalQuantity)) * 100 : 0;

      return {
        ...pos,
        current_price: currentPrice,
        pnl: Math.round(pnl * 100) / 100,
        pnl_pct: Math.round(pnlPct * 100) / 100,
        total_quantity: totalQuantity,
      };
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load positions' });
  }
});

// ── GET /api/fo/orders ── F&O order history ───────────────────────────────
router.get('/orders', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const orders = db.prepare(
    `SELECT * FROM fo_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
  ).all(userId);
  res.json(orders);
});

export default router;
