import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes, Quote } from '../services/marketData.js';

// ─── Phase 2 helpers — benchmark, drawdown, risk alerts ───────────────────
const RF_DAILY = Math.pow(1.065, 1 / 252) - 1; // 6.5% annual risk-free → daily

/** Returns aligned (date, portfolio_value, index_close) rows for the user. */
function alignedReturns(userId: number, indexSymbol = '^NSEI', days = 365): {
  dates: string[]; pv: number[]; iv: number[];
} {
  // portfolio_history has one snapshot per record; aggregate to last value of each IST date
  const phRows = db.prepare(`
    SELECT date(recorded_at, '+5 hours', '+30 minutes') AS d,
           total_value AS pv
    FROM portfolio_history WHERE user_id = ?
    GROUP BY d
    HAVING max(recorded_at) = max(recorded_at)
    ORDER BY d DESC LIMIT ?
  `).all(userId, days) as any[];
  if (!phRows.length) return { dates: [], pv: [], iv: [] };
  phRows.reverse();

  const ihRows = db.prepare(`
    SELECT date, close FROM index_history WHERE symbol = ? AND date >= ? ORDER BY date ASC
  `).all(indexSymbol, phRows[0].d) as any[];
  const ihMap = new Map<string, number>();
  for (const r of ihRows) ihMap.set(r.date, r.close);

  const dates: string[] = []; const pv: number[] = []; const iv: number[] = [];
  for (const r of phRows) {
    const ic = ihMap.get(r.d);
    if (ic == null) continue;
    dates.push(r.d); pv.push(Number(r.pv)); iv.push(Number(ic));
  }
  return { dates, pv, iv };
}

function pctReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    if (!prev) { out.push(0); continue; }
    out.push((series[i] - prev) / prev);
  }
  return out;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
}

function covariance(xs: number[], ys: number[]): number {
  if (xs.length < 2 || xs.length !== ys.length) return 0;
  const mx = mean(xs), my = mean(ys);
  return xs.reduce((s, _, i) => s + (xs[i] - mx) * (ys[i] - my), 0) / (xs.length - 1);
}

/** Returns benchmark stats vs `^NSEI` over the user's portfolio history. */
function computeBenchmark(userId: number) {
  const { pv, iv } = alignedReturns(userId, '^NSEI', 365);
  if (pv.length < 10) {
    return { name: 'NIFTY 50', return_1y: null, beta: null, alpha: null, tracking_error: null, samples: pv.length };
  }
  const rp = pctReturns(pv);
  const rb = pctReturns(iv);
  const n = Math.min(rp.length, rb.length);
  const rpN = rp.slice(-n), rbN = rb.slice(-n);

  const cov = covariance(rpN, rbN);
  const varB = variance(rbN);
  const beta = varB === 0 ? null : cov / varB;

  // Jensen's alpha (annualised)
  const alphaDaily = mean(rpN) - RF_DAILY - (beta ?? 0) * (mean(rbN) - RF_DAILY);
  const alpha = alphaDaily * 252;

  // Tracking error (annualised)
  const diffs = rpN.map((v, i) => v - rbN[i]);
  const te = Math.sqrt(variance(diffs)) * Math.sqrt(252);

  const port1y = pv.length >= 2 ? (pv[pv.length - 1] - pv[0]) / pv[0] : 0;
  const bench1y = iv.length >= 2 ? (iv[iv.length - 1] - iv[0]) / iv[0] : 0;

  return {
    name: 'NIFTY 50',
    return_1y: +(port1y * 100).toFixed(2),
    benchmark_return_1y: +(bench1y * 100).toFixed(2),
    excess_return: +((port1y - bench1y) * 100).toFixed(2),
    beta: beta == null ? null : +beta.toFixed(2),
    alpha: +alpha.toFixed(4),
    alpha_pct: +(alpha * 100).toFixed(2),
    tracking_error: +(te * 100).toFixed(2),
    samples: n,
  };
}

