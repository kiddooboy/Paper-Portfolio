import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes, Quote } from '../services/marketData.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/portfolio — Full analytics payload
// ---------------------------------------------------------------------------
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
  if (!user) return res.status(401).json({ error: 'User not found' });

  const holdings = (await db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId)) as any[];

  // Fetch full quotes for every holding
  const quoteMap = new Map<string, Quote>();
  if (holdings.length) {
    const quotes = getCachedQuotes(holdings.map((h) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
    for (const q of quotes) quoteMap.set(q.symbol, q);
  }

  // ── Per-holding enrichment ──
  let investedValue = 0;
  let currentValue = 0;
  let dayChangeTotal = 0;
  let winners = 0;

  for (const h of holdings) {
    const q = quoteMap.get(h.symbol);
    const price = q?.price ?? h.avg_buy_price;
    const prevClose = q?.previous_close ?? price;

    h.current_price = price;
    h.current_value = price * h.quantity;
    h.pnl = (price - h.avg_buy_price) * h.quantity;
    h.pnl_percent = h.avg_buy_price > 0 ? +((price - h.avg_buy_price) / h.avg_buy_price * 100).toFixed(2) : 0;
    h.day_change = (price - prevClose) * h.quantity;
    h.day_change_percent = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
    h.name = q?.name || h.symbol;
    h.day_high = q?.day_high;
    h.day_low = q?.day_low;
    h.high_52w = q?.high_52w;
    h.low_52w = q?.low_52w;
    h.market_cap = q?.market_cap;
    h.pe_ratio = q?.pe_ratio;
    h.volume = q?.volume;
    h.exchange = q?.exchange || 'NSE';

    investedValue += h.avg_buy_price * h.quantity;
    currentValue += h.current_value;
    dayChangeTotal += h.day_change;
    if (h.pnl >= 0) winners++;
  }

  // Compute weights after totals
  for (const h of holdings) {
    h.weight = currentValue > 0 ? +(h.current_value / currentValue * 100).toFixed(2) : 0;
  }

  // Sort holdings by current_value descending for display
  holdings.sort((a: any, b: any) => b.current_value - a.current_value);

  const totalPnl = currentValue - investedValue;
  const totalPnlPercent = investedValue > 0 ? +(totalPnl / investedValue * 100).toFixed(2) : 0;
  const dayChangePct = (currentValue - dayChangeTotal) > 0
    ? +(dayChangeTotal / (currentValue - dayChangeTotal) * 100).toFixed(2)
    : 0;

  // ── Sector allocation ──
  // Look up sectors from DB
  const sectorRows = holdings.length
    ? ((await db.prepare(`SELECT symbol, sector FROM stocks WHERE symbol IN (${holdings.map(() => '?').join(',')})`)
        .all(...holdings.map((h: any) => h.symbol))) as any[])
    : [];
  const sectorLookup = new Map(sectorRows.map((r: any) => [r.symbol, r.sector || 'Other']));

  const sectorMap = new Map<string, number>();
  for (const h of holdings) {
    const sec = sectorLookup.get(h.symbol) || 'Other';
    h.sector = sec;
    sectorMap.set(sec, (sectorMap.get(sec) || 0) + h.current_value);
  }
  const sectorAllocation = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, value: +value.toFixed(2), percent: currentValue > 0 ? +(value / currentValue * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.value - a.value);

  // ── Stock allocation (top-N + Others) ──
  const stockAllocation = holdings.map((h: any) => ({
    name: h.symbol,
    value: +h.current_value.toFixed(2),
    percent: h.weight,
  }));
  // Group stocks beyond top 8 into "Others"
  const topStocks = stockAllocation.slice(0, 8);
  const othersValue = stockAllocation.slice(8).reduce((s: number, x: any) => s + x.value, 0);
  if (othersValue > 0) topStocks.push({ name: 'Others', value: +othersValue.toFixed(2), percent: currentValue > 0 ? +(othersValue / currentValue * 100).toFixed(1) : 0 });

  // ── Risk metrics ──
  // HHI (Herfindahl-Hirschman Index) — lower is more diversified
  // Range: 0 to 10000 (10000 = single stock)
  const hhi = holdings.reduce((sum: number, h: any) => sum + (h.weight || 0) ** 2, 0);
  const top3Weight = holdings.slice(0, 3).reduce((s: number, h: any) => s + (h.weight || 0), 0);
  const winRate = holdings.length > 0 ? +(winners / holdings.length * 100).toFixed(0) : 0;

  // Diversification score (0-100): 100 = perfectly diversified
  const maxHhi = 10000; // single stock
  const minHhi = holdings.length > 0 ? 10000 / holdings.length : 10000;
  const diversificationScore = holdings.length > 0
    ? +((1 - (hhi - minHhi) / (maxHhi - minHhi)) * 100).toFixed(0)
    : 0;

  // ── Best & worst performers ──
  const sorted = [...holdings].sort((a: any, b: any) => b.pnl_percent - a.pnl_percent);
  const bestPerformer = sorted[0] || null;
  const worstPerformer = sorted[sorted.length - 1] || null;
  const biggestHolding = holdings[0] || null; // already sorted by value desc

  // ── Realized P&L (from SELL transactions) ──
  const sellTxns = (await db.prepare(`
    SELECT symbol, quantity, price, total_amount FROM transactions
    WHERE user_id = ? AND type = 'SELL'
  `).all(userId)) as any[];

  let realizedPnl = 0;
  for (const tx of sellTxns) {
    // Approximate: realized pnl = sell proceeds - (avg_buy at time... approximation)
    // We store total_amount for the sell. Estimate cost basis from current avg (rough).
    const holdingMatch = holdings.find((h: any) => h.symbol === tx.symbol);
    const costBasis = holdingMatch ? holdingMatch.avg_buy_price * tx.quantity : tx.price * tx.quantity;
    realizedPnl += tx.total_amount - costBasis;
  }
  const unrealizedPnl = totalPnl;

  // ── Transactions ──
  const transactions = await db.prepare(`
    SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(userId);

  // ── Transaction stats ──
  const allTxns = (await db.prepare(`
    SELECT type, COUNT(*) as count, SUM(total_amount) as total FROM transactions
    WHERE user_id = ? GROUP BY type
  `).all(userId)) as any[];
  const buyStats = allTxns.find((t: any) => t.type === 'BUY') || { count: 0, total: 0 };
  const sellStats = allTxns.find((t: any) => t.type === 'SELL') || { count: 0, total: 0 };

  res.json({
    balance: user.balance,
    investedValue: +investedValue.toFixed(2),
    currentValue: +currentValue.toFixed(2),
    totalPnl: +totalPnl.toFixed(2),
    totalPnlPercent,
    dayChangeTotal: +dayChangeTotal.toFixed(2),
    dayChangePct,
    holdings,
    sectorAllocation,
    stockAllocation: topStocks,
    risk: {
      hhi: +hhi.toFixed(0),
      top3Weight: +top3Weight.toFixed(1),
      winRate,
      diversificationScore: Math.max(0, Math.min(100, diversificationScore)),
      holdingsCount: holdings.length,
      sectorsCount: sectorAllocation.length,
    },
    highlights: {
      bestPerformer: bestPerformer ? { symbol: bestPerformer.symbol, name: bestPerformer.name, pnl_percent: bestPerformer.pnl_percent, pnl: bestPerformer.pnl } : null,
      worstPerformer: worstPerformer ? { symbol: worstPerformer.symbol, name: worstPerformer.name, pnl_percent: worstPerformer.pnl_percent, pnl: worstPerformer.pnl } : null,
      biggestHolding: biggestHolding ? { symbol: biggestHolding.symbol, name: biggestHolding.name, weight: biggestHolding.weight, current_value: biggestHolding.current_value } : null,
    },
    pnlBreakdown: {
      realized: +realizedPnl.toFixed(2),
      unrealized: +unrealizedPnl.toFixed(2),
      total: +(realizedPnl + unrealizedPnl).toFixed(2),
    },
    tradeStats: {
      totalBuys: buyStats.count,
      totalSells: sellStats.count,
      buyVolume: +(buyStats.total || 0).toFixed(2),
      sellVolume: +(sellStats.total || 0).toFixed(2),
    },
    transactions,
  });
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/history — value snapshots
// ---------------------------------------------------------------------------
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  const history = await db.prepare(`
    SELECT * FROM portfolio_history WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 60
  `).all(req.user!.id);
  res.json(history);
});

export default router;
