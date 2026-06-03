import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote, getCachedQuote, isMarketOpen, type ExchangeCode } from '../services/marketData.js';
import { computeCharges } from '../services/fees.js';
import { computeChargesUS } from '../services/fees.us.js';
import { regionFor } from '../services/regions.js';
import { getUsdInrRate } from '../services/fxService.js';
import { pushToUser } from '../services/push.js';
import { z } from 'zod';
import { logActivity, getClientIp } from '../services/activityLogger.js';

// SEBI intraday margin approximation: 20% of trade value (5× leverage)
const MIS_MARGIN_RATE = 0.20;

const router = Router();

const orderSchema = z.object({
  symbol: z.string(),
  exchange: z.enum(['NSE', 'BSE', 'NASDAQ', 'NYSE']).optional(),
  type: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  transactionType: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  stopLossPrice: z.number().positive().optional(),
  productType: z.enum(['CNC', 'MIS', 'DAY', 'GTC']).optional().default('CNC'),
  is_amo: z.boolean().optional().default(false),
  trailingPct: z.number().positive().max(50).optional(),  // % trail for SL/SL-M orders
});

const modifySchema = z.object({
  quantity: z.number().int().positive().optional(),
  limitPrice: z.number().optional(),
  triggerPrice: z.number().optional(),
});

