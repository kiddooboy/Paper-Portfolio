// /api/global/* — endpoints dedicated to the US/global trading section.
// Mirrors the shape of the existing India endpoints so the client can reuse
// table/card components with minimal changes.

import { Router } from 'express';
import { db } from '../db/index.js';
import {
  getUsIndices, getCachedUsIndices, getCachedQuotes, isMarketOpen, getAllCachedQuotes,
  US_INDICES,
} from '../services/marketData.js';
import { REGIONS, isRegionOpen, regionStatusLabel } from '../services/regions.js';
import { getUsdInrRate } from '../services/fxService.js';
import { getUpcomingNyseHolidays } from '../services/nyseHolidays.js';
import { getUsMarketNews } from '../services/usNewsService.js';

const router = Router();

// ── GET /api/global/news ── aggregated US market news (5-min cache) ─────────
router.get('/news', async (_req, res) => {
  try {
    const items = await getUsMarketNews();
    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'news fetch failed' });
  }
});

// ── GET /api/global/status — Market status + FX rate (no auth required) ─────
router.get('/status', async (_req, res) => {
  const now = new Date();
  const usOpen = isRegionOpen(REGIONS.US, now);
  const fxRate = await getUsdInrRate().catch(() => 0);
  res.json({
    region: 'US',
    isOpen: usOpen,
    label: regionStatusLabel(REGIONS.US, now),
    pollIntervalMs: usOpen ? 4_000 : 300_000,
    fx: { pair: 'USDINR', rate: fxRate, asOf: Date.now() },
    upcomingHolidays: getUpcomingNyseHolidays(3),
  });
});

// ── GET /api/global/indices ──────────────────────────────────────────────────
// S&P 500, NASDAQ, DJ, VIX, Russell 2000, FTSE 100. Public endpoint.
router.get('/indices', async (_req, res) => {
  // Serve cached first for snappy paint; refresh in the background.
  const cached = getCachedUsIndices();
  if (cached.length === US_INDICES.length) {
    res.json({ indices: cached });
    getUsIndices(false).catch(() => {});
    return;
  }
  try {
    const indices = await getUsIndices(false);
    res.json({ indices });
  } catch {
    res.json({ indices: cached });
  }
});

// ── GET /api/global/list ─────────────────────────────────────────────────────
// Paginated list of US-tradeable equities for the Global Markets browser.
router.get('/list', (req, res) => {
  const q = String(req.query.q || '').trim().toUpperCase();
  const sector = String(req.query.sector || '').trim();
  const exchange = String(req.query.exchange || '').trim().toUpperCase();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let sql = `SELECT symbol, name, exchange, sector, currency FROM stocks WHERE exchange IN ('NASDAQ','NYSE')`;
  const args: any[] = [];
  if (q) { sql += ` AND (symbol LIKE ? OR UPPER(name) LIKE ?)`; args.push(`${q}%`, `%${q}%`); }
  if (sector) { sql += ` AND sector = ?`; args.push(sector); }
  if (exchange === 'NASDAQ' || exchange === 'NYSE') { sql += ` AND exchange = ?`; args.push(exchange); }
  sql += ` ORDER BY symbol ASC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const rows = db.prepare(sql).all(...args) as any[];
  // Enrich with cached live prices
  const items = rows.map((r) => {
    const quotes = getCachedQuotes([{ symbol: r.symbol, exchange: r.exchange as 'NASDAQ' | 'NYSE' }]);
    const q = quotes[0];
    return {
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange,
      sector: r.sector,
      currency: r.currency || 'USD',
      price: q?.price ?? 0,
      change: q?.change ?? 0,
      change_percent: q?.change_percent ?? 0,
      volume: q?.volume ?? 0,
    };
  });
  res.json({ items, limit, offset });
});

// ── GET /api/global/movers ── top gainers / losers ──────────────────────────
router.get('/movers', (_req, res) => {
  const all = Array.from(getAllCachedQuotes().values())
    .filter((q) => (q.exchange === 'NASDAQ' || q.exchange === 'NYSE') && q.price > 0 && Number.isFinite(q.change_percent));

  const gainers = [...all].sort((a, b) => b.change_percent - a.change_percent).slice(0, 15);
  const losers  = [...all].sort((a, b) => a.change_percent - b.change_percent).slice(0, 15);
  const active  = [...all].sort((a, b) => (b.volume * b.price) - (a.volume * a.price)).slice(0, 15);

  res.json({
    gainers: gainers.map((q) => ({ symbol: q.symbol, name: q.name, exchange: q.exchange, price: q.price, change: q.change, change_percent: q.change_percent })),
    losers: losers.map((q) => ({ symbol: q.symbol, name: q.name, exchange: q.exchange, price: q.price, change: q.change, change_percent: q.change_percent })),
    mostActive: active.map((q) => ({ symbol: q.symbol, name: q.name, exchange: q.exchange, price: q.price, change_percent: q.change_percent, volume: q.volume })),
  });
});

// ── GET /api/global/sectors ──────────────────────────────────────────────────
// Aggregate per-GICS-sector % change across our US universe.
router.get('/sectors', (_req, res) => {
  const rows = db.prepare(
    `SELECT symbol, sector FROM stocks WHERE exchange IN ('NASDAQ','NYSE') AND sector IS NOT NULL`
  ).all() as any[];
  const cache = getAllCachedQuotes();
  const buckets = new Map<string, { sum: number; count: number; up: number; down: number }>();
  for (const r of rows) {
    const q = cache.get(`${r.symbol}:NASDAQ`) || cache.get(`${r.symbol}:NYSE`);
    if (!q || q.price <= 0) continue;
    const sec = r.sector;
    if (!buckets.has(sec)) buckets.set(sec, { sum: 0, count: 0, up: 0, down: 0 });
    const b = buckets.get(sec)!;
    b.sum += q.change_percent;
    b.count++;
    if (q.change_percent > 0) b.up++;
    else if (q.change_percent < 0) b.down++;
  }
  const sectors = Array.from(buckets.entries())
    .map(([name, b]) => ({
      name,
      avg_change_percent: b.count ? +(b.sum / b.count).toFixed(2) : 0,
      count: b.count,
      up: b.up,
      down: b.down,
    }))
    .sort((a, b) => b.avg_change_percent - a.avg_change_percent);
  res.json({ sectors });
});

// ── GET /api/global/watchlists ── curated thematic baskets ──────────────────
const CURATED = {
  'Magnificent 7': ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA'],
  'Semis':         ['NVDA','AMD','INTC','AVGO','QCOM','TXN','MU','AMAT','KLAC','LRCX'],
  'AI Stocks':     ['NVDA','MSFT','GOOGL','META','AMD','PLTR','CRM','ORCL','IBM','SMCI'],
  'Banks':         ['JPM','BAC','WFC','C','GS','MS'],
  'Megacap Tech':  ['AAPL','MSFT','GOOGL','AMZN','META'],
};

router.get('/watchlists', (_req, res) => {
  const cache = getAllCachedQuotes();
  const out: Record<string, any[]> = {};
  for (const [name, syms] of Object.entries(CURATED)) {
    out[name] = syms.map((s) => {
      const q = cache.get(`${s}:NASDAQ`) || cache.get(`${s}:NYSE`);
      return {
        symbol: s,
        name: q?.name || s,
        exchange: q?.exchange || 'NASDAQ',
        price: q?.price ?? 0,
        change_percent: q?.change_percent ?? 0,
      };
    });
  }
  res.json({ watchlists: out });
});

export default router;