/** Concentration / cash-drag / sector risk alerts. */
function computeRiskAlerts(
  holdings: any[], sectorAllocation: any[], hhi: number, balance: number, currentValue: number,
) {
  const alerts: { type: string; severity: 'low'|'med'|'high'; title: string; detail: string }[] = [];
  for (const h of holdings) {
    if ((h.weight ?? 0) > 25) {
      alerts.push({
        type: 'single_stock_overweight',
        severity: h.weight > 40 ? 'high' : 'med',
        title: `${h.symbol} is ${h.weight.toFixed(0)}% of portfolio`,
        detail: 'Consider trimming — single-stock concentration above 25% is high-risk.',
      });
    }
  }
  for (const s of sectorAllocation) {
    if (s.percent > 30) {
      alerts.push({
        type: 'sector_overweight',
        severity: s.percent > 50 ? 'high' : 'med',
        title: `${s.name || s.sector} is ${s.percent.toFixed(0)}% of portfolio`,
        detail: 'One sector dominates the portfolio. Diversifying across sectors reduces drawdown risk.',
      });
    }
  }
  if (hhi > 2500 && holdings.length >= 1) {
    alerts.push({
      type: 'low_diversification',
      severity: hhi > 5000 ? 'high' : 'med',
      title: `Diversification is low (HHI ${Math.round(hhi)})`,
      detail: 'Spread allocation across more positions to lower concentration risk.',
    });
  }
  const equity = balance + currentValue;
  if (equity > 0 && balance / equity > 0.30) {
    alerts.push({
      type: 'cash_drag',
      severity: 'low',
      title: `${Math.round((balance / equity) * 100)}% of portfolio is in cash`,
      detail: 'Cash drag — uninvested capital is missing market returns.',
    });
  }
  return alerts;
}

/** Drawdown episodes (peak → trough → recovery) from a value series. */
function computeDrawdownSeries(series: { date: string; value: number }[]) {
  if (series.length < 2) {
    return { current_drawdown_pct: 0, max_drawdown_pct: 0, max_dd_date: null, recovery_days: null, episodes: [] as any[] };
  }
  let peak = series[0].value, peakIdx = 0;
  let maxDD = 0, maxDDIdx = 0, maxPeakIdx = 0;
  const episodes: any[] = [];
  let inDrawdown = false; let troughIdx = 0; let troughValue = 0;

  for (let i = 1; i < series.length; i++) {
    const v = series[i].value;
    if (v > peak) {
      if (inDrawdown) {
        episodes.push({
          start_date: series[peakIdx].date,
          trough_date: series[troughIdx].date,
          recovery_date: series[i].date,
          depth_pct: +((peak - troughValue) / peak * 100).toFixed(2),
          recovery_days: i - peakIdx,
        });
        inDrawdown = false;
      }
      peak = v; peakIdx = i;
    } else {
      const dd = (peak - v) / peak;
      if (!inDrawdown) { inDrawdown = true; troughIdx = i; troughValue = v; }
      if (v < troughValue) { troughValue = v; troughIdx = i; }
      if (dd > maxDD) { maxDD = dd; maxDDIdx = i; maxPeakIdx = peakIdx; }
    }
  }

  const last = series[series.length - 1].value;
  const currentDD = peak > 0 ? (peak - last) / peak : 0;

  return {
    current_drawdown_pct: +(currentDD * 100).toFixed(2),
    max_drawdown_pct: +(maxDD * 100).toFixed(2),
    max_dd_date: maxDD > 0 ? series[maxDDIdx].date : null,
    max_dd_peak_date: maxDD > 0 ? series[maxPeakIdx].date : null,
    recovery_days: inDrawdown ? null : (episodes.length ? episodes[episodes.length - 1].recovery_days : null),
    episodes: episodes.slice(-5),
  };
}

