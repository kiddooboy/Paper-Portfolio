import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';

const router = Router();

const STARTING_CAPITAL = 100000; // ₹1,00,000 — every user starts here

router.get('/', async (req, res) => {
  const users = (await db.prepare("SELECT id, name, balance FROM users WHERE role != 'admin' OR role IS NULL").all()) as any[];
  const holdings = (await db.prepare(`
    SELECT h.user_id, h.symbol, h.quantity, h.avg_buy_price
    FROM holdings h
  `).all()) as any[];

  // Realized P&L (all-time)
  const realizedAll = (await db.prepare(`
    SELECT user_id, COALESCE(SUM(realized_pnl), 0) as realized, COUNT(*) as closed_trades
    FROM trade_pnl
    GROUP BY user_id
  `).all()) as any[];
  const realizedMap = new Map(realizedAll.map((r: any) => [r.user_id, { realized: Number(r.realized), closedTrades: Number(r.closed_trades) }]));

  // Realized P&L closed TODAY (for today's P&L)
  const realizedToday = (await db.prepare(`
    SELECT user_id, COALESCE(SUM(realized_pnl), 0) as realized_today
    FROM trade_pnl
    WHERE date(closed_at) = date('now')
    GROUP BY user_id
  `).all()) as any[];
  const realizedTodayMap = new Map(realizedToday.map((r: any) => [r.user_id, Number(r.realized_today)]));

  // Total trade count (all transactions for activity insight)
  const txnCounts = (await db.prepare(`
    SELECT user_id, COUNT(*) as total_txns
    FROM transactions
    GROUP BY user_id
  `).all()) as any[];
  const txnCountMap = new Map(txnCounts.map((r: any) => [r.user_id, Number(r.total_txns)]));

  // Quote map
  const uniqueSymbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  const quotes = uniqueSymbols.length
    ? getCachedQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })))
    : [];
  const priceMap = new Map(quotes.map((q) => [q.symbol, q]));

  const leaderboard = users.map(u => {
    const userHoldings = holdings.filter(h => h.user_id === u.id);
    let invested = 0;
    let current = 0;
    let dayPnlHoldings = 0;

    for (const h of userHoldings) {
      const q = priceMap.get(h.symbol);
      const price = q?.price ?? h.avg_buy_price;
      invested += h.avg_buy_price * h.quantity;
      current += price * h.quantity;
      dayPnlHoldings += (q?.change ?? 0) * h.quantity;
    }

    const portfolioValue = u.balance + current;
    const realizedTotal = realizedMap.get(u.id)?.realized ?? 0;
    const closedTrades = realizedMap.get(u.id)?.closedTrades ?? 0;
    const realizedTodayVal = realizedTodayMap.get(u.id) ?? 0;
    const totalTxns = txnCountMap.get(u.id) ?? 0;

    // Unrealized P&L (current holdings vs cost)
    const unrealizedPnl = current - invested;

    // Overall P&L = realized (closed trades) + unrealized (open holdings)
    const overallPnl = realizedTotal + unrealizedPnl;
    // % return is on the level playing field of starting capital ₹1L
    const overallPnlPercent = (overallPnl / STARTING_CAPITAL) * 100;

    // Today's P&L = day change of held positions + trades closed today
    const todayPnl = dayPnlHoldings + realizedTodayVal;
    // Today's % uses yesterday's holdings value as the base
    const yesterdayHoldingsValue = current - dayPnlHoldings;
    const todayPnlPercent = yesterdayHoldingsValue > 0
      ? (todayPnl / yesterdayHoldingsValue) * 100
      : 0;

    return {
      userId: u.id,
      name: u.name,
      portfolioValue: +portfolioValue.toFixed(2),
      cashBalance: +u.balance.toFixed(2),
      holdingsValue: +current.toFixed(2),
      // Today
      dayPnl: +todayPnl.toFixed(2),
      dayPnlPercent: +todayPnlPercent.toFixed(2),
      // Overall
      totalPnl: +overallPnl.toFixed(2),
      pnlPercent: +overallPnlPercent.toFixed(2),
      realizedPnl: +realizedTotal.toFixed(2),
      unrealizedPnl: +unrealizedPnl.toFixed(2),
      // Activity insights
      holdingsCount: userHoldings.length,
      closedTrades,
      totalTxns,
    };
  });

  // Rank by overall % return (the fair competition metric on equal starting capital)
  leaderboard.sort((a, b) => b.pnlPercent - a.pnlPercent);
  const ranked = leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
  res.json(ranked.slice(0, 10));
});

// Public holdings + summary for a leaderboard user
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
    const dayChange = (q?.change ?? 0) * h.quantity;
    const dayChangePct = q?.change_percent ?? 0;
    return {
      symbol: h.symbol,
      name: h.stock_name || h.symbol,
      quantity: h.quantity,
      avgPrice: +h.avg_buy_price.toFixed(2),
      ltp: +price.toFixed(2),
      pnl: +pnl.toFixed(2),
      pnlPct: +pnlPct.toFixed(2),
      dayChange: +dayChange.toFixed(2),
      dayChangePct: +dayChangePct.toFixed(2),
    };
  });

  result.sort((a, b) => b.pnlPct - a.pnlPct);
  res.json(result);
});

export default router;
