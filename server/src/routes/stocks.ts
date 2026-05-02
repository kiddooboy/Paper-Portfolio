import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote, getCachedQuote, getCachedQuotes, getCachedIndices, getHistory, isMarketOpen, getMarketStatus, getSectors, getAllCachedQuotes } from '../services/marketData.js';
import { logActivity, getClientIp } from '../services/activityLogger.js';

const router = Router();

type Exchange = 'NSE' | 'BSE';
function parseExchange(v: any): Exchange {
  return (v === 'BSE' ? 'BSE' : 'NSE');
}

// GET /api/stocks/market-status — market open/closed status + recommended poll interval
router.get('/market-status', (_req, res) => {
  res.json(getMarketStatus());
});

// GET /api/stocks/sectors — sector stats computed from DB stocks + live quote cache
router.get('/sectors', async (_req, res) => {
  try {
    // 1. Get all stocks with their sector from DB
    const dbStocks = db.prepare(
      `SELECT symbol, exchange, sector, market_cap FROM stocks
       WHERE sector IS NOT NULL AND sector != '' ORDER BY symbol`
    ).all() as { symbol: string; exchange: string; sector: string; market_cap: number | null }[];

    // 2. Get all cached live quotes
    const liveQuotes = getAllCachedQuotes();

    // 3. Sector index prices from Yahoo (for reference price)
    const sectorIndices = await getSectors();
    const indexByName: Record<string, typeof sectorIndices[0]> = {};
    for (const si of sectorIndices) indexByName[si.name] = si;

    // Map DB sector names → NSE index names
    const SECTOR_INDEX_MAP: Record<string, string> = {
      'Information Technology':           'IT',
      'Fast Moving Consumer Goods':       'FMCG',
      'Healthcare':                       'Pharma',
      'Automobile and Auto Components':   'Auto',
      'Metals & Mining':                  'Metal',
      'Realty':                           'Realty',
      'Financial Services':               'Finance',
      'Oil Gas & Consumable Fuels':       'Energy',
      'Capital Goods':                    'Infra',
      'Power':                            'Energy',
      'Consumer Durables':                'FMCG',
      'Consumer Services':                'FMCG',
      'Chemicals':                        'IT',
      'Construction':                     'Infra',
      'Construction Materials':           'Infra',
      'Telecommunication':                'IT',
      'Services':                         'Finance',
      'Textiles':                         'FMCG',
      'Media Entertainment & Publication':'IT',
      'Diversified':                      'Finance',
    };

    // 4. Group stocks by sector, compute stats
    const sectorMap = new Map<string, {
      totalStocks: number;
      liveCount: number;
      gainers: number;
      losers: number;
      unchanged: number;
      sumChange: number;
      sumMcap: number;
      weightedChangeSum: number;
    }>();

    for (const stock of dbStocks) {
      const key = `${stock.symbol}:${stock.exchange || 'NSE'}`;
      const altKey = `${stock.symbol}:NSE`;
      const quote = liveQuotes.get(key) || liveQuotes.get(altKey);

      if (!sectorMap.has(stock.sector)) {
        sectorMap.set(stock.sector, { totalStocks: 0, liveCount: 0, gainers: 0, losers: 0, unchanged: 0, sumChange: 0, sumMcap: 0, weightedChangeSum: 0 });
      }
      const s = sectorMap.get(stock.sector)!;
      s.totalStocks++;

      if (quote && quote.price > 0) {
        s.liveCount++;
        s.sumChange += quote.change_percent;
        const mcap = stock.market_cap || 1;
        s.sumMcap += mcap;
        s.weightedChangeSum += quote.change_percent * mcap;
        if (quote.change_percent > 0.01) s.gainers++;
        else if (quote.change_percent < -0.01) s.losers++;
        else s.unchanged++;
      }
    }

    // 5. Build response sorted by avg change desc
    const sectors = Array.from(sectorMap.entries())
      .map(([name, stats]) => {
        const avgChange = stats.liveCount > 0 ? stats.sumChange / stats.liveCount : 0;
        // Weighted avg (by market cap) when data available
        const weightedAvg = stats.sumMcap > 0 ? stats.weightedChangeSum / stats.sumMcap : avgChange;
        const indexName = SECTOR_INDEX_MAP[name];
        const idx = indexName ? indexByName[indexName] : undefined;
        return {
          name,
          displayName: name,
          totalStocks: stats.totalStocks,
          liveCount: stats.liveCount,
          gainers: stats.gainers,
          losers: stats.losers,
          unchanged: stats.unchanged,
          change_percent: +weightedAvg.toFixed(2),
          // Index reference (optional context)
          indexSymbol: idx?.symbol || null,
          indexPrice: idx?.price || null,
          indexChange: idx?.change_percent || null,
        };
      })
      .sort((a, b) => b.change_percent - a.change_percent);

    res.json({ sectors, isOpen: isMarketOpen() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/indices — live NIFTY 50 / SENSEX / BANK NIFTY (public, no auth)
// Cache for 30s while market is open (multiple tabs/users hit this endlessly).
// When market is closed, cache for 5 min.
router.get('/indices', (_req, res) => {
  // Cache-only read: the background poller is the sole source of truth.
  const indices = getCachedIndices();
  const cacheSec = isMarketOpen() ? 30 : 300;
  res.set('Cache-Control', `public, max-age=${cacheSec}`);
  res.json({ indices, isOpen: isMarketOpen() });
});

// GET /api/stocks/live — Bulk live quotes for the frontend polling store
// Returns: Nifty50 basket + user holdings + user watchlist + optional extra symbols
// The full Nifty500 cache is warmed in the background by the server poller.
// This endpoint must be fast (< 500ms) — it runs every 20s from every browser tab.
router.get('/live', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  // 1. User-specific symbols (holdings + watchlist)
  const holdingSymbols = ((await db.prepare(
    'SELECT DISTINCT symbol FROM holdings WHERE user_id = ? AND quantity > 0'
  ).all(userId)) as any[]).map((r) => r.symbol);

  const watchlistSymbols = ((await db.prepare(`
    SELECT DISTINCT wi.symbol FROM watchlist_items wi
    JOIN watchlists w ON w.id = wi.watchlist_id
    WHERE w.user_id = ?
  `).all(userId)) as any[]).map((r) => r.symbol);

  // 2. Extra symbols from query (e.g. terminal page viewing a specific stock)
  const extra = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // 3. Core Nifty50 basket — always included so Dashboard gainers/losers work
  const { NIFTY50 } = await import('../services/marketData.js');

  // Merge all, deduplicate
  const allSymbols = Array.from(
    new Set([...NIFTY50, ...holdingSymbols, ...watchlistSymbols, ...extra])
  );

  // Cache-only read — the background poller (tier1/tier2) keeps the cache
  // warm. User requests must NEVER trigger Yahoo, otherwise rate-limit
  // failures multiply with concurrent users.
  const quotes = getCachedQuotes(
    allSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const }))
  );

  const priceMap: Record<string, any> = {};
  for (const q of quotes) {
    priceMap[q.symbol] = q;
  }

  res.json({
    status: getMarketStatus(),
    quotes: priceMap,
    count: quotes.length,
  });
});


// GET /api/stocks?q=&exchange=&limit=&offset=&live=1
// Returns paginated list of known stocks (from ingested master).
// When `live=1` (default), enriches each row with the current Yahoo Finance quote.
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(String(req.query.page || '1')) || 1, 1);
  const limit = Math.min(parseInt(String(req.query.limit || '20')) || 20, 100);
  const offset = (page - 1) * limit;
  const q = String(req.query.q || '').trim();
  const exchange = req.query.exchange as Exchange;
  const category = req.query.category as string;
  const live = req.query.live === '1' || req.query.live === 'true';

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push('(symbol LIKE ? OR name LIKE ?)');
    const like = `%${String(q)}%`;
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
  
  // Get total count for pagination
  const countResult = (await db.prepare(`SELECT COUNT(*) as total FROM stocks ${whereSql}`).get(...params)) as any;
  const total = Number(countResult?.total ?? 0);
  
  const rows = (await db
    .prepare(`SELECT * FROM stocks ${whereSql} ORDER BY symbol LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)) as any[];

  if (!live || !rows.length) {
    return res.json({ 
      stocks: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  }

  const quotes = getCachedQuotes(
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
      volume: q?.volume ?? Number(r.volume) ?? 0,
      market_cap: q?.market_cap ?? Number(r.market_cap) ?? null,
      pe_ratio: q?.pe_ratio ?? Number(r.pe_ratio) ?? null,
      high_52w: q?.high_52w ?? Number(r.high_52w) ?? null,
      low_52w: q?.low_52w ?? Number(r.low_52w) ?? null,
    };
  });
  res.json({ 
    stocks: enriched,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// GET /api/stocks/search?q=&limit=  (lightweight autocomplete, symbol+name only)
// Restricted to NIFTY 500 stocks only — no external search fallback.
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(String(req.query.limit || '20')) || 20, 50);
  if (!q) return res.json([]);
  const qUp = q.toUpperCase();

  const local = (await db
    .prepare(
      `SELECT symbol, name, exchange FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY CASE WHEN UPPER(symbol) = ? THEN 0 WHEN symbol LIKE ? THEN 1 ELSE 2 END, symbol LIMIT ?`
    )
    .all(`%${q}%`, `%${q}%`, qUp, `${q}%`, limit)) as any[];

  res.json(local);
});


// GET /api/stocks/quote?symbols=RELIANCE,TCS&exchange=NSE (batch live quotes)
router.get('/quote', async (req, res) => {
  const exchange = parseExchange(req.query.exchange);
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) return res.json([]);
  const quotes = getCachedQuotes(symbols.map((s) => ({ symbol: s, exchange })));
  res.json(quotes);
});

async function nifty500Items() {
  const rows = (await db.prepare(`SELECT symbol FROM stocks WHERE exchange = 'NSE'`).all()) as any[];
  return rows.map((r) => ({ symbol: r.symbol, exchange: 'NSE' as const }));
}

// GET /api/stocks/gainers — live from NIFTY 500 universe
router.get('/gainers', async (_req, res) => {
  const quotes = getCachedQuotes(await nifty500Items());
  const gainers = quotes
    .filter((q) => q.change_percent > 0)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, 10);
  res.json(gainers);
});

// GET /api/stocks/losers — live from NIFTY 500 universe
router.get('/losers', async (_req, res) => {
  const quotes = getCachedQuotes(await nifty500Items());
  const losers = quotes
    .filter((q) => q.change_percent < 0)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 10);
  res.json(losers);
});

// GET /api/stocks/trending — largest absolute move in NIFTY 500
router.get('/trending', async (_req, res) => {
  const quotes = getCachedQuotes(await nifty500Items());
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

  const meta = (await db.prepare('SELECT * FROM stocks WHERE symbol = ? AND exchange = ?').get(symbol, exchange)) as any;
  // Try cache first; only fall through to Yahoo if completely missing.
  const cached = getCachedQuote(symbol, exchange);
  const quote = cached.price > 0 ? cached : await getQuote(symbol, exchange);

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
    market_cap: quote?.market_cap ?? meta?.market_cap ?? null,
    pe_ratio: quote?.pe_ratio ?? meta?.pe_ratio ?? null,
    high_52w: quote?.high_52w ?? meta?.high_52w ?? null,
    low_52w: quote?.low_52w ?? meta?.low_52w ?? null,
    eps: quote?.eps ?? meta?.eps ?? null,
    roe: meta?.roe ?? null,
    book_value: meta?.book_value ?? null,
    debt_to_equity: meta?.debt_to_equity ?? null,
    div_yield: meta?.div_yield ?? null,
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
router.post('/:symbol/alert', authMiddleware, async (req: AuthRequest, res) => {
  const { targetPrice, condition } = req.body;
  const symbol = req.params.symbol.toUpperCase();
  const userId = req.user!.id;

  await db.prepare(
    `INSERT INTO price_alerts (user_id, symbol, target_price, condition) VALUES (?, ?, ?, ?)`
  ).run(userId, symbol, targetPrice, condition);

  logActivity(userId, 'PRICE_ALERT_SET', { symbol, targetPrice, condition }, getClientIp(req));

  res.json({ success: true, message: 'Price alert set' });
});

export default router;
