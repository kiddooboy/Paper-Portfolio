import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';

function xirrRate(cashflows: { amount: number; date: Date }[]): number | null {
  try {
    let rate = 0.1;
    const t0 = cashflows[0].date.getTime();
    for (let i = 0; i < 100; i++) {
      let f = 0, df = 0;
      for (const cf of cashflows) {
        const t = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
        const d = Math.pow(1 + rate, t);
        f += cf.amount / d;
        df -= t * cf.amount / (d * (1 + rate));
      }
      const delta = f / df;
      rate -= delta;
      if (Math.abs(delta) < 1e-6) return rate;
    }
    return rate;
  } catch { return null; }
}

const router = Router();

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

  // Wallet deposits per user for XIRR
  const walletAll = (await db.prepare(`
    SELECT user_id, type, amount, created_at FROM wallet_transactions ORDER BY created_at ASC
  `).all()) as any[];
  const walletByUser = new Map<number, any[]>();
  for (const w of walletAll) {
    if (!walletByUser.has(w.user_id)) walletByUser.set(w.user_id, []);
    walletByUser.get(w.user_id)!.push(w);
  }

  // Net invested per user — used to derive true total capital regardless of admin adjustments.
  // total_capital = balance + net_buys, where net_buys = SUM(buys) - SUM(sells) from transactions.
  // This identity always holds: balance = total_capital - net_buys.
  const netBuysAll = (await db.prepare(`
    SELECT user_id,
           COALESCE(SUM(CASE WHEN type='BUY' THEN total_amount ELSE -total_amount END), 0) as net_buys,
           COUNT(*) as total_txns
    FROM transactions
    GROUP BY user_id
  `).all()) as any[];
  const netBuysMap = new Map(netBuysAll.map((r: any) => [r.user_id, { netBuys: Number(r.net_buys), totalTxns: Number(r.total_txns) }]));

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

    for (const h of userHoldings) {
      const q = priceMap.get(h.symbol);
      const price = q?.price ?? h.avg_buy_price;
      invested += h.avg_buy_price * h.quantity;
      current += price * h.quantity;
    }

    const portfolioValue = u.balance + current;
    const realizedTotal = realizedMap.get(u.id)?.realized ?? 0;
    const closedTrades = realizedMap.get(u.id)?.closedTrades ?? 0;
    const txData = netBuysMap.get(u.id);
    const totalTxns = txData?.totalTxns ?? 0;

    // Unrealized P&L (current holdings vs avg cost basis)
    const unrealizedPnl = current - invested;

    // True total capital = current cash + net amount invested in trades.
    // Derives the actual capital given to this user without needing wallet history.
    const totalCapital = u.balance + (txData?.netBuys ?? 0);
    const overallPnl = portfolioValue - totalCapital;
    const overallPnlPercent = totalCapital > 0 ? (overallPnl / totalCapital) * 100 : 0;

    // XIRR
    let xirr: number | null = null;
    const wallets = walletByUser.get(u.id) || [];
    if (wallets.length > 0) {
      const cfs = wallets.map((w: any) => ({
        amount: w.type === 'DEPOSIT' ? -Number(w.amount) : Number(w.amount),
        date: new Date(w.created_at),
      }));
      cfs.push({ amount: portfolioValue, date: new Date() });
      if (cfs.some((c: any) => c.amount < 0)) {
        const r = xirrRate(cfs);
        xirr = r !== null ? +(r * 100).toFixed(2) : null;
      }
    }

    return {
      userId: u.id,
      name: u.name,
      portfolioValue: +portfolioValue.toFixed(2),
      cashBalance: +u.balance.toFixed(2),
      holdingsValue: +current.toFixed(2),
      totalPnl: +overallPnl.toFixed(2),
      pnlPercent: +overallPnlPercent.toFixed(2),
      realizedPnl: +realizedTotal.toFixed(2),
      unrealizedPnl: +unrealizedPnl.toFixed(2),
      holdingsCount: userHoldings.length,
      closedTrades,
      totalTxns,
      totalCapital: +totalCapital.toFixed(2),
      xirr,
    };
  });

  // Rank by overall % return (the fair competition metric on equal starting capital)
  leaderboard.sort((a, b) => b.pnlPercent - a.pnlPercent);
  const ranked = leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
  res.json(ranked);
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
    return {
      symbol: h.symbol,
      name: h.stock_name || h.symbol,
      quantity: h.quantity,
      avgPrice: +h.avg_buy_price.toFixed(2),
      ltp: +price.toFixed(2),
      pnl: +pnl.toFixed(2),
      pnlPct: +pnlPct.toFixed(2),
    };
  });

  result.sort((a, b) => b.pnlPct - a.pnlPct);
  res.json(result);
});

export default router;
