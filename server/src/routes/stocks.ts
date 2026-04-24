import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote, getQuotes, getHistory, searchSymbols, NIFTY50, isMarketOpen, getMarketStatus } from '../services/marketData.js';

const router = Router();

type Exchange = 'NSE' | 'BSE';
function parseExchange(v: any): Exchange {
  return (v === 'BSE' ? 'BSE' : 'NSE');
}

// GET /api/stocks/market-status — market open/closed status + recommended poll interval
router.get('/market-status', (_req, res) => {
  res.json(getMarketStatus());
});

// GET /api/stocks/live — Bulk live quotes for all user-relevant symbols
// Merges: user holdings + watchlist items + Nifty50 basket + optional extra symbols
// Returns a flat map { [symbol]: Quote } for easy client-side lookups
router.get('/live', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  // Collect all symbols this user cares about
  const holdingSymbols = (db.prepare('SELECT DISTINCT symbol FROM holdings WHERE user_id = ? AND quantity > 0').all(userId) as any[]).map(r => r.symbol);
  const watchlistSymbols = (db.prepare(`
    SELECT DISTINCT wi.symbol FROM watchlist_items wi
    JOIN watchlists w ON w.id = wi.watchlist_id
    WHERE w.user_id = ?
  `).all(userId) as any[]).map(r => r.symbol);

  // Also include extra symbols from query (e.g. terminal page viewing)
  const extra = String(req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  const allSymbols = Array.from(new Set([...holdingSymbols, ...watchlistSymbols, ...extra, ...NIFTY50]));

  const quotes = await getQuotes(allSymbols.map(s => ({ symbol: s, exchange: 'NSE' as const })));
  const priceMap: Record<string, any> = {};
  for (const q of quotes) {
    priceMap[q.symbol] = q;
  }

  const status = getMarketStatus();
  res.json({ status, quotes: priceMap, count: quotes.length });
});

// GET /api/stocks?q=&exchange=&limit=&offset=&live=1
// Returns paginated list of known stocks (from ingested master).
// When `live=1` (default), enriches each row with the current Yahoo Finance quote.
router.get('/', async (req, res) => {
  const { q, exchange, category } = req.query;
  const live = String(req.query.live ?? '1') !== '0';
  const limit = Math.min(parseInt(String(req.query.limit || '30')) || 30, 100);
  const offset = parseInt(String(req.query.offset || '0')) || 0;

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push('(symbol LIKE ? OR name LIKE ?)');
    const like = `%${String(q).toUpperCase()}%`;
    params.push(like, like);
  }
  if (exchange) {
    where.push('exchange = ?');
    params.push(String(exchange).toUpperCase());
  }
  if (category) {
    where.push('category = ?');
    params.push(String(category));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM stocks ${whereSql} ORDER BY symbol LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as any[];

  if (!live || !rows.length) return res.json(rows);

  const quotes = await getQuotes(
    rows.map((r) => ({ symbol: r.symbol, exchange: r.exchange as Exchange }))
  );
  const qMap = new Map(quotes.map((q) => [`${q.symbol}:${q.exchange}`, q]));
  const enriched = rows.map((r) => {
    const q = qMap.get(`${r.symbol}:${r.exchange}`);
    return {
      ...r,
      price: q?.price ?? 0,
      change: q?.change ?? 0,
      change_percent: q?.change_percent ?? 0,
      day_high: q?.day_high,
      day_low: q?.day_low,
      volume: q?.volume ?? r.volume,
      market_cap: q?.market_cap ?? r.market_cap,
      pe_ratio: q?.pe_ratio ?? r.pe_ratio,
      high_52w: q?.high_52w ?? r.high_52w,
      low_52w: q?.low_52w ?? r.low_52w,
    };
  });
  res.json(enriched);
});