// ── GET /api/orders/day-positions ── ALL of today's trade activity ─────────
// Aggregates orders filled today (IST) per symbol → net open longs / shorts /
// closed round-trips. Resets automatically each day. Independent of holdings
// (so a CNC buy made today shows here even though it lives in holdings).
router.get('/day-positions', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;

  // Use IST date for the "today" cutoff. filled_at is stored as UTC
  // CURRENT_TIMESTAMP — shift to IST (+05:30) before extracting date.
  const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT id, symbol, transaction_type, quantity, price, product_type, filled_at
    FROM orders
    WHERE user_id = ?
      AND status = 'FILLED'
      AND date(datetime(filled_at, '+5 hours', '+30 minutes')) = ?
    ORDER BY filled_at ASC
  `).all(userId, todayIst) as any[];

  // Aggregate buy/sell per symbol+product
  const map = new Map<string, any>();
  for (const o of rows) {
    const key = `${o.symbol}:${o.product_type || 'CNC'}`;
    if (!map.has(key)) {
      map.set(key, {
        symbol: o.symbol, product_type: o.product_type || 'CNC',
        buyQty: 0, buyValue: 0, sellQty: 0, sellValue: 0,
        first_at: o.filled_at, last_at: o.filled_at,
      });
    }
    const e = map.get(key);
    if (o.transaction_type === 'BUY') { e.buyQty += o.quantity;  e.buyValue  += o.quantity * o.price; }
    else                              { e.sellQty += o.quantity; e.sellValue += o.quantity * o.price; }
    e.last_at = o.filled_at;
  }

  const positions: any[] = [];
  for (const e of map.values()) {
    const netQty = e.buyQty - e.sellQty;
    const avgBuy  = e.buyQty  > 0 ? e.buyValue  / e.buyQty  : 0;
    const avgSell = e.sellQty > 0 ? e.sellValue / e.sellQty : 0;
    const q = getCachedQuote(e.symbol, 'NSE');
    const ltp = q && q.price > 0 ? q.price : (avgBuy || avgSell);

    if (netQty > 0) {
      // Open long opened today
      const pnl = (ltp - avgBuy) * netQty;
      const pct = avgBuy > 0 ? ((ltp - avgBuy) / avgBuy) * 100 : 0;
      positions.push({
        symbol: e.symbol, side: 'LONG', status: 'OPEN',
        quantity: netQty, avg_entry_price: +avgBuy.toFixed(2),
        current_price: +ltp.toFixed(2),
        unrealized_pnl: +pnl.toFixed(2),
        unrealized_pnl_pct: +pct.toFixed(2),
        product_type: e.product_type, opened_at: e.first_at,
      });
    } else if (netQty < 0) {
      // Net short (sold from existing holdings more than bought back today)
      const qty = Math.abs(netQty);
      const pnl = (avgSell - ltp) * qty;
      const pct = avgSell > 0 ? ((avgSell - ltp) / avgSell) * 100 : 0;
      positions.push({
        symbol: e.symbol, side: 'SHORT', status: 'OPEN',
        quantity: qty, avg_entry_price: +avgSell.toFixed(2),
        current_price: +ltp.toFixed(2),
        unrealized_pnl: +pnl.toFixed(2),
        unrealized_pnl_pct: +pct.toFixed(2),
        product_type: e.product_type, opened_at: e.first_at,
      });
    } else {
      // Closed intraday round-trip
      const realized = (avgSell - avgBuy) * e.buyQty;
      const pct = avgBuy > 0 ? ((avgSell - avgBuy) / avgBuy) * 100 : 0;
      positions.push({
        symbol: e.symbol, side: 'CLOSED', status: 'CLOSED',
        quantity: e.buyQty, avg_entry_price: +avgBuy.toFixed(2),
        avg_exit_price: +avgSell.toFixed(2),
        realized_pnl: +realized.toFixed(2),
        realized_pnl_pct: +pct.toFixed(2),
        product_type: e.product_type, opened_at: e.first_at, closed_at: e.last_at,
      });
    }
  }

  // Sort: open first (longs then shorts), then closed, newest first within each
  positions.sort((a, b) => {
    const rank = (p: any) => p.status === 'OPEN' ? (p.side === 'LONG' ? 0 : 1) : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return String(b.opened_at).localeCompare(String(a.opened_at));
  });

  res.json({ date: todayIst, positions });
});

// ── GET /api/orders/mis-shorts ── open MIS short positions with live P&L ──
router.get('/mis-shorts', authMiddleware, async (req: AuthRequest, res) => {
  const shorts = db.prepare(
    `SELECT * FROM mis_shorts WHERE user_id = ? ORDER BY opened_at DESC`
  ).all(req.user!.id) as any[];

  const enriched = await Promise.all(shorts.map(async (s) => {
    try {
      const q = await getQuote(s.symbol, 'NSE');
      const currentPrice = q?.price ?? s.avg_entry_price;
      const positionValue  = s.avg_entry_price * s.quantity;
      const unrealizedPnl  = (s.avg_entry_price - currentPrice) * s.quantity;
      const unrealizedPct  = positionValue > 0 ? (unrealizedPnl / positionValue) * 100 : 0;
      return { ...s, current_price: currentPrice, unrealized_pnl: unrealizedPnl, unrealized_pnl_pct: unrealizedPct };
    } catch {
      return { ...s, current_price: s.avg_entry_price, unrealized_pnl: 0, unrealized_pnl_pct: 0 };
    }
  }));

  res.json(enriched);
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, exchange, type, transactionType, quantity, limitPrice, triggerPrice, targetPrice, stopLossPrice, productType, is_amo, trailingPct } = orderSchema.parse(req.body);
    const userId = req.user!.id;
    const ex: ExchangeCode = (exchange ?? 'NSE') as ExchangeCode;
    const region = regionFor(ex);
    const upperSymbol = symbol.toUpperCase();

    // ── US branch: completely separate fill path ────────────────────────────
    // The India side has deep MIS/short/CNC entanglement that doesn't apply to
    // US equities. Branching early keeps both surfaces clean.
    if (region.code === 'US') {
      // Validate product type for US — only DAY / GTC allowed.
      if (productType === 'CNC' || productType === 'MIS') {
        return res.status(400).json({ error: 'CNC and MIS are India-only. Use DAY or GTC for US orders.' });
      }
      return handleUsOrder(req, res, {
        userId, symbol: upperSymbol, exchange: ex as 'NASDAQ' | 'NYSE',
        type, transactionType, quantity,
        limitPrice, triggerPrice, targetPrice, productType: productType as 'DAY' | 'GTC',
      });
    }

    if ((type === 'SL' || type === 'SL-M') && !triggerPrice) {
      return res.status(400).json({ error: 'Trigger price required for SL/SL-M orders' });
    }

    const quote = await getQuote(upperSymbol, ex);
    const hasLivePrice = !!quote && quote.price > 0;

    // The "is this tradable" gate applies only to BUY orders (opening exposure).
    // A SELL is never blocked here — a user must always be able to exit a
    // position they hold, even if the symbol was later delisted or dropped
    // from the stock master. Holdings sufficiency is validated below.
    if (transactionType === 'BUY') {
      const known = db
        .prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`)
        .get(upperSymbol);
      if (!known && !hasLivePrice) {
        return res.status(400).json({ error: 'This symbol is not tradable — no live market data available.' });
      }
    }

    if (!hasLivePrice) {
      return res.status(404).json({
        error: 'Live market data is unavailable for this symbol right now. Please try again in a few seconds.',
      });
    }

    const currentPrice = quote!.price;

    let effectiveType = type;
    let effectiveLimitPrice = limitPrice;
    if (transactionType === 'SELL' && targetPrice && !triggerPrice) {
      effectiveType = 'LIMIT';
      effectiveLimitPrice = targetPrice;
    }

    const orderPrice = (effectiveType === 'MARKET' || effectiveType === 'SL-M')
      ? currentPrice
      : (effectiveLimitPrice || triggerPrice || currentPrice);
    const totalAmount = orderPrice * quantity;
    const marketOpen = isMarketOpen();

    // ── Pre-flight: determine if this is a MIS short sell or cover ──────────
    // Computed outside transaction so flags are available in the fill phase.

    // MIS SHORT SELL: user sells without sufficient holdings
    let isMisShortSell = false;
    if (transactionType === 'SELL' && productType === 'MIS') {
      const holding = db.prepare(
        'SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?'
      ).get(userId, upperSymbol) as any;
      const holdingQty = holding ? Number(holding.quantity) : 0;
      if (holdingQty < quantity) {
        isMisShortSell = true;
      }
    }

    // MIS COVER BUY: user buys to close an open short position
    let isMisCoverBuy = false;
    let existingShort: any = null;
    if (transactionType === 'BUY' && productType === 'MIS') {
      existingShort = db.prepare(
        'SELECT * FROM mis_shorts WHERE user_id = ? AND symbol = ?'
      ).get(userId, upperSymbol) as any;
      if (existingShort && existingShort.quantity >= quantity) {
        isMisCoverBuy = true;
      }
    }

    let orderId = 0;
    let queued = false;
    let filledNow = false;
    try {
      await db.transaction(async () => {
        // ── Balance / holdings checks ──────────────────────────────────────
        if (transactionType === 'BUY' && !isMisCoverBuy) {
          const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
          if (!user) throw new Error('User not found');
          if (Number(user.balance) < totalAmount) throw new Error('Insufficient balance');
        }

        if (transactionType === 'SELL' && !isMisShortSell) {
          const holding = (await db.prepare(
            'SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?'
          ).get(userId, upperSymbol)) as any;
          if (!holding || Number(holding.quantity) < quantity) {
            throw new Error(`You don't own enough shares of ${upperSymbol} to sell`);
          }
        }

        if (isMisShortSell) {
          const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
          if (!user) throw new Error('User not found');
          const marginRequired = totalAmount * MIS_MARGIN_RATE;
          if (Number(user.balance) < marginRequired) {
            throw new Error(`Insufficient margin. Required: ₹${marginRequired.toFixed(2)} (20% of ₹${totalAmount.toFixed(2)})`);
          }
        }

        // Use stopLossPrice as the trigger when the user attached a stop-loss leg
        const _slLeg = stopLossPrice; // reserved for future SL-leg child creation

        // Trailing SL: anchor = the entry/current price the trail follows from.
        // For SELL: anchor walks UP with price; for BUY: anchor walks DOWN.
        const trailAnchor = (trailingPct && trailingPct > 0) ? currentPrice : null;

        const result = await db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, trigger_price, target_price, product_type, is_amo, trailing_pct, trail_anchor, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, upperSymbol, effectiveType, transactionType, quantity, orderPrice,
               effectiveLimitPrice || null, triggerPrice || null, targetPrice || null, productType,
               is_amo ? 1 : 0, trailingPct || null, trailAnchor, 'PENDING');
        void _slLeg;

        orderId = result.lastInsertRowid as number;

        if (!marketOpen) {
          queued = true;
          await db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
            userId,
            `Order Queued: ${transactionType} ${upperSymbol}`,
            `Markets are closed. Your ${effectiveType} ${transactionType} order for ${quantity} ${upperSymbol} share(s) will execute at next market open (9:15 AM IST).`,
          );
          return;
        }

        // ── Fill logic ─────────────────────────────────────────────────────
        if (isMisShortSell && effectiveType === 'MARKET') {
          await fillMisShort(orderId, userId, upperSymbol, quantity, currentPrice);
          filledNow = true;
        } else if (isMisCoverBuy && effectiveType === 'MARKET') {
          await fillMisCover(orderId, userId, upperSymbol, quantity, currentPrice, existingShort);
          filledNow = true;
        } else if (effectiveType === 'MARKET') {
          await fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
          filledNow = true;
        } else {
          // LIMIT/SL orders — check if condition already met
          const conditionMet = checkFillCondition(effectiveType, transactionType, currentPrice, effectiveLimitPrice || null, triggerPrice || null);
          if (conditionMet) {
            if (isMisShortSell) {
              await fillMisShort(orderId, userId, upperSymbol, quantity, currentPrice);
            } else if (isMisCoverBuy) {
              await fillMisCover(orderId, userId, upperSymbol, quantity, currentPrice, existingShort);
            } else {
              await fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
            }
            filledNow = true;
          }
        }
      });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Order failed' });
    }

    const orderSubtype = isMisShortSell ? 'SHORT_SELL' : isMisCoverBuy ? 'COVER_BUY' : transactionType;

    res.json({
      success: true,
      orderId,
      queued,
      isMisShortSell,
      isMisCoverBuy,
      status: queued ? 'PENDING' : (filledNow ? 'FILLED' : 'PENDING'),
      message: queued
        ? 'Markets are closed. Order queued for execution at next market open (9:15 AM IST).'
        : undefined,
    });

    logActivity(userId, transactionType === 'BUY' ? 'BUY_ORDER' : 'SELL_ORDER' as any, {
      orderId, symbol: upperSymbol, type: effectiveType, quantity, price: orderPrice,
      total: totalAmount, queued, productType, targetPrice, orderSubtype,
    }, getClientIp(req));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

