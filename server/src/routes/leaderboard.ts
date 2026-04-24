import { Router } from 'express';
import { db } from '../db/index.js';
import { getQuotes } from '../services/marketData.js';

const router = Router();

router.get('/', async (req, res) => {
  const users = db.prepare('SELECT id, name, balance FROM users').all() as any[];
  const holdings = db.prepare(`
    SELECT h.user_id, h.symbol, h.quantity, h.avg_buy_price
    FROM holdings h
  `).all() as any[];

  const uniqueSymbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  const quotes = uniqueSymbols.length
    ? await getQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })))
    : [];
  const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

  const leaderboard = users.map(u => {
    const userHoldings = holdings.filter(h => h.user_id === u.id);
    let portfolioValue = u.balance;
    let invested = 0;
    let current = 0;
    for (const h of userHoldings) {
      const price = priceMap.get(h.symbol) ?? h.avg_buy_price;
      invested += h.avg_buy_price * h.quantity;
      current += price * h.quantity;
      portfolioValue += price * h.quantity;
    }
    const pnl = current - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    return {
      userId: u.id,
      name: u.name,
      portfolioValue,
      totalPnl: pnl,
      pnlPercent: Number(pnlPercent.toFixed(2)),
    };
  });

  leaderboard.sort((a, b) => b.pnlPercent - a.pnlPercent);
  const ranked = leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
  res.json(ranked.slice(0, 10));
});

export default router;
