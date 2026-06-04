import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote, getCachedQuote, getCachedQuotes, getCachedIndices, getHistory, isMarketOpen, getMarketStatus, getSectors, getAllCachedQuotes, type ExchangeCode } from '../services/marketData.js';
import { subscribe as subscribeTick, subscribeWithSession, setSessionSymbols } from '../services/tickBroadcast.js';
import { logActivity, getClientIp } from '../services/activityLogger.js';

const router = Router();

type Exchange = ExchangeCode;
function parseExchange(v: any): Exchange {
  const up = String(v || '').toUpperCase();
  if (up === 'BSE') return 'BSE';
  if (up === 'NASDAQ') return 'NASDAQ';
  if (up === 'NYSE') return 'NYSE';
  return 'NSE';
}

// GET /api/stocks/market-status — market open/closed status + recommended poll interval
router.get('/market-status', (_req, res) => {
  res.json(getMarketStatus());
});

// GET /api/stocks/stream — Server-Sent Events feed of live tier1 quotes.
// Augments the existing /live polling: when SSE is connected, clients get
// pushes the moment a tier1 poll finishes (~0 lag vs the 5–10s client poll).
// Quote data is public market info (matches /market-status), so no auth.
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // hint to nginx not to buffer
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  // Initial snapshot so a fresh subscriber doesn't wait up to 4s for data.
  const snap = Array.from(getAllCachedQuotes().values()).filter(q => q && q.price > 0);
  if (snap.length) res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);

  // Optional session id lets a client also subscribe to extra symbols via
  // POST /api/stocks/subscribe so they get folded into tier1's universe.
  const sid = typeof req.query.sid === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(req.query.sid) ? req.query.sid : '';
  const unsubscribe = sid ? subscribeWithSession(sid, res) : subscribeTick(res);
  req.on('close', () => { unsubscribe(); try { res.end(); } catch {} });
});

// POST /api/stocks/subscribe — register the symbols a client is currently
// viewing so they're added to the tier1 polling universe and pushed via SSE.
// Body: { sid: string, symbols: string[] }.
router.post('/subscribe', (req, res) => {
  const sid = String((req.body && req.body.sid) || '');
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : null;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(sid) || !symbols) {
    return res.status(400).json({ error: 'Invalid sid or symbols' });
  }
  const n = setSessionSymbols(sid, symbols);
  res.json({ ok: true, count: n });
});

