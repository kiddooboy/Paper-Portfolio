import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';

const router = Router();

router.get('/', async (req, res) => {
  const users = (await db.prepare("SELECT id, name, balance FROM users WHERE role != 'admin' OR role IS NULL").all()) as any[];
  const holdings = (await db.prepare(`
    SELECT h.user_id, h.symbol, h.quantity, h.avg_buy_price
    FROM holdings h
  `).all()) as any[];

  const uniqueSymbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  const quotes = uniqueSymbols.length
    ? getCachedQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })))
    : [];
  const priceMap = new Map(quotes.map((q) => [q.symbol, q]));

  const leaderboard = users.map(u => {
    const userHoldings = holdings.filter(h => h.user_id === u.id);
    let portfolioValue = u.balance;
    let invested = 0;
    let current = 0;
    let dayPnl = 0;

    for (const h of userHoldings) {
      const q = priceMap.get(h.symbol);
      const price = q?.price ?? h.avg_buy_price;
      invested += h.avg_buy_price * h.quantity;
      current += price * h.quantity;
      portfolioValue += price * h.quantity;
      dayPnl += (q?.change ?? 0) * h.quantity;
    }

    const pnl = current - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    const dayPnlPercent = (current - dayPnl) > 0 ? (dayPnl / (current - dayPnl)) * 100 : 0;

    return {
      userId: u.id,
      name: u.name,
      portfolioValue,
      totalPnl: pnl,
      pnlPercent: Number(pnlPercent.toFixed(2)),
      dayPnl: Number(dayPnl.toFixed(2)),
      dayPnlPercent: Number(dayPnlPercent.toFixed(2)),
    };
  });

  leaderboard.sort((a, b) => b.pnlPercent - a.pnlPercent);
  const ranked = leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
  res.json(ranked.slice(0, 10));
});

// Public holdings snapshot for a leaderboard user
router.get('/:userId/holdings', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user' });

  const holdings = (await db.prepare(
    `SELECT h.symbol, h.quantity, h.avg_buy_price, s.name as stock_name
     FROM holdings h
     LEFT JOIN stocks s ON s.symbol = h.symbol
     WHERE h.user_id = ?`
  ).all(userId)) as any[];

  const quotes = holdings.length
    ? getCachedQuotes(holdings.map((h) => ({ symbol: h.symbol, exchange: 'NSE' as const })))
    : [];
  const priceMap = new Map(quotes.map((q) => [q.symbol, q]));

  const result = holdings.map((h) => {
    const q = priceMap.get(h.symbol);
    const price = q?.price ?? h.avg_buy_price;
    const pnl = (price - h.avg_buy_price) * h.quantity;
    const pnlPct = h.avg_buy_price > 0 ? ((price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;
    return {
      symbol: h.symbol,
      name: h.stock_name || h.symbol,
      quantity: h.quantity,
      avgPrice: h.avg_buy_price,
      ltp: price,
      pnl: Number(pnl.toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(2)),
    };
  });

  result.sort((a, b) => b.pnlPct - a.pnlPct);
  res.json(result);
});

export default router;