function checkFillCondition(
  type: string,
  transactionType: string,
  currentPrice: number,
  limitPrice: number | null,
  triggerPrice: number | null,
): boolean {
  if (type === 'LIMIT') {
    const limit = limitPrice ?? 0;
    return transactionType === 'BUY' ? currentPrice <= limit : currentPrice >= limit;
  }
  if (type === 'SL' || type === 'SL-M') {
    const trigger = triggerPrice ?? 0;
    const triggered = transactionType === 'SELL' ? currentPrice <= trigger : currentPrice >= trigger;
    if (!triggered) return false;
    if (type === 'SL' && limitPrice) {
      return transactionType === 'SELL' ? currentPrice >= limitPrice : currentPrice <= limitPrice;
    }
    return true;
  }
  return false;
}

// ── MIS Short Sell fill ────────────────────────────────────────────────────
async function fillMisShort(
  orderId: number,
  userId: number,
  symbol: string,
  quantity: number,
  price: number,
) {
  const positionValue  = price * quantity;
  const marginToBlock  = positionValue * MIS_MARGIN_RATE; // 20% — Groww-style SEBI intraday margin
  const charges        = computeCharges('SELL', 'MIS', quantity, price);

  // Block margin AND debit sell-side charges (STT, exchange, GST, etc.)
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(marginToBlock + charges.total, userId);

  const existing = db.prepare(
    'SELECT * FROM mis_shorts WHERE user_id = ? AND symbol = ?'
  ).get(userId, symbol) as any;

  if (existing) {
    const newQty    = existing.quantity + quantity;
    const newAvg    = (existing.avg_entry_price * existing.quantity + price * quantity) / newQty;
    const newMargin = existing.margin_blocked + marginToBlock;
    db.prepare(
      'UPDATE mis_shorts SET quantity = ?, avg_entry_price = ?, margin_blocked = ? WHERE id = ?'
    ).run(newQty, newAvg, newMargin, existing.id);
  } else {
    db.prepare(
      'INSERT INTO mis_shorts (user_id, symbol, quantity, avg_entry_price, margin_blocked) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, symbol, quantity, price, marginToBlock);
  }

  db.prepare(`UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);

  db.prepare(
    'INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount, charges, net_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, orderId, symbol, 'SELL', quantity, price, positionValue, JSON.stringify(charges), positionValue - charges.total);

  try {
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
      userId,
      `MIS Short Sell: ${symbol}`,
      `Shorted ${quantity} ${symbol} @ ₹${price.toFixed(2)}. Margin blocked: ₹${marginToBlock.toFixed(2)} (20%) · Charges: ₹${charges.total.toFixed(2)}. Square off before 3:20 PM.`,
    );
  } catch {}
}

// ── MIS Cover Buy fill ─────────────────────────────────────────────────────
async function fillMisCover(
  orderId: number,
  userId: number,
  symbol: string,
  quantity: number,
  coverPrice: number,
  short: any,
) {
  const proRataMargin = (short.margin_blocked / short.quantity) * quantity;
  const charges       = computeCharges('BUY', 'MIS', quantity, coverPrice);
  // Gross P&L from price movement
  const grossPnl = (short.avg_entry_price - coverPrice) * quantity;
  // Net P&L includes the cover-side charges (sell-side charges were already
  // debited at short-open time, so we don't double-count them here).
  const pnl = grossPnl - charges.total;
  const creditToBalance = proRataMargin + grossPnl - charges.total;

  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(creditToBalance, userId);

  if (short.quantity === quantity) {
    db.prepare('DELETE FROM mis_shorts WHERE id = ?').run(short.id);
  } else {
    const newQty = short.quantity - quantity;
    const newMargin = short.margin_blocked - proRataMargin;
    db.prepare(
      'UPDATE mis_shorts SET quantity = ?, margin_blocked = ? WHERE id = ?'
    ).run(newQty, newMargin, short.id);
  }

  // Record realized P&L (buy_price = cover price, sell_price = entry price for shorts)
  db.prepare(
    `INSERT INTO trade_pnl (user_id, symbol, sell_order_id, quantity, buy_price, sell_price, realized_pnl)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, symbol, orderId, quantity, coverPrice, short.avg_entry_price, pnl);

  db.prepare(`UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);

  const grossCover = coverPrice * quantity;
  db.prepare(
    'INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount, charges, net_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, orderId, symbol, 'BUY', quantity, coverPrice, grossCover, JSON.stringify(charges), grossCover + charges.total);

  const pnlStr = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
  try {
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
      userId,
      `Short Covered: ${symbol}`,
      `Covered ${quantity} ${symbol} @ ₹${coverPrice.toFixed(2)} · Charges ₹${charges.total.toFixed(2)} · Realized P&L: ${pnlStr}`,
    );
  } catch {}
}

router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.user!.id;
    const updates = modifySchema.parse(req.body);

    const order = (await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId)) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING') return res.status(400).json({ error: 'Only PENDING orders can be modified' });

    const newQty = updates.quantity ?? order.quantity;
    const newLimitPrice = updates.limitPrice ?? order.limit_price;
    const newTriggerPrice = updates.triggerPrice ?? order.trigger_price;
    const newPrice = newLimitPrice || newTriggerPrice || order.price;

    if (updates.quantity) {
      if (order.transaction_type === 'BUY') {
        const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
        const required = newPrice * newQty;
        if (Number(user.balance) < required) return res.status(400).json({ error: 'Insufficient balance for new quantity' });
      } else {
        const holding = (await db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, order.symbol)) as any;
        if (!holding || Number(holding.quantity) < newQty) return res.status(400).json({ error: 'Insufficient holdings for new quantity' });
      }
    }

    await db.prepare(`
      UPDATE orders SET quantity = ?, price = ?, limit_price = ?, trigger_price = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newQty, newPrice, newLimitPrice || null, newTriggerPrice || null, orderId);

    logActivity(userId, 'MODIFY_ORDER' as any, { orderId, symbol: order.symbol, newQty, newLimitPrice, newTriggerPrice }, getClientIp(req));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

export async function fillOrder(orderId: number, userId: number, symbolRaw: string, transactionType: string, quantity: number, price: number) {
  const symbol = symbolRaw.toUpperCase();
  const totalAmount = price * quantity;

  // Determine product type for fee computation (default CNC if order lookup fails)
  const orderRow = db.prepare('SELECT product_type FROM orders WHERE id = ?').get(orderId) as any;
  const productType: 'CNC' | 'MIS' = orderRow?.product_type === 'MIS' ? 'MIS' : 'CNC';
  const charges = computeCharges(transactionType as 'BUY' | 'SELL', productType, quantity, price);
  const netAmount = transactionType === 'BUY'
    ? totalAmount + charges.total    // BUY: cost = gross + fees
    : totalAmount - charges.total;   // SELL: proceeds = gross − fees

  await db.transaction(async () => {
    if (transactionType === 'BUY') {
      // Cost basis includes charges so unrealised P&L on the leaderboard already
      // reflects fees paid at entry.
      await db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(netAmount, userId);
      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity + quantity;
        const newAvg = ((holding.avg_buy_price * holding.quantity) + netAmount) / newQty;
        await db.prepare('UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?').run(newQty, newAvg, holding.id);
      } else {
        const avgWithCharges = netAmount / quantity;
        await db.prepare('INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)')
          .run(userId, symbol, quantity, avgWithCharges);
      }
    } else {
      await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(netAmount, userId);
      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity - quantity;
        if (newQty <= 0) await db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
        else await db.prepare('UPDATE holdings SET quantity = ? WHERE id = ?').run(newQty, holding.id);
        // Realized P&L is net of sell-side charges (buy charges already in avg cost)
        const realizedPnl = (price - holding.avg_buy_price) * quantity - charges.total;
        await db.prepare(`
          INSERT INTO trade_pnl (user_id, symbol, sell_order_id, quantity, buy_price, sell_price, realized_pnl)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, symbol, orderId, quantity, holding.avg_buy_price, price, realizedPnl);
      }
    }

    await db.prepare(`
      INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount, charges, net_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orderId, symbol, transactionType, quantity, price, totalAmount, JSON.stringify(charges), netAmount);

    await db.prepare(`UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);

    // OCO (one-cancels-other): if this is a bracket leg (take-profit / stop-loss),
    // cancel its sibling so a filled target doesn't leave a stale stop-loss
    // pending (and vice-versa).
    const filledMeta = db.prepare('SELECT parent_order_id FROM orders WHERE id = ?').get(orderId) as any;
    if (filledMeta?.parent_order_id) {
      await db.prepare(
        `UPDATE orders SET status = 'CANCELLED' WHERE parent_order_id = ? AND id != ? AND status = 'PENDING'`,
      ).run(filledMeta.parent_order_id, orderId);
    }

    let targetNote = '';
    if (transactionType === 'BUY') {
      const parentOrder = db.prepare('SELECT target_price, trigger_price, product_type FROM orders WHERE id = ?').get(orderId) as any;
      if (parentOrder?.target_price) {
        db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, product_type, parent_order_id, status)
          VALUES (?, ?, 'LIMIT', 'SELL', ?, ?, ?, ?, ?, 'PENDING')
        `).run(userId, symbol, quantity, parentOrder.target_price, parentOrder.target_price, parentOrder.product_type || 'CNC', orderId);
        targetNote += ` · Take-profit SELL @ ₹${Number(parentOrder.target_price).toFixed(2)}`;
      }
      if (parentOrder?.trigger_price && parentOrder.target_price) {
        db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, trigger_price, product_type, parent_order_id, status)
          VALUES (?, ?, 'SL-M', 'SELL', ?, ?, ?, ?, ?, 'PENDING')
        `).run(userId, symbol, quantity, parentOrder.trigger_price, parentOrder.trigger_price, parentOrder.product_type || 'CNC', orderId);
        targetNote += ` · Stop-loss SELL @ ₹${Number(parentOrder.trigger_price).toFixed(2)}`;
      }
    }

    const fillTitle = `Order Filled: ${transactionType} ${symbol}`;
    const fillMsg = `Your ${transactionType} order for ${quantity} shares of ${symbol} has been executed at ₹${price.toFixed(2)}${targetNote}`;
    try {
      db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(userId, fillTitle, fillMsg);
    } catch {}
    pushToUser(userId, fillTitle, fillMsg, { type: 'order', symbol }).catch(() => {});
  });
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  // Join the executed transaction (if any) so the response carries the
  // realised fee breakdown for each filled order.
  const orders = await db.prepare(`
    SELECT o.*, t.charges AS charges, t.net_amount AS net_amount
    FROM orders o
    LEFT JOIN transactions t ON t.order_id = o.id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user!.id);
  res.json(orders);
});

router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  const orderId = parseInt(req.params.id);
  const userId = req.user!.id;

  const order = (await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId)) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'PENDING') return res.status(400).json({ error: 'Order already processed' });

  await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
  logActivity(userId, 'CANCEL_ORDER', { orderId, symbol: order.symbol, type: order.type }, getClientIp(req));
  res.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────────