// Newton-Raphson XIRR implementation
function xirr(cashflows: { amount: number; date: Date }[], guess = 0.1): number {
  const maxIter = 100;
  const tol = 1e-6;
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let f = 0, df = 0;
    const t0 = cashflows[0].date.getTime();
    for (const cf of cashflows) {
      const t = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
      const denom = Math.pow(1 + rate, t);
      f += cf.amount / denom;
      df -= t * cf.amount / (denom * (1 + rate));
    }
    const delta = f / df;
    rate -= delta;
    if (Math.abs(delta) < tol) return rate;
  }
  return rate;
}

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

  // ── Realized P&L — from avg-cost trade_pnl records ──
  const pnlRow = (await db.prepare(`SELECT COALESCE(SUM(realized_pnl), 0) as total FROM trade_pnl WHERE user_id = ?`).get(userId)) as any;
  const realizedPnl = Number(pnlRow?.total || 0);
  const unrealizedPnl = totalPnl; // currentValue - investedValue (open holdings only)

  // True total capital: derived from balance + net invested in transactions.
  // Correctly handles admin topups / balance resets without needing wallet history.
  const netBuysRow = (await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='BUY' THEN total_amount ELSE -total_amount END), 0) as net_buys
    FROM transactions WHERE user_id = ?
  `).get(userId)) as any;
  const totalCapital = user.balance + Number(netBuysRow?.net_buys || 0);

  // ── XIRR / CAGR ──
  // Build cash-flow series: each BUY is negative (money out), final portfolio value is positive (money in today).
  const allTxnsForXirr = (await db.prepare(`
    SELECT type, total_amount, created_at FROM transactions WHERE user_id = ? ORDER BY created_at ASC
  `).all(userId)) as any[];

  const walletTxns = (await db.prepare(`
    SELECT type, amount, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at ASC
  `).all(userId)) as any[];

  let xirr_rate: number | null = null;
  try {
    const cashflows: { amount: number; date: Date }[] = [];
    // Wallet deposits are money in (negative from investor's perspective)
    for (const w of walletTxns) {
      cashflows.push({ amount: w.type === 'DEPOSIT' ? -Number(w.amount) : Number(w.amount), date: new Date(w.created_at) });
    }
    // Current portfolio value is the terminal cash flow (positive)
    const terminalValue = user.balance + currentValue;
    if (cashflows.length > 0 && terminalValue > 0) {
      cashflows.push({ amount: terminalValue, date: new Date() });
      // Only compute if we have at least one negative (investment) and one positive (current value)
      const hasInvestment = cashflows.some(c => c.amount < 0);
      if (hasInvestment) {
        xirr_rate = xirr(cashflows);
      }
    }
  } catch {}

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

  // ── Phase 2: benchmark + risk alerts ──
  let benchmark: any = null;
  try { benchmark = computeBenchmark(userId); } catch (err: any) { console.warn('[portfolio] benchmark err', err?.message); }
  const riskAlerts = computeRiskAlerts(holdings, sectorAllocation, hhi, user.balance, currentValue);

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
    benchmark,
    risk_alerts: riskAlerts,
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
      total: +((user.balance + currentValue) - totalCapital).toFixed(2),
      totalCapital: +totalCapital.toFixed(2),
    },
    tradeStats: {
      totalBuys: buyStats.count,
      totalSells: sellStats.count,
      buyVolume: +(buyStats.total || 0).toFixed(2),
      sellVolume: +(sellStats.total || 0).toFixed(2),
    },
    returns: {
      xirr: xirr_rate !== null ? +(xirr_rate * 100).toFixed(2) : null,
    },
    transactions,
  });
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/drawdown — peak → trough → recovery analysis
// ---------------------------------------------------------------------------
router.get('/drawdown', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const days = Math.min(parseInt(String(req.query.days || '365')) || 365, 1825);
  const rows = db.prepare(`
    SELECT date(recorded_at, '+5 hours', '+30 minutes') AS d, total_value
    FROM portfolio_history WHERE user_id = ?
      AND recorded_at >= datetime('now', '-' || ? || ' days')
    GROUP BY d
    ORDER BY d ASC
  `).all(userId, days) as any[];
  const series = rows.map((r) => ({ date: r.d, value: Number(r.total_value) }));
  res.json(computeDrawdownSeries(series));
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/benchmark/history — portfolio vs Nifty normalised series
// ---------------------------------------------------------------------------
router.get('/benchmark/history', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const days = Math.min(parseInt(String(req.query.days || '365')) || 365, 1825);
  const { dates, pv, iv } = alignedReturns(userId, '^NSEI', days);
  if (!pv.length) return res.json({ dates: [], portfolio: [], benchmark: [] });
  const p0 = pv[0], i0 = iv[0];
  res.json({
    dates,
    portfolio: pv.map((v) => +((v / p0 - 1) * 100).toFixed(2)),
    benchmark: iv.map((v) => +((v / i0 - 1) * 100).toFixed(2)),
  });
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/capital-gains — STCG / LTCG breakdown
// ---------------------------------------------------------------------------
router.get('/capital-gains', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const trades = (await db.prepare(`
    SELECT tp.*, t.created_at as buy_date
    FROM trade_pnl tp
    LEFT JOIN transactions t ON t.order_id = tp.buy_order_id
    WHERE tp.user_id = ?
    ORDER BY tp.closed_at DESC
  `).all(userId)) as any[];

  let stcg = 0, ltcg = 0, stcgTrades = 0, ltcgTrades = 0;
  const breakdown: any[] = [];

  for (const trade of trades) {
    const closeDate = new Date(trade.closed_at);
    const buyDate = trade.buy_date ? new Date(trade.buy_date) : closeDate;
    const holdDays = Math.floor((closeDate.getTime() - buyDate.getTime()) / (24 * 3600 * 1000));
    const isLTCG = holdDays > 365;
    const pnl = Number(trade.realized_pnl);

    if (isLTCG) { ltcg += pnl; ltcgTrades++; }
    else { stcg += pnl; stcgTrades++; }

    breakdown.push({
      symbol: trade.symbol,
      quantity: trade.quantity,
      buy_price: trade.buy_price,
      sell_price: trade.sell_price,
      realized_pnl: +pnl.toFixed(2),
      hold_days: holdDays,
      type: isLTCG ? 'LTCG' : 'STCG',
      closed_at: trade.closed_at,
    });
  }

  // Tax estimates: STCG @ 15%, LTCG @ 10% above ₹1L exemption
  const ltcgExemption = 100000;
  const stcgTax = stcg > 0 ? stcg * 0.15 : 0;
  const ltcgTaxable = Math.max(0, ltcg - ltcgExemption);
  const ltcgTax = ltcgTaxable * 0.10;

  res.json({
    stcg: +stcg.toFixed(2),
    ltcg: +ltcg.toFixed(2),
    stcgTrades,
    ltcgTrades,
    tax: {
      stcg_tax: +stcgTax.toFixed(2),
      ltcg_tax: +ltcgTax.toFixed(2),
      total_estimated_tax: +(stcgTax + ltcgTax).toFixed(2),
      ltcg_exemption: ltcgExemption,
    },
    breakdown,
  });
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/export — CSV export
// ---------------------------------------------------------------------------
router.get('/export', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const type = (req.query.type as string) || 'transactions';

  if (type === 'holdings') {
    const holdings = (await db.prepare(`SELECT * FROM holdings WHERE user_id = ?`).all(userId)) as any[];
    const rows = [['Symbol', 'Quantity', 'Avg Buy Price', 'Invested Value']];
    for (const h of holdings) rows.push([h.symbol, h.quantity, h.avg_buy_price.toFixed(2), (h.avg_buy_price * h.quantity).toFixed(2)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="holdings.csv"');
    return res.send(csv);
  }

  if (type === 'capital-gains') {
    const trades = (await db.prepare(`SELECT tp.*, t.created_at as buy_date FROM trade_pnl tp LEFT JOIN transactions t ON t.order_id = tp.buy_order_id WHERE tp.user_id = ? ORDER BY tp.closed_at DESC`).all(userId)) as any[];
    const rows = [['Symbol', 'Quantity', 'Buy Price', 'Sell Price', 'Realized P&L', 'Type', 'Close Date']];
    for (const t of trades) {
      const holdDays = Math.floor((new Date(t.closed_at).getTime() - (t.buy_date ? new Date(t.buy_date).getTime() : new Date(t.closed_at).getTime())) / (24 * 3600 * 1000));
      rows.push([t.symbol, t.quantity, Number(t.buy_price).toFixed(2), Number(t.sell_price).toFixed(2), Number(t.realized_pnl).toFixed(2), holdDays > 365 ? 'LTCG' : 'STCG', t.closed_at.slice(0, 10)]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="capital_gains.csv"');
    return res.send(csv);
  }

  // Default: transactions
  const transactions = (await db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC`).all(userId)) as any[];
  const rows = [['Date', 'Symbol', 'Type', 'Quantity', 'Price', 'Total Amount']];
  for (const t of transactions) rows.push([t.created_at.slice(0, 10), t.symbol, t.type, t.quantity, Number(t.price).toFixed(2), Number(t.total_amount).toFixed(2)]);
  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  return res.send(csv);
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/risk-metrics — Beta, volatility, correlation
// ---------------------------------------------------------------------------
router.get('/risk-metrics', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const holdings = (await db.prepare(`SELECT symbol, quantity, avg_buy_price FROM holdings WHERE user_id = ? AND quantity > 0`).all(userId)) as any[];
    if (!holdings.length) return res.json({ beta: null, volatility: null, correlation: [], sharpe: null });

    // Fetch 90-day history from portfolio_history
    const history = (await db.prepare(`
      SELECT total_value, recorded_at FROM portfolio_history WHERE user_id = ? ORDER BY recorded_at ASC LIMIT 90
    `).all(userId)) as any[];

    let portfolioVolatility: number | null = null;
    let sharpe: number | null = null;

    if (history.length >= 5) {
      const returns: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const prev = Number(history[i - 1].total_value);
        const curr = Number(history[i].total_value);
        if (prev > 0) returns.push((curr - prev) / prev);
      }
      if (returns.length > 0) {
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
        portfolioVolatility = +(Math.sqrt(variance * 252) * 100).toFixed(2); // Annualized
        const riskFreeDaily = 0.065 / 252; // 6.5% RBI repo rate
        sharpe = returns.length > 0 ? +((mean - riskFreeDaily) / Math.sqrt(variance) * Math.sqrt(252)).toFixed(2) : null;
      }
    }

    // Per-holding weights
    const quotes = getCachedQuotes(holdings.map(h => ({ symbol: h.symbol, exchange: 'NSE' as const })));
    const qMap = new Map(quotes.map(q => [q.symbol, q]));
    let totalValue = 0;
    for (const h of holdings) totalValue += (qMap.get(h.symbol)?.price ?? h.avg_buy_price) * h.quantity;

    const holdingWeights = holdings.map(h => ({
      symbol: h.symbol,
      weight: totalValue > 0 ? +((qMap.get(h.symbol)?.price ?? h.avg_buy_price) * h.quantity / totalValue * 100).toFixed(2) : 0,
      price: qMap.get(h.symbol)?.price ?? h.avg_buy_price,
    }));

    res.json({
      volatility: portfolioVolatility,
      sharpe,
      holdingWeights,
      holdings_count: holdings.length,
      note: 'Beta vs Nifty 50 requires extended historical price data. Volatility is annualized from portfolio history.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/backtest — Replay historical prices against current allocation
// ---------------------------------------------------------------------------
router.get('/backtest', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const initialCapital = Number(req.query.capital || 100000);
    const range = (req.query.range as string) || '1y';

    const holdings = (await db.prepare(`SELECT symbol, quantity, avg_buy_price FROM holdings WHERE user_id = ? AND quantity > 0`).all(userId)) as any[];
    if (!holdings.length) return res.json({ snapshots: [], message: 'No holdings to backtest' });

    // Use portfolio_history as proxy for backtest (actual historical prices require Yahoo Finance historical API)
    const cutoffMap: Record<string, string> = {
      '1m': "datetime('now', '-30 days')",
      '3m': "datetime('now', '-90 days')",
      '6m': "datetime('now', '-180 days')",
      '1y': "datetime('now', '-365 days')",
    };
    const cutoff = cutoffMap[range] || cutoffMap['1y'];

    const history = (await db.prepare(`
      SELECT total_value, cash_balance, recorded_at FROM portfolio_history
      WHERE user_id = ? AND recorded_at >= ${cutoff}
      ORDER BY recorded_at ASC LIMIT 365
    `).all(userId)) as any[];

    // Calculate invested capital at each point from wallet transactions
    const walletTxns = (await db.prepare(`SELECT type, amount, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at ASC`).all(userId)) as any[];

    let cumulativeCapital = 0;
    const snapshots = history.map(h => {
      const date = h.recorded_at;
      for (const w of walletTxns) {
        if (w.created_at <= date) {
          cumulativeCapital += w.type === 'DEPOSIT' ? Number(w.amount) : -Number(w.amount);
        }
      }
      const portfolioValue = Number(h.total_value);
      const pnl = cumulativeCapital > 0 ? portfolioValue - cumulativeCapital : 0;
      const pnlPct = cumulativeCapital > 0 ? (pnl / cumulativeCapital) * 100 : 0;
      return {
        date: date.slice(0, 10),
        portfolio_value: +portfolioValue.toFixed(2),
        invested_capital: +Math.max(0, cumulativeCapital).toFixed(2),
        pnl: +pnl.toFixed(2),
        pnl_percent: +pnlPct.toFixed(2),
      };
    });

    res.json({ snapshots, initial_capital: initialCapital, range });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/history — value snapshots
// ?range=1d|1w|1m  (default: 1m)
// ---------------------------------------------------------------------------
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  const range = (req.query.range as string) || '1m';
  const cutoffMap: Record<string, string> = {
    '1d': "datetime('now', '-1 day')",
    '1w': "datetime('now', '-7 days')",
    '1m': "datetime('now', '-30 days')",
  };
  const cutoff = cutoffMap[range] ?? cutoffMap['1m'];

  const history = db.prepare(`
    SELECT * FROM portfolio_history
    WHERE user_id = ? AND recorded_at >= ${cutoff}
    ORDER BY recorded_at ASC
    LIMIT 500
  `).all(req.user!.id);
  res.json(history);
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/trade-pnl — FIFO realized P&L per trade
// ---------------------------------------------------------------------------
router.get('/trade-pnl', authMiddleware, async (req: AuthRequest, res) => {
  const rows = db.prepare(`
    SELECT tp.*,
           bo.created_at as buy_date,
           so.created_at as sell_date
    FROM trade_pnl tp
    LEFT JOIN orders bo ON bo.id = tp.buy_order_id
    LEFT JOIN orders so ON so.id = tp.sell_order_id
    WHERE tp.user_id = ?
    ORDER BY tp.closed_at DESC
    LIMIT 200
  `).all(req.user!.id);

  const totalRealized = (rows as any[]).reduce((s, r) => s + Number(r.realized_pnl), 0);
  res.json({ trades: rows, totalRealized: +totalRealized.toFixed(2) });
});

export default router;