// GET /api/stocks/sectors — sector stats computed from DB stocks + live quote cache
router.get('/sectors', async (_req, res) => {
  try {
    const EXCLUDED_SECTORS = new Set(['Diversified']);

    // 1. Get all stocks with their sector from DB
    const dbStocks = db.prepare(
      `SELECT symbol, exchange, sector, market_cap FROM stocks
       WHERE sector IS NOT NULL AND sector != '' ORDER BY symbol`
    ).all() as { symbol: string; exchange: string; sector: string; market_cap: number | null }[];
    const filteredStocks = dbStocks.filter((s) => !EXCLUDED_SECTORS.has(s.sector));

    // 2. Get all cached live quotes
    const liveQuotes = getAllCachedQuotes();

    // 3. Sector index prices from Yahoo (for reference price)
    const sectorIndices = await getSectors();
    const indexByName: Record<string, typeof sectorIndices[0]> = {};
    for (const si of sectorIndices) indexByName[si.name] = si;

    // Map DB sector names → NSE sector index keys (20 indices)
    const SECTOR_INDEX_MAP: Record<string, string> = {
      'Information Technology':            'IT',
      'Fast Moving Consumer Goods':        'FMCG',
      'Healthcare':                        'Healthcare',
      'Pharmaceuticals':                   'Pharma',
      'Automobile and Auto Components':    'Auto',
      'Metals & Mining':                   'Metal',
      'Realty':                            'Realty',
      'Financial Services':                'Finance',
      'Banking':                           'Banking',
      'Oil Gas & Consumable Fuels':        'Energy',
      'Capital Goods':                     'Infra',
      'Power':                             'Energy',
      'Consumer Durables':                 'Consumption',
      'Consumer Services':                 'Consumption',
      'Chemicals':                         'Commodities',
      'Construction':                      'Infra',
      'Construction Materials':            'Infra',
      'Telecommunication':                 'Media',
      'Services':                          'Services',
      'Textiles':                          'Consumption',
      'Media Entertainment & Publication': 'Media',
      'Diversified':                       'MNC',
      'Metals':                            'Metal',
      'Mining':                            'Commodities',
      'Agriculture':                       'Commodities',
      'IT Services':                       'IT',
      'Insurance':                         'Finance',
      'Retailing':                         'Consumption',
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

    for (const stock of filteredStocks) {
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

// GET /api/stocks/sectors/:sector/stocks — all stocks in a sector with live quote data
router.get('/sectors/:sector/stocks', async (req, res) => {
  try {
    const sectorName = decodeURIComponent(req.params.sector);
    const rows = db.prepare(
      `SELECT symbol, exchange, name, market_cap FROM stocks
       WHERE sector = ? ORDER BY market_cap DESC NULLS LAST`
    ).all(sectorName) as { symbol: string; exchange: string; name: string; market_cap: number | null }[];

    const liveQuotes = getAllCachedQuotes();
    const stocks = rows.map((row) => {
      const key = `${row.symbol}:${row.exchange || 'NSE'}`;
      const q = liveQuotes.get(key) || liveQuotes.get(`${row.symbol}:NSE`);
      return {
        symbol: row.symbol,
        exchange: row.exchange || 'NSE',
        name: row.name || row.symbol,
        market_cap: row.market_cap,
        price: q?.price ?? null,
        change: q?.change ?? null,
        change_percent: q?.change_percent ?? null,
        volume: q?.volume ?? null,
      };
    });

    res.json({ sector: sectorName, stocks });
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

  // Pull each symbol's exchange from the DB so we route NSE vs NASDAQ vs NYSE correctly.
  const dbRows = allSymbols.length
    ? (db.prepare(
        `SELECT symbol, exchange FROM stocks WHERE symbol IN (${allSymbols.map(() => '?').join(',')})`
      ).all(...allSymbols) as { symbol: string; exchange: string }[])
    : [];

  const exchangeMap = new Map<string, ExchangeCode>();
  for (const row of dbRows) {
    const sym = row.symbol.toUpperCase();
    const current = exchangeMap.get(sym);
    if (!current || row.exchange === 'NSE') {
      exchangeMap.set(sym, row.exchange as ExchangeCode);
    }
  }

  // Cache-only read — the background poller (tier1/tier2) keeps the cache
  // warm. User requests must NEVER trigger Yahoo, otherwise rate-limit
  // failures multiply with concurrent users.
  const quotes = getCachedQuotes(
    allSymbols.map((s) => {
      const sUp = s.toUpperCase();
      let exchange: ExchangeCode = 'NSE';
      if (exchangeMap.has(sUp)) {
        exchange = exchangeMap.get(sUp)!;
      }
      return { symbol: s, exchange };
    })
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

// GET /api/stocks/screener — multi-criteria stock screener (filters + sort + paginate)
// Query params (all optional):
//   sectors=A,B          marketCapMin/Max (in crore)    peMin/Max
//   divYieldMin/Max      roeMin/Max                     priceMin/Max
//   changePctMin/Max     near52wHigh=1   near52wLow=1   (within 5%)
//   sortBy=market_cap|pe_ratio|div_yield|roe|change_percent|price|name
//   sortDir=asc|desc     page=1   limit=25 (max 100)    preset=<key>
router.get('/screener', async (req, res) => {
  try {
    const num = (v: any): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Apply preset (overrides individual params if specified)
    const preset = String(req.query.preset || '').trim();
    const presetFilters: Record<string, any> = {};
    let presetSort: { sortBy?: string; sortDir?: 'asc' | 'desc' } = {};
    switch (preset) {
      case 'large_cap':
        presetFilters.marketCapMin = 50000; // ≥ 50,000 Cr
        presetSort = { sortBy: 'market_cap', sortDir: 'desc' };
        break;
      case 'mid_cap':
        presetFilters.marketCapMin = 10000;
        presetFilters.marketCapMax = 50000;
        presetSort = { sortBy: 'market_cap', sortDir: 'desc' };
        break;
      case 'small_cap':
        presetFilters.marketCapMax = 10000;
        presetSort = { sortBy: 'market_cap', sortDir: 'desc' };
        break;
      case 'low_pe':
        presetFilters.peMax = 15;
        presetFilters.peMin = 0.1; // exclude negative / zero PE
        presetSort = { sortBy: 'pe_ratio', sortDir: 'asc' };
        break;
      case 'high_dividend':
        presetFilters.divYieldMin = 3;
        presetSort = { sortBy: 'div_yield', sortDir: 'desc' };
        break;
      case 'value':
        presetFilters.peMax = 20;
        presetFilters.peMin = 0.1;
        presetFilters.divYieldMin = 2;
        presetSort = { sortBy: 'pe_ratio', sortDir: 'asc' };
        break;
      case 'quality':
        presetFilters.roeMin = 15;
        presetSort = { sortBy: 'roe', sortDir: 'desc' };
        break;
      case '52w_high':
        presetFilters.near52wHigh = true;
        presetSort = { sortBy: 'change_percent', sortDir: 'desc' };
        break;
      case '52w_low':
        presetFilters.near52wLow = true;
        presetSort = { sortBy: 'change_percent', sortDir: 'asc' };
        break;
      case 'top_gainers':
        presetFilters.changePctMin = 0;
        presetSort = { sortBy: 'change_percent', sortDir: 'desc' };
        break;
      case 'top_losers':
        presetFilters.changePctMax = 0;
        presetSort = { sortBy: 'change_percent', sortDir: 'asc' };
        break;
    }

    const sectorsParam = String(req.query.sectors || '').trim();
    const sectors = sectorsParam ? sectorsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Filters from query (preset only fills if not provided)
    const f = {
      marketCapMin: num(req.query.marketCapMin) ?? presetFilters.marketCapMin ?? null,
      marketCapMax: num(req.query.marketCapMax) ?? presetFilters.marketCapMax ?? null,
      peMin:        num(req.query.peMin)        ?? presetFilters.peMin        ?? null,
      peMax:        num(req.query.peMax)        ?? presetFilters.peMax        ?? null,
      divYieldMin:  num(req.query.divYieldMin)  ?? presetFilters.divYieldMin  ?? null,
      divYieldMax:  num(req.query.divYieldMax)  ?? presetFilters.divYieldMax  ?? null,
      roeMin:       num(req.query.roeMin)       ?? presetFilters.roeMin       ?? null,
      roeMax:       num(req.query.roeMax)       ?? presetFilters.roeMax       ?? null,
      priceMin:     num(req.query.priceMin)     ?? null,
      priceMax:     num(req.query.priceMax)     ?? null,
      changePctMin: num(req.query.changePctMin) ?? presetFilters.changePctMin ?? null,
      changePctMax: num(req.query.changePctMax) ?? presetFilters.changePctMax ?? null,
      near52wHigh:  req.query.near52wHigh === '1' || req.query.near52wHigh === 'true' || presetFilters.near52wHigh === true,
      near52wLow:   req.query.near52wLow  === '1' || req.query.near52wLow  === 'true' || presetFilters.near52wLow  === true,
    };

    const validSorts = new Set(['market_cap', 'pe_ratio', 'div_yield', 'roe', 'change_percent', 'price', 'name']);
    const sortBy = (() => {
      const v = String(req.query.sortBy || presetSort.sortBy || 'market_cap');
      return validSorts.has(v) ? v : 'market_cap';
    })();
    const sortDir = (() => {
      const v = String(req.query.sortDir || presetSort.sortDir || 'desc').toLowerCase();
      return v === 'asc' ? 'asc' : 'desc';
    })();

    const page = Math.max(parseInt(String(req.query.page || '1')) || 1, 1);
    const limit = Math.min(parseInt(String(req.query.limit || '25')) || 25, 100);

    // 1. Pull universe from DB (NIFTY 500 ingested rows)
    const rows = (await db
      .prepare(
        `SELECT symbol, name, exchange, sector, market_cap, pe_ratio, high_52w, low_52w, eps,
                roe, book_value, debt_to_equity, div_yield
         FROM stocks WHERE exchange = 'NSE'`
      )
      .all()) as any[];

    // 2. Merge with live cached quotes (live data overrides DB-stored stale numbers)
    const liveQuotes = getAllCachedQuotes();
    const merged = rows.map((r) => {
      const q = liveQuotes.get(`${r.symbol}:${r.exchange || 'NSE'}`) || liveQuotes.get(`${r.symbol}:NSE`);
      const market_cap = (q?.market_cap ?? Number(r.market_cap)) || null;
      const pe_ratio   = (q?.pe_ratio   ?? Number(r.pe_ratio))   || null;
      const high_52w   = (q?.high_52w   ?? Number(r.high_52w))   || null;
      const low_52w    = (q?.low_52w    ?? Number(r.low_52w))    || null;
      // market_cap from Yahoo is in absolute INR; convert to Cr
      const marketCapCr = market_cap ? market_cap / 1e7 : null;
      return {
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        sector: r.sector || null,
        price: q?.price ?? 0,
        change: q?.change ?? 0,
        change_percent: q?.change_percent ?? 0,
        volume: q?.volume ?? null,
        market_cap: marketCapCr,           // in Cr
        pe_ratio,
        high_52w,
        low_52w,
        eps: r.eps != null ? Number(r.eps) : null,
        roe: r.roe != null ? Number(r.roe) : null,
        book_value: r.book_value != null ? Number(r.book_value) : null,
        debt_to_equity: r.debt_to_equity != null ? Number(r.debt_to_equity) : null,
        div_yield: r.div_yield != null ? Number(r.div_yield) : null,
      };
    });

    // 3. Apply filters
    const filtered = merged.filter((s) => {
      if (sectors.length && (!s.sector || !sectors.includes(s.sector))) return false;
      if (f.marketCapMin != null && (s.market_cap == null || s.market_cap < f.marketCapMin)) return false;
      if (f.marketCapMax != null && (s.market_cap == null || s.market_cap > f.marketCapMax)) return false;
      if (f.peMin != null && (s.pe_ratio == null || s.pe_ratio < f.peMin)) return false;
      if (f.peMax != null && (s.pe_ratio == null || s.pe_ratio > f.peMax)) return false;
      if (f.divYieldMin != null && (s.div_yield == null || s.div_yield < f.divYieldMin)) return false;
      if (f.divYieldMax != null && (s.div_yield == null || s.div_yield > f.divYieldMax)) return false;
      if (f.roeMin != null && (s.roe == null || s.roe < f.roeMin)) return false;
      if (f.roeMax != null && (s.roe == null || s.roe > f.roeMax)) return false;
      if (f.priceMin != null && s.price < f.priceMin) return false;
      if (f.priceMax != null && s.price > f.priceMax) return false;
      if (f.changePctMin != null && s.change_percent < f.changePctMin) return false;
      if (f.changePctMax != null && s.change_percent > f.changePctMax) return false;
      if (f.near52wHigh) {
        if (!s.high_52w || !s.price || s.price < s.high_52w * 0.95) return false;
      }
      if (f.near52wLow) {
        if (!s.low_52w || !s.price || s.price > s.low_52w * 1.05) return false;
      }
      return true;
    });

    // 4. Sort
    const dirMul = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      // null values always at end
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dirMul;
      return (av - bv) * dirMul;
    });

    // 5. Paginate
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const stocks = filtered.slice(offset, offset + limit);

    // Available sectors (for filter UI)
    const sectorSet = new Set<string>();
    for (const r of merged) if (r.sector) sectorSet.add(r.sector);
    const availableSectors = Array.from(sectorSet).sort();

    res.json({
      stocks,
      total,
      page,
      totalPages,
      limit,
      sortBy,
      sortDir,
      sectors: availableSectors,
      isOpen: isMarketOpen(),
    });
  } catch (err: any) {
    console.error('[screener] error:', err);
    res.status(500).json({ error: err.message || 'screener failed' });
  }
});

// GET /api/stocks/my-alerts — list active (untriggered) alerts for current user
router.get('/my-alerts', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const alerts = db.prepare(
    `SELECT id, symbol, target_price, condition, condition_type, condition_spec, created_at
     FROM price_alerts WHERE user_id = ? AND triggered = 0
     ORDER BY created_at DESC`
  ).all(userId) as any[];
  res.json(alerts);
});

// DELETE /api/stocks/my-alerts/:id — cancel/delete an alert
router.delete('/my-alerts/:id', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?').run(id, userId);
  res.json({ success: true });
});

// GET /api/stocks/:symbol/fundamentals — screener.in-style deep fundamentals
router.get('/:symbol/fundamentals', async (req, res) => {
  try {
    const { getFundamentals } = await import('../services/fundamentals.js');
    const symbol = req.params.symbol.toUpperCase();
    const exchange = parseExchange(req.query.exchange);
    // getFundamentals is India-only (screener.in) — pin to NSE for US symbols.
    const fundEx: 'NSE' | 'BSE' = exchange === 'BSE' ? 'BSE' : 'NSE';
    const data = await getFundamentals(symbol, fundEx);
    res.set('Cache-Control', 'public, max-age=600');
    res.json(data);
  } catch (err: any) {
    console.error('[fundamentals] error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'failed to load fundamentals' });
  }
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

// GET /api/stocks/:symbol/depth?exchange=NSE — synthetic 5-level market depth
// Yahoo Finance doesn't expose L2 order book, so we generate realistic depth
// from the cached quote (price, volume, day range) with a 2.5s time-bucket seed.
router.get('/:symbol/depth', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const exchange = parseExchange(req.query.exchange);

  if (!isMarketOpen()) return res.json({ closed: true });

  const q = getCachedQuote(symbol, exchange);
  if (!q || q.price <= 0) return res.status(404).json({ error: 'No price data' });

  const price = q.price;
  const volume = q.volume || 1_000_000;

  // NSE tick size
  const tick = price >= 1000 ? 0.5 : price >= 100 ? 0.05 : price >= 10 ? 0.05 : 0.01;

  // LCG seeded by price + time bucket (changes every 2.5s)
  const bucket = Math.floor(Date.now() / 2500);
  let seed = Math.abs(Math.floor((price * 1000 + bucket * 7919) % 2_147_483_647));
  function rand() {
    seed = (seed * 1_664_525 + 1_013_904_223) & 0x7fff_ffff;
    return seed / 0x7fff_ffff;
  }

  // Base lot size proportional to daily volume
  const baseQty = Math.max(100, Math.floor(volume / 15_000));

  const bids = Array.from({ length: 5 }, (_, i) => ({
    price: +(price - (i + 1) * tick).toFixed(2),
    qty:   Math.floor(baseQty * (0.4 + rand() * 2.5)),
  }));

  const asks = Array.from({ length: 5 }, (_, i) => ({
    price: +(price + (i + 1) * tick).toFixed(2),
    qty:   Math.floor(baseQty * (0.4 + rand() * 2.5)),
  }));

  const bidTotal = bids.reduce((acc, b) => acc + b.qty, 0);
  const askTotal = asks.reduce((acc, a) => acc + a.qty, 0);
  const total = bidTotal + askTotal;

  res.json({
    bids,
    asks,
    bidTotal,
    askTotal,
    buyPct:  total > 0 ? +((bidTotal / total) * 100).toFixed(1) : 50,
    sellPct: total > 0 ? +((askTotal / total) * 100).toFixed(1) : 50,
  });
});

// GET /api/stocks/:symbol/history?exchange=NSE&range=3mo&interval=1d
router.get('/:symbol/history', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const exchange = parseExchange(req.query.exchange);
  const range = String(req.query.range || '3mo');
  const interval = (String(req.query.interval || '1d') as '5m' | '15m' | '30m' | '60m' | '1h' | '1d' | '1wk' | '1mo');

  const now = Date.now();
  const rangeMs: Record<string, number> = {
    'today': 7 * 24 * 3600 * 1000,   // for intraday sparkline — last 7 calendar days to ensure weekends/holidays have data
    '1d':  7  * 24 * 3600 * 1000,    // 7 days back so weekends/holidays always have data
    '5d':  14 * 24 * 3600 * 1000,
    '1mo': 35 * 24 * 3600 * 1000,
    '3mo': 95 * 24 * 3600 * 1000,
    '6mo': 185 * 24 * 3600 * 1000,
    '1y':  370 * 24 * 3600 * 1000,
    '5y':  5 * 370 * 24 * 3600 * 1000,
  };
  const period1 = new Date(now - (rangeMs[range] ?? rangeMs['3mo']));

  const history = await getHistory(symbol, exchange, period1, interval as any);
  res.json(history);
});

// POST /api/stocks/:symbol/alert — supports price, pct_move, indicator types
router.post('/:symbol/alert', authMiddleware, (req: AuthRequest, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const userId = req.user!.id;
  const { conditionType, conditionSpec, targetPrice, condition } = req.body || {};

  try {
    // Multi-condition path (pct_move / indicator)
    if (conditionType && conditionType !== 'price') {
      if (!conditionSpec || typeof conditionSpec !== 'object') {
        return res.status(400).json({ error: 'conditionSpec required for non-price alerts' });
      }
      db.prepare(
        `INSERT INTO price_alerts (user_id, symbol, target_price, condition, condition_type, condition_spec)
         VALUES (?, ?, 0, 'above', ?, ?)`
      ).run(userId, symbol, conditionType, JSON.stringify(conditionSpec));
      logActivity(userId, 'PRICE_ALERT_SET', { symbol, conditionType, conditionSpec }, getClientIp(req));
      return res.json({ success: true, message: `${conditionType} alert set` });
    }

    // Legacy price alert
    if (!targetPrice || !['above', 'below'].includes(condition)) {
      return res.status(400).json({ error: 'Valid targetPrice and condition (above/below) required' });
    }
    db.prepare(
      `INSERT INTO price_alerts (user_id, symbol, target_price, condition, condition_type)
       VALUES (?, ?, ?, ?, 'price')`
    ).run(userId, symbol, Number(targetPrice), condition);
    logActivity(userId, 'PRICE_ALERT_SET', { symbol, targetPrice, condition }, getClientIp(req));
    res.json({ success: true, message: 'Price alert set' });
  } catch (err: any) {
    console.error('[alerts] insert error:', err);
    res.status(500).json({ error: 'Failed to save alert' });
  }
});

export default router;