// US order flow — separate from the India path so MIS/CNC logic stays clean.
// ────────────────────────────────────────────────────────────────────────────

interface UsOrderInput {
  userId: number;
  symbol: string;
  exchange: 'NASDAQ' | 'NYSE';
  type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  limitPrice?: number;
  triggerPrice?: number;
  targetPrice?: number;
  productType: 'DAY' | 'GTC';
}

async function handleUsOrder(_req: AuthRequest, res: any, input: UsOrderInput) {
  const { userId, symbol, exchange, type, transactionType, quantity, limitPrice, triggerPrice, productType } = input;

  if ((type === 'SL' || type === 'SL-M') && !triggerPrice) {
    return res.status(400).json({ error: 'Trigger price required for SL/SL-M orders' });
  }

  const quote = await getQuote(symbol, exchange);
  if (!quote || quote.price <= 0) {
    return res.status(404).json({ error: 'Live US market data is unavailable for this symbol right now.' });
  }

  // Verify the symbol is in our universe (only enforced for BUY).
  if (transactionType === 'BUY') {
    const known = db.prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange IN ('NASDAQ','NYSE') LIMIT 1`).get(symbol);
    if (!known) {
      return res.status(400).json({ error: 'This US symbol is not in the tradeable universe.' });
    }
  }

  const usdPrice = quote.price;
  const effectiveType = type;
  const effectiveLimitPrice = limitPrice;
  const orderUsdPrice = (effectiveType === 'MARKET' || effectiveType === 'SL-M')
    ? usdPrice
    : (effectiveLimitPrice || triggerPrice || usdPrice);

  // Lock the FX rate at submission. Order math (debit/credit, charges) all
  // uses this rate so the user sees a single deterministic ₹ amount.
  const fxRate = await getUsdInrRate();
  const inrPrice = orderUsdPrice * fxRate;
  const inrTotal = inrPrice * quantity;
  const usCharges = computeChargesUS(transactionType, productType, quantity, orderUsdPrice);
  const inrCharges = {
    brokerage: usCharges.brokerage * fxRate,
    stt: 0,
    exchange: usCharges.exchange * fxRate,
    sebi: usCharges.sebi * fxRate,
    gst: 0,
    stamp: 0,
    dp: 0,
    total: usCharges.total * fxRate,
  };

  const usMarketOpen = isMarketOpen(exchange);

  let orderId = 0;
  let queued = false;
  let filledNow = false;

  try {
    await db.transaction(async () => {
      // Balance check (wallet stays in ₹)
      if (transactionType === 'BUY') {
        const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
        if (!user) throw new Error('User not found');
        if (Number(user.balance) < inrTotal + inrCharges.total) throw new Error('Insufficient balance');
      } else {
        const holding = (await db.prepare('SELECT quantity, currency FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
        if (!holding || Number(holding.quantity) < quantity) throw new Error(`You don't own enough shares of ${symbol} to sell`);
      }

      const result = await db.prepare(`
        INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, trigger_price, target_price, product_type, is_amo, status, currency, price_native, fx_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', 'USD', ?, ?)
      `).run(userId, symbol, effectiveType, transactionType, quantity, inrPrice,
             effectiveLimitPrice != null ? effectiveLimitPrice * fxRate : null,
             triggerPrice != null ? triggerPrice * fxRate : null,
             input.targetPrice != null ? input.targetPrice * fxRate : null,
             productType, orderUsdPrice, fxRate);
      orderId = result.lastInsertRowid as number;

      if (!usMarketOpen) {
        queued = true;
        await db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
          userId,
          `Order Queued: ${transactionType} ${symbol}`,
          `US markets are closed. Your ${effectiveType} ${transactionType} order for ${quantity} ${symbol} share(s) will execute at next US market open (9:30 AM ET).`,
        );
        return;
      }

      if (effectiveType === 'MARKET') {
        await fillOrderUS(orderId, userId, symbol, exchange, transactionType, quantity, orderUsdPrice, fxRate);
        filledNow = true;
      } else {
        // LIMIT/SL — same condition check as IN side, but on USD prices.
        const conditionMet = checkFillCondition(effectiveType, transactionType, usdPrice, effectiveLimitPrice ?? null, triggerPrice ?? null);
        if (conditionMet) {
          await fillOrderUS(orderId, userId, symbol, exchange, transactionType, quantity, orderUsdPrice, fxRate);
          filledNow = true;
        }
      }
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Order failed' });
  }

  res.json({
    success: true,
    orderId,
    queued,
    status: queued ? 'PENDING' : (filledNow ? 'FILLED' : 'PENDING'),
    region: 'US',
    fxRate,
    inrTotal,
    message: queued ? 'US markets are closed. Order queued for next session.' : undefined,
  });
}

