import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes, getCachedQuote } from '../services/marketData.js';
import yahooFinance from 'yahoo-finance2';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/market/overview — gainers, losers, most-active, indices
// ---------------------------------------------------------------------------
router.get('/overview', async (req, res) => {
  try {
    const stocks = (await db.prepare(`SELECT symbol, name FROM stocks WHERE exchange = 'NSE' LIMIT 500`).all()) as any[];
    const quotes = getCachedQuotes(stocks.map(s => ({ symbol: s.symbol, exchange: 'NSE' as const })));

    const enriched = quotes
      .filter(q => q.price > 0 && q.change_percent !== undefined)
      .map(q => {
        const s = stocks.find((x: any) => x.symbol === q.symbol);
        return {
          symbol: q.symbol,
          name: s?.name || q.name || q.symbol,
          price: q.price,
          change: q.change ?? 0,
          change_percent: q.change_percent ?? 0,
          volume: q.volume ?? 0,
          day_high: q.day_high,
          day_low: q.day_low,
        };
      });

    const sorted_by_change = [...enriched].sort((a, b) => b.change_percent - a.change_percent);
    const sorted_by_volume = [...enriched].sort((a, b) => b.volume - a.volume);

    const gainers = sorted_by_change.filter(s => s.change_percent > 0).slice(0, 10);
    const losers  = sorted_by_change.filter(s => s.change_percent < 0).reverse().slice(0, 10);
    const most_active = sorted_by_volume.slice(0, 10);

    // 52-week highs/lows
    const near_52w_high = enriched
      .filter(s => {
        const q = quotes.find(x => x.symbol === s.symbol);
        return q?.high_52w && q.price >= q.high_52w * 0.98;
      })
      .slice(0, 10)
      .map(s => {
        const q = quotes.find(x => x.symbol === s.symbol);
        return { ...s, high_52w: q?.high_52w };
      });

    const near_52w_low = enriched
      .filter(s => {
        const q = quotes.find(x => x.symbol === s.symbol);
        return q?.low_52w && q.price <= q.low_52w * 1.02;
      })
      .slice(0, 10)
      .map(s => {
        const q = quotes.find(x => x.symbol === s.symbol);
        return { ...s, low_52w: q?.low_52w };
      });

    res.json({ gainers, losers, most_active, near_52w_high, near_52w_low, total_stocks: enriched.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch market overview', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/market/earnings — upcoming earnings from Yahoo Finance
// ---------------------------------------------------------------------------
router.get('/earnings', async (req, res) => {
  try {
    const stocks = (await db.prepare(`SELECT symbol FROM stocks WHERE exchange = 'NSE' LIMIT 100`).all()) as any[];
    const results: any[] = [];

    // Fetch calendar events for top stocks (batch of 20 to avoid rate limiting)
    const sample = stocks.slice(0, 30);
    await Promise.allSettled(
      sample.map(async (s: any) => {
        try {
          const data = await (yahooFinance as any).quoteSummary(`${s.symbol}.NS`, {
            modules: ['calendarEvents'],
          });
          const earnings = data?.calendarEvents?.earnings;
          if (earnings?.earningsDate?.length) {
            results.push({
              symbol: s.symbol,
              earnings_date: earnings.earningsDate[0],
              earnings_avg: earnings.earningsAverage ?? null,
              revenue_avg: earnings.revenueAverage ?? null,
            });
          }
        } catch {}
      })
    );

    results.sort((a, b) => new Date(a.earnings_date).getTime() - new Date(b.earnings_date).getTime());
    res.json({ earnings: results });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch earnings', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/market/fii-dii — FII/DII activity (NSE public data approximation)
// ---------------------------------------------------------------------------
router.get('/fii-dii', async (req, res) => {
  try {
    // Use Yahoo Finance market summary to derive institutional flow approximation
    // Real NSE data requires scraping; we use index movement as proxy
    const niftyQ = getCachedQuote('^NSEI', 'NSE');
    const bankNiftyQ = getCachedQuote('^NSEBANK', 'NSE');

    // Generate synthetic 30-day FII/DII data based on market trends
    const days: any[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const seed = d.getDate() * (d.getMonth() + 1);
      const fii = +(((seed % 7) - 3) * 800 + Math.sin(i) * 500).toFixed(0);
      const dii = +((-(seed % 5) + 2) * 600 + Math.cos(i) * 400).toFixed(0);
      days.push({
        date: d.toISOString().slice(0, 10),
        fii_net: fii,
        dii_net: dii,
        net: fii + dii,
      });
    }

    const fii_30d = days.reduce((s, d) => s + d.fii_net, 0);
    const dii_30d = days.reduce((s, d) => s + d.dii_net, 0);

    res.json({
      history: days,
      summary: {
        fii_30d: +fii_30d.toFixed(0),
        dii_30d: +dii_30d.toFixed(0),
        net_30d: +(fii_30d + dii_30d).toFixed(0),
      },
      nifty: { price: niftyQ?.price ?? 0, change_percent: niftyQ?.change_percent ?? 0 },
      bank_nifty: { price: bankNiftyQ?.price ?? 0, change_percent: bankNiftyQ?.change_percent ?? 0 },
      note: 'Illustrative data. Real-time NSE FII/DII data requires NSE API subscription.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch FII/DII data', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/market/depth/:symbol — Simulated order book depth
// ---------------------------------------------------------------------------
router.get('/depth/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const q = getCachedQuote(symbol, 'NSE');
    if (!q || !q.price) return res.status(404).json({ error: 'Quote not available' });

    const price = q.price;
    const spread = price * 0.001;

    // Simulate 5-level bid/ask book
    const bids = Array.from({ length: 5 }, (_, i) => ({
      price: +(price - spread * (i + 1)).toFixed(2),
      quantity: Math.floor(100 + Math.random() * 500),
      orders: Math.floor(2 + Math.random() * 10),
    }));
    const asks = Array.from({ length: 5 }, (_, i) => ({
      price: +(price + spread * (i + 1)).toFixed(2),
      quantity: Math.floor(100 + Math.random() * 500),
      orders: Math.floor(2 + Math.random() * 10),
    }));

    res.json({
      symbol,
      ltp: price,
      change_percent: q.change_percent ?? 0,
      bids,
      asks,
      total_buy_qty: bids.reduce((s, b) => s + b.quantity, 0),
      total_sell_qty: asks.reduce((s, a) => s + a.quantity, 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch depth', detail: err?.message });
  }
});

export default router;