// GET /api/stocks/search?q=&limit=  (lightweight autocomplete, symbol+name only)
// Merges local DB results with Yahoo Finance search as a fallback so any
// NSE/BSE stock is discoverable even if not in the local master.
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').toUpperCase();
  const limit = Math.min(parseInt(String(req.query.limit || '20')) || 20, 50);
  if (!q) return res.json([]);

  const local = db
    .prepare(
      `SELECT symbol, name, exchange FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY
         CASE WHEN symbol = ? THEN 0
              WHEN symbol LIKE ? THEN 1
              ELSE 2 END,
         symbol
         LIMIT ?`
    )
    .all(`%${q}%`, `%${q}%`, q, `${q}%`, limit) as any[];

  if (local.length >= limit) return res.json(local);

  const remote = await searchSymbols(q, limit - local.length);
  const seen = new Set(local.map((r) => `${r.symbol}:${r.exchange}`));
  const merged = [...local];
  for (const r of remote) {
    const key = `${r.symbol}:${r.exchange}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  res.json(merged.slice(0, limit));
});

// GET /api/stocks/quote?symbols=RELIANCE,TCS&exchange=NSE (batch live quotes)
router.get('/quote', async (req, res) => {
  const exchange = parseExchange(req.query.exchange);
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) return res.json([]);
  const quotes = await getQuotes(symbols.map((s) => ({ symbol: s, exchange })));
  res.json(quotes);
});

// GET /api/stocks/gainers — live from Nifty50 basket
router.get('/gainers', async (_req, res) => {
  const quotes = await getQuotes(NIFTY50.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
  const gainers = quotes
    .filter((q) => q.change_percent > 0)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, 10);
  res.json(gainers);
});

// GET /api/stocks/losers — live from Nifty50 basket
router.get('/losers', async (_req, res) => {
  const quotes = await getQuotes(NIFTY50.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
  const losers = quotes
    .filter((q) => q.change_percent < 0)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 10);
  res.json(losers);
});

// GET /api/stocks/trending — largest absolute move in Nifty50
router.get('/trending', async (_req, res) => {
  const quotes = await getQuotes(NIFTY50.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
  const trending = quotes
    .slice()
    .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
    .slice(0, 10);
  res.json(trending);
});

// GET /api/stocks/:symbol?exchange=NSE — full quote + metadata
router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const exchange = parseExchange(req.query.exchange);

  const meta = db.prepare('SELECT * FROM stocks WHERE symbol = ? AND exchange = ?').get(symbol, exchange) as any;
  const quote = await getQuote(symbol, exchange);

  if (!quote && !meta) return res.status(404).json({ error: 'Stock not found' });

  res.json({
    symbol,
    exchange,
    name: quote?.name || meta?.name || symbol,
    sector: meta?.sector || null,
    isin: meta?.isin || null,
    about: meta?.about || null,
    price: quote?.price ?? 0,
    change: quote?.change ?? 0,
    change_percent: quote?.change_percent ?? 0,
    previous_close: quote?.previous_close ?? 0,
    day_high: quote?.day_high ?? 0,
    day_low: quote?.day_low ?? 0,
    volume: quote?.volume ?? 0,
    market_cap: quote?.market_cap,
    pe_ratio: quote?.pe_ratio,
    high_52w: quote?.high_52w,
    low_52w: quote?.low_52w,
    eps: quote?.eps,
    currency: quote?.currency || 'INR',
  });
});

// GET /api/stocks/:symbol/history?exchange=NSE&range=3mo&interval=1d
router.get('/:symbol/history', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const exchange = parseExchange(req.query.exchange);
  const range = String(req.query.range || '3mo');
  const interval = (String(req.query.interval || '1d') as '1d' | '1h' | '1wk' | '1mo');

  const now = Date.now();
  const rangeMs: Record<string, number> = {
    '1d': 1 * 24 * 3600 * 1000,
    '5d': 5 * 24 * 3600 * 1000,
    '1mo': 30 * 24 * 3600 * 1000,
    '3mo': 90 * 24 * 3600 * 1000,
    '6mo': 180 * 24 * 3600 * 1000,
    '1y': 365 * 24 * 3600 * 1000,
    '5y': 5 * 365 * 24 * 3600 * 1000,
  };
  const period1 = new Date(now - (rangeMs[range] ?? rangeMs['3mo']));

  const history = await getHistory(symbol, exchange, period1, interval);
  res.json(history);
});

// POST /api/stocks/:symbol/alert — (unchanged)
router.post('/:symbol/alert', authMiddleware, (req: AuthRequest, res) => {
  const { targetPrice, condition } = req.body;
  const symbol = req.params.symbol.toUpperCase();
  const userId = req.user!.id;

  db.prepare(
    `INSERT INTO price_alerts (user_id, symbol, target_price, condition) VALUES (?, ?, ?, ?)`
  ).run(userId, symbol, targetPrice, condition);

  res.json({ success: true, message: 'Price alert set' });
});

export default router;