/** US order fill — stores USD natively, debits/credits in ₹ at the locked FX rate. */
export async function fillOrderUS(
  orderId: number,
  userId: number,
  symbol: string,
  exchange: 'NASDAQ' | 'NYSE',
  transactionType: 'BUY' | 'SELL',
  quantity: number,
  usdPrice: number,
  fxRate: number,
) {
  const inrPrice = usdPrice * fxRate;
  const inrTotal = inrPrice * quantity;
  const orderRow = db.prepare('SELECT product_type FROM orders WHERE id = ?').get(orderId) as any;
  const productType: 'DAY' | 'GTC' = orderRow?.product_type === 'GTC' ? 'GTC' : 'DAY';
  const usCharges = computeChargesUS(transactionType, productType, quantity, usdPrice);
  const inrChargesTotal = usCharges.total * fxRate;
  const netInr = transactionType === 'BUY' ? inrTotal + inrChargesTotal : inrTotal - inrChargesTotal;

  await db.transaction(async () => {
    if (transactionType === 'BUY') {
      await db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(netInr, userId);
      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity + quantity;
        const newAvgInr = ((Number(holding.avg_buy_price) * holding.quantity) + netInr) / newQty;
        const newAvgUsd = ((Number(holding.avg_price_native || usdPrice) * holding.quantity) + usdPrice * quantity) / newQty;
        await db.prepare('UPDATE holdings SET quantity = ?, avg_buy_price = ?, avg_price_native = ?, currency = ? WHERE id = ?')
          .run(newQty, newAvgInr, newAvgUsd, 'USD', holding.id);
      } else {
        const avgInr = netInr / quantity;
        await db.prepare('INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price, avg_price_native, currency) VALUES (?, ?, ?, ?, ?, ?)')
          .run(userId, symbol, quantity, avgInr, usdPrice, 'USD');
      }
    } else {
      await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(netInr, userId);
      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity - quantity;
        if (newQty <= 0) await db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
        else await db.prepare('UPDATE holdings SET quantity = ? WHERE id = ?').run(newQty, holding.id);
        const realizedPnlInr = (inrPrice - Number(holding.avg_buy_price)) * quantity - inrChargesTotal;
        await db.prepare(`
          INSERT INTO trade_pnl (user_id, symbol, sell_order_id, quantity, buy_price, sell_price, realized_pnl)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, symbol, orderId, quantity, Number(holding.avg_buy_price), inrPrice, realizedPnlInr);
      }
    }

    const inrChargesJson = JSON.stringify({
      brokerage: usCharges.brokerage * fxRate,
      stt: 0, gst: 0, stamp: 0, dp: 0,
      exchange: usCharges.exchange * fxRate,
      sebi: usCharges.sebi * fxRate,
      total: inrChargesTotal,
      _native: { currency: 'USD', fxRate, ...usCharges },
    });
    await db.prepare(`
      INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount, charges, net_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orderId, symbol, transactionType, quantity, inrPrice, inrTotal, inrChargesJson, netInr);

    await db.prepare(`UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);

    const title = `Order Filled: ${transactionType} ${symbol}`;
    const msg = `${quantity} ${symbol} @ $${usdPrice.toFixed(2)} (₹${inrPrice.toFixed(2)} @ ₹${fxRate.toFixed(2)}/$ locked)`;
    try {
      db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(userId, title, msg);
    } catch {}
    pushToUser(userId, title, msg, { type: 'order', symbol, region: 'US' }).catch(() => {});
  });
  void exchange; // exchange currently informational; reserved for venue-specific extensions
}

export default router;
