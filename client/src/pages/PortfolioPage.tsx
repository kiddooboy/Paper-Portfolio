import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { formatCurrency, formatPercent, cn, formatDbDate } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import StockLogo from '../components/StockLogo';
import PortfolioHealth from '../components/PortfolioHealth';
import {
  ArrowUpRight, TrendingUp,
  Shield, Target, Award, AlertTriangle, Activity,
  BarChart3, PiggyBank, Repeat, Download, Calculator,
  Share2, X,
} from 'lucide-react';

const COLORS = ['#00B386', '#6366F1', '#F59E0B', '#EB5B3C', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

type SortKey = 'value' | 'pnl' | 'pnl_pct' | 'weight' | 'day' | 'qty' | 'avg';
type SortDir = 'asc' | 'desc';

export default function PortfolioPage() {
  const rawData = usePortfolioStore((s) => s.data);
  const portfolioLoading = usePortfolioStore((s) => s.loading);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tab, setTab] = useState<'holdings' | 'transactions' | 'pnl' | 'analytics'>('holdings');
  const [tradePnl, setTradePnl] = useState<{ trades: any[]; totalRealized: number } | null>(null);
  const allQuotes = useMarketStore((s) => s.quotes);
  const loading = (portfolioLoading && !rawData);

  // Advanced Analytics and Share states
  const [riskMetrics, setRiskMetrics] = useState<any>(null);
  const [drawdownData, setDrawdownData] = useState<any>(null);
  const [benchHistory, setBenchHistory] = useState<any>(null);
  const [selectedShareTrade, setSelectedShareTrade] = useState<any | null>(null);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  useEffect(() => {
    if ((tab === 'pnl' || tab === 'analytics') && !tradePnl) {
      axios.get('/api/portfolio/trade-pnl').then(r => setTradePnl(r.data)).catch(() => {});
    }
    if (tab === 'analytics') {
      if (!riskMetrics) axios.get('/api/portfolio/risk-metrics').then(r => setRiskMetrics(r.data)).catch(() => {});
      if (!drawdownData) axios.get('/api/portfolio/drawdown', { params: { days: 365 } }).then(r => setDrawdownData(r.data)).catch(() => {});
      if (!benchHistory) axios.get('/api/portfolio/benchmark/history', { params: { days: 365 } }).then(r => setBenchHistory(r.data)).catch(() => {});
    }
  }, [tab, tradePnl, riskMetrics, drawdownData, benchHistory]);

  // Quant KPIs computed from trade history
  const profitFactor = useMemo(() => {
    if (!tradePnl?.trades?.length) return null;
    let gains = 0, losses = 0;
    for (const t of tradePnl.trades) {
      const p = Number(t.realized_pnl);
      if (p > 0) gains += p;
      else if (p < 0) losses += Math.abs(p);
    }
    return losses === 0 ? gains : +(gains / losses).toFixed(2);
  }, [tradePnl]);

  const winRate = useMemo(() => {
    if (!tradePnl?.trades?.length) return 0;
    const wins = tradePnl.trades.filter((t: any) => Number(t.realized_pnl) >= 0).length;
    return Math.round((wins / tradePnl.trades.length) * 100);
  }, [tradePnl]);

  // Equity Curve Chart formatter
  const chartData = useMemo(() => {
    if (!benchHistory || !benchHistory.dates?.length) return [];
    return benchHistory.dates.map((d: string, idx: number) => ({
      date: new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      Portfolio: benchHistory.portfolio[idx],
      'Nifty 50': benchHistory.benchmark[idx],
    }));
  }, [benchHistory]);

  // GitHub contribution calendar days generator
  const dailyPnlMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!tradePnl?.trades) return map;
    for (const t of tradePnl.trades) {
      if (!t.closed_at) continue;
      const d = t.closed_at.slice(0, 10);
      map[d] = (map[d] || 0) + Number(t.realized_pnl);
    }
    return map;
  }, [tradePnl]);

  const heatmapDays = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dateString = d.toISOString().slice(0, 10);
      const val = dailyPnlMap[dateString] ?? null;
      days.push({ date: dateString, value: val });
    }
    return days;
  }, [dailyPnlMap]);

  // Premium Social Share card generators
  const generateShareSvg = (trade: any) => {
    const profitPct = ((Number(trade.sell_price) - Number(trade.buy_price)) / Number(trade.buy_price) * 100).toFixed(2);
    const realizedPnl = Number(trade.realized_pnl);
    const isWin = realizedPnl >= 0;
    const pnlColor = isWin ? '#00b386' : '#eb5b3c';
    const pnlText = `${isWin ? '+' : ''}₹${realizedPnl.toLocaleString('en-IN')}`;
    const pctText = `${isWin ? '+' : ''}${profitPct}%`;
    
    return `<svg width="450" height="300" viewBox="0 0 450 300" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; display:block; border-radius:12px;">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#090d16" />
          <stop offset="50%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${pnlColor}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="450" height="300" rx="16" fill="url(#bg)" stroke="#1e293b" stroke-width="1.5"/>
      <rect width="450" height="300" rx="16" fill="url(#glow)"/>
      <text x="30" y="45" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="11" fill="#64748b" letter-spacing="1.5">PAPER PORTFOLIO</text>
      <text x="420" y="45" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="9" fill="${pnlColor}" text-anchor="end" letter-spacing="1">${isWin ? 'PROFITABLE TRADE' : 'CLOSED TRADE'}</text>
      
      <text x="30" y="105" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="32" fill="#ffffff" letter-spacing="-0.5">${trade.symbol}</text>
      <text x="30" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#94a3b8">NSE Equities Closed Position</text>
      
      <text x="420" y="105" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="28" fill="${pnlColor}" text-anchor="end">${pctText}</text>
      <text x="420" y="125" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="12" fill="${pnlColor}" text-anchor="end">${pnlText} Realized</text>
      
      <line x1="30" y1="155" x2="420" y2="155" stroke="#334155" stroke-width="0.75"/>
      
      <text x="30" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="#64748b" letter-spacing="0.5">BUY AVERAGE</text>
      <text x="30" y="208" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="13" fill="#f8fafc">₹${Number(trade.buy_price).toFixed(2)}</text>
      
      <text x="160" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="#64748b" letter-spacing="0.5">SELL AVERAGE</text>
      <text x="160" y="208" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="13" fill="#f8fafc">₹${Number(trade.sell_price).toFixed(2)}</text>
      
      <text x="290" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="#64748b" letter-spacing="0.5">QUANTITY</text>
      <text x="290" y="208" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="13" fill="#f8fafc">${trade.quantity} Shares</text>
      
      <line x1="30" y1="240" x2="420" y2="240" stroke="#1e293b" stroke-width="0.75"/>
      <text x="30" y="268" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="#475569">Practice trading Indian equities with zero risk on paperportfolio.in</text>
    </svg>`;
  };

  const downloadSharePoster = (trade: any) => {
    const svgString = generateShareSvg(trade);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trade_${trade.symbol}_${trade.realized_pnl}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Live-enrich holdings from global market store for real-time updates
  const data = useMemo(() => {
    if (!rawData) return null;
    const holdings = (rawData.holdings || []).map((h: any) => {
      const liveQ = allQuotes[h.symbol];
      if (liveQ) {
        const price = liveQ.price;
        const current_value = price * h.quantity;
        const pnl = (price - h.avg_buy_price) * h.quantity;
        const pnl_percent = h.avg_buy_price > 0 ? ((price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;
        return { ...h, current_price: price, current_value, pnl, pnl_percent: +pnl_percent.toFixed(2), day_change: liveQ.change_percent ?? h.day_change };
      }
      return h;
    });
    let investedValue = 0, currentValue = 0;
    for (const h of holdings) {
      investedValue += h.avg_buy_price * h.quantity;
      currentValue += (h.current_price || h.avg_buy_price) * h.quantity;
    }
    const totalPnl = currentValue - investedValue;
    const totalPnlPercent = investedValue > 0 ? (totalPnl / investedValue) * 100 : 0;
    const totalValue = (rawData.balance || 0) + currentValue;
    // Recalculate weights
    for (const h of holdings) { h.weight = totalValue > 0 ? (h.current_value / totalValue) * 100 : 0; }
    // Recompute P&L breakdown with live prices so it stays consistent with the
    // displayed portfolio value (and matches what the leaderboard computes).
    // Identity: realized + unrealized === (balance + currentValue) - totalCapital
    const realized = Number(rawData.pnlBreakdown?.realized || 0);
    const pnlBreakdown = {
      ...(rawData.pnlBreakdown || {}),
      unrealized: +totalPnl.toFixed(2),
      realized: +realized.toFixed(2),
      total: +(totalPnl + realized).toFixed(2),
    };
    return { ...rawData, holdings, investedValue, currentValue, totalPnl, totalPnlPercent: +totalPnlPercent.toFixed(2), pnlBreakdown };
  }, [rawData, allQuotes]);

  const sortedHoldings = useMemo(() => {
    if (!data?.holdings) return [];
    const arr = [...data.holdings];
    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a: any, b: any) => {
      switch (sortKey) {
        case 'value': return dir * (a.current_value - b.current_value);
        case 'pnl': return dir * (a.pnl - b.pnl);
        case 'pnl_pct': return dir * (a.pnl_percent - b.pnl_percent);
        case 'weight': return dir * (a.weight - b.weight);
        case 'day': return dir * (a.day_change - b.day_change);
        case 'qty': return dir * (a.quantity - b.quantity);
        case 'avg': return dir * (a.avg_buy_price - b.avg_buy_price);
        default: return 0;
      }
    });
    return arr;
  }, [data?.holdings, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-36 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />)}
      </div>
      <div className="h-72 bg-gray-200 dark:bg-gray-800 rounded-xl" />
    </div>
  );

  const risk = data?.risk || {};
  const hl = data?.highlights || {};
  const pnl = data?.pnlBreakdown || {};
  const ts = data?.tradeStats || {};
  const isEmpty = !data?.holdings?.length;


  return (
    <div className="space-y-3">
      {/* ═══════════ HERO BANNER ═══════════ */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-2xl p-4 border border-green-100 dark:border-green-900/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Portfolio value</p>
            <h2 className="text-3xl font-bold">{formatCurrency(data?.currentValue || 0)}</h2>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Total invested</p>
              <p className="font-semibold">{formatCurrency(data?.investedValue || 0)}</p>
            </div>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Available cash</p>
              <p className="font-semibold">{formatCurrency(data?.balance || 0)}</p>
            </div>
            {(data as any)?.returns?.xirr != null && (
              <>
                <div className="w-px bg-gray-200 dark:bg-gray-700" />
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end"><Calculator className="w-3 h-3" />XIRR</p>
                  <p className={cn('font-semibold', (data as any).returns.xirr >= 0 ? 'text-gain' : 'text-loss')}>{(data as any).returns.xirr >= 0 ? '+' : ''}{(data as any).returns.xirr}%</p>
                </div>
              </>
            )}
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center">
              <div className="flex gap-1">
                {(['transactions', 'holdings'] as const).map(t => (
                  <a key={t} href={`/api/portfolio/export?type=${t}`} download className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-groww-primary hover:text-groww-primary transition">
                    <Download className="w-3 h-3" />{t.slice(0, 4).charAt(0).toUpperCase() + t.slice(1, 5)}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Health — benchmark vs Nifty, drawdown & risk alerts */}
      <PortfolioHealth />

      {isEmpty ? (
        <div className="text-center py-20 bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800">
          <PiggyBank className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Holdings Yet</h3>
          <p className="text-sm text-gray-500 mb-4">Start investing to see your portfolio analytics here</p>
          <Link to="/market" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-groww-primary text-white text-sm font-medium hover:opacity-90 transition">
            Explore Market <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* ═══════════ PORTFOLIO HEALTH SCORECARD ═══════════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ScoreCard icon={Shield} label="Diversification" value={`${risk.diversificationScore || 0}/100`}
              color={risk.diversificationScore >= 70 ? 'green' : risk.diversificationScore >= 40 ? 'yellow' : 'red'}
              sub={`${risk.holdingsCount} stocks · ${risk.sectorsCount} sectors`} />
            <ScoreCard icon={Target} label="Win Rate" value={`${risk.winRate || 0}%`}
              color={(risk.winRate || 0) >= 60 ? 'green' : (risk.winRate || 0) >= 40 ? 'yellow' : 'red'}
              sub={`${data?.holdings?.filter((h:any)=>h.pnl>=0).length || 0} of ${risk.holdingsCount} in profit`} />
            <ScoreCard icon={Activity} label="Concentration" value={`${risk.top3Weight?.toFixed(0) || 0}%`}
              color={(risk.top3Weight || 0) <= 60 ? 'green' : (risk.top3Weight || 0) <= 80 ? 'yellow' : 'red'}
              sub={`Top 3 stocks · HHI ${risk.hhi || 0}`} />
            <ScoreCard icon={Repeat} label="Trades" value={`${(ts.totalBuys || 0) + (ts.totalSells || 0)}`}
              color="blue"
              sub={`${ts.totalBuys || 0} buys · ${ts.totalSells || 0} sells`} />
          </div>

          {/* ═══════════ PERFORMANCE HIGHLIGHTS ═══════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {hl.bestPerformer && (
              <Link to={`/terminal/${hl.bestPerformer.symbol}?exchange=NSE&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-gain" />
                  <span className="text-xs font-medium text-gray-500 uppercase">Best Performer</span>
                </div>
                <div className="flex items-center gap-3">
                  <StockLogo symbol={hl.bestPerformer.symbol} size={44} />
                  <div>
                    <p className="font-semibold">{hl.bestPerformer.symbol}</p>
                    <p className="text-sm text-gain font-medium">{formatPercent(hl.bestPerformer.pnl_percent)}</p>
                  </div>
                </div>
              </Link>
            )}
            {hl.worstPerformer && (
              <Link to={`/terminal/${hl.worstPerformer.symbol}?exchange=NSE&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-loss" />
                  <span className="text-xs font-medium text-gray-500 uppercase">Worst Performer</span>
                </div>
                <div className="flex items-center gap-3">
                  <StockLogo symbol={hl.worstPerformer.symbol} size={44} />
                  <div>
                    <p className="font-semibold">{hl.worstPerformer.symbol}</p>
                    <p className="text-sm text-loss font-medium">{formatPercent(hl.worstPerformer.pnl_percent)}</p>
                  </div>
                </div>
              </Link>
            )}
            {hl.biggestHolding && (
              <Link to={`/terminal/${hl.biggestHolding.symbol}?exchange=NSE&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase">Biggest Position</span>
                </div>
                <div className="flex items-center gap-3">
                  <StockLogo symbol={hl.biggestHolding.symbol} size={44} />
                  <div>
                    <p className="font-semibold">{hl.biggestHolding.symbol}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{formatCurrency(hl.biggestHolding.current_value)} · {hl.biggestHolding.weight}%</p>
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* ═══════════ ALLOCATION CHARTS ═══════════ */}
          <div className="grid grid-cols-1 gap-5">
            {/* Sector Donut */}
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-500" /> Sector Allocation</h3>
              <div className="h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.sectorAllocation || []} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} label={({name, percent}: any) => `${name} ${percent}%`} labelLine={false}>
                      {(data?.sectorAllocation || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(data?.sectorAllocation || []).map((s: any, i: number) => (
                  <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {s.name} <span className="text-gray-400">{s.percent}%</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ═══════════ P&L BREAKDOWN ═══════════ */}
          <div className="grid grid-cols-1 gap-5">
            {/* Realized vs Unrealized */}
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gain" /> P&L Breakdown</h3>
              <div className="space-y-3">
                <PnlRow label="Unrealized P&L" value={pnl.unrealized} />
                <PnlRow label="Realized P&L" value={pnl.realized} />
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <PnlRow label="Total P&L" value={pnl.total} bold />
                </div>
              </div>
              <div className="pt-2 space-y-2 text-xs text-gray-500">
                <div className="flex justify-between"><span>Buy Volume</span><span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(ts.buyVolume || 0)}</span></div>
                <div className="flex justify-between"><span>Sell Volume</span><span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(ts.sellVolume || 0)}</span></div>
              </div>
            </div>
          </div>



          {/* ═══════════ HOLDINGS / TRANSACTIONS / P&L TABS ═══════════ */}
          <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto select-none no-scrollbar">
              <button onClick={() => setTab('holdings')} className={cn('flex-1 py-3 px-3 text-xs sm:text-sm font-medium transition whitespace-nowrap', tab === 'holdings' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Holdings ({risk.holdingsCount || 0})
              </button>
              <button onClick={() => setTab('transactions')} className={cn('flex-1 py-3 px-3 text-xs sm:text-sm font-medium transition whitespace-nowrap', tab === 'transactions' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Transactions ({data?.transactions?.length || 0})
              </button>
              <button onClick={() => setTab('pnl')} className={cn('flex-1 py-3 px-3 text-xs sm:text-sm font-medium transition whitespace-nowrap', tab === 'pnl' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Realized P&L
              </button>
              <button onClick={() => setTab('analytics')} className={cn('flex-1 py-3 px-3 text-xs sm:text-sm font-medium transition whitespace-nowrap', tab === 'analytics' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Analytics &amp; Heatmap
              </button>
            </div>

            {tab === 'holdings' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-3 py-3">Current Price</th>
                      <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('pnl')}>P&L {sortKey === 'pnl' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                      <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('qty')}>Quantity {sortKey === 'qty' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                      <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('avg')}>Average Price {sortKey === 'avg' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHoldings.map((h: any) => (
                      <tr key={h.symbol} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        <td className="px-4 py-3">
                          <Link to={`/terminal/${h.symbol}?exchange=${h.exchange || 'NSE'}&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5">
                            <StockLogo symbol={h.symbol} size={40} />
                            <div>
                              <p className="font-medium text-sm">{h.name}</p>
                              <p className="text-[10px] text-gray-500">{h.symbol}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-3 tabular-nums font-medium">{formatCurrency(h.current_price)}</td>
                        <td className={cn('px-3 py-3 tabular-nums font-medium', h.pnl >= 0 ? 'text-gain' : 'text-loss')}>
                          {h.pnl >= 0 ? '+' : ''}{formatCurrency(h.pnl)} / {h.pnl_percent >= 0 ? '+' : ''}{formatPercent(h.pnl_percent)}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-xs text-gray-500">{h.quantity} shares</td>
                        <td className="px-3 py-3 tabular-nums text-xs text-gray-500">Avg {formatCurrency(h.avg_buy_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'transactions' && (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[500px] overflow-y-auto">
                {(data?.transactions || []).map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                    <div className="flex items-center gap-3">
                      <StockLogo symbol={t.symbol} size={36} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase', t.type === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
                            {t.type}
                          </span>
                          <span className="font-medium text-sm">{t.symbol}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{t.quantity} × {formatCurrency(t.price)} · {formatDbDate(t.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm tabular-nums">{formatCurrency(t.total_amount)}</span>
                  </div>
                ))}
                {!data?.transactions?.length && (
                  <p className="text-center text-sm text-gray-500 py-8">No transactions yet</p>
                )}
              </div>
            )}

            {tab === 'pnl' && (
              <div>
                {tradePnl ? (
                  <>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <span className="text-sm text-gray-500">Total Realized P&L</span>
                      <span className={cn('font-bold tabular-nums', (tradePnl.totalRealized || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                        {(tradePnl.totalRealized || 0) >= 0 ? '+' : ''}{formatCurrency(tradePnl.totalRealized || 0)}
                      </span>
                    </div>
                    {tradePnl.trades.length > 0 ? (
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white dark:bg-groww-card z-10">
                            <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                              <th className="px-4 py-2.5">Symbol</th>
                              <th className="px-3 py-2.5">Qty</th>
                              <th className="px-3 py-2.5">Buy Price</th>
                              <th className="px-3 py-2.5">Sell Price</th>
                              <th className="px-3 py-2.5">Realized P&L</th>
                              <th className="px-3 py-2.5">Sell Date</th>
                              <th className="px-3 py-2.5 text-center">Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tradePnl.trades.map((t: any) => (
                              <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2.5">
                                  <Link to={`/terminal/${t.symbol}?exchange=NSE&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-groww-primary">{t.symbol}</Link>
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-gray-600 dark:text-gray-400">{t.quantity}</td>
                                <td className="px-3 py-2.5 tabular-nums">{formatCurrency(t.buy_price)}</td>
                                <td className="px-3 py-2.5 tabular-nums">{formatCurrency(t.sell_price)}</td>
                                <td className={cn('px-3 py-2.5 tabular-nums font-semibold', t.realized_pnl >= 0 ? 'text-gain' : 'text-loss')}>
                                  {t.realized_pnl >= 0 ? '+' : ''}{formatCurrency(t.realized_pnl)}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-400">
                                  {t.sell_date ? new Date(t.sell_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={() => setSelectedShareTrade(t)}
                                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-groww-primary hover:text-groww-primary text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition inline-flex items-center justify-center active:scale-95"
                                    title="Generate Share Card"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-sm text-gray-500 py-8">No realized trades yet — sell a stock to see P&L here</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {tab === 'analytics' && (
              <div className="p-4 space-y-5 animate-[fadeIn_.2s_ease]">
                {/* 1. KPIs Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 uppercase font-medium">Sharpe Ratio</p>
                    <p className="text-xl font-bold mt-1 text-indigo-500">{riskMetrics?.sharpe != null ? riskMetrics.sharpe : '—'}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Risk-adjusted return vs 6.5% RF</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 uppercase font-medium">Profit Factor</p>
                    <p className={cn("text-xl font-bold mt-1", (profitFactor ?? 1) >= 1.5 ? 'text-gain' : 'text-loss')}>
                      {profitFactor != null ? profitFactor : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">Gross gains / Gross losses</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 uppercase font-medium">Win Rate (Realized)</p>
                    <p className="text-xl font-bold mt-1 text-emerald-500">{winRate}%</p>
                    <p className="text-[10px] text-gray-400 mt-1">{tradePnl?.trades?.filter((t:any) => t.realized_pnl >= 0).length || 0} of {tradePnl?.trades?.length || 0} closed wins</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 uppercase font-medium">Max Drawdown</p>
                    <p className="text-xl font-bold mt-1 text-red-500">
                      {drawdownData?.max_drawdown_pct != null ? `-${drawdownData.max_drawdown_pct}%` : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">Peak-to-trough max decline</p>
                  </div>
                </div>

                {/* 2. Equity Curve Chart */}
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-groww-primary" /> Equity Curve vs Nifty 50 (1Y % Return)
                  </h4>
                  {chartData.length > 0 ? (
                    <div className="h-64 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(v: any) => [`${v >= 0 ? '+' : ''}${v}%`]} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <Line type="monotone" dataKey="Portfolio" stroke="#00b386" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Nifty 50" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-center py-16 text-gray-400 text-xs">Waiting for benchmark history data (at least 2 days snapshot required)</p>
                  )}
                </div>

                {/* 3. GitHub contributions trading calendar heatmap */}
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                  <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" /> Trading Activity Heatmap
                  </h4>
                  <p className="text-[10px] text-gray-400 mb-3">Daily realized P&amp;L performance over the last 365 calendar days</p>
                  
                  {/* Heatmap grid */}
                  <div className="flex flex-col overflow-x-auto pb-2 pr-1">
                    <div className="grid grid-flow-col grid-rows-7 gap-[3px] min-w-[720px] self-start">
                      {heatmapDays.map((day, idx) => {
                        let colorClass = 'bg-gray-200 dark:bg-gray-800'; // neutral
                        let text = `${day.date}: No trades closed`;
                        
                        if (day.value != null) {
                          const val = day.value;
                          if (val > 0) {
                            colorClass = val < 2000 
                              ? 'bg-emerald-200 dark:bg-emerald-950 text-emerald-800' 
                              : val < 10000 
                                ? 'bg-emerald-400 dark:bg-emerald-800/80 text-white' 
                                : 'bg-emerald-600 dark:bg-emerald-600 text-white';
                            text = `${day.date}: +${formatCurrency(val)} Realized P&L`;
                          } else if (val < 0) {
                            colorClass = val > -2000 
                              ? 'bg-red-200 dark:bg-red-950 text-red-800' 
                              : val > -10000 
                                ? 'bg-red-400 dark:bg-red-800/80 text-white' 
                                : 'bg-red-600 dark:bg-red-600 text-white';
                            text = `${day.date}: -${formatCurrency(Math.abs(val))} Realized P&L`;
                          } else {
                            colorClass = 'bg-gray-300 dark:bg-gray-700';
                            text = `${day.date}: ₹0.00 Realized P&L`;
                          }
                        }

                        return (
                          <div
                            key={idx}
                            className={cn('w-2.5 h-2.5 rounded-sm relative group cursor-pointer hover:ring-1 hover:ring-white transition', colorClass)}
                          >
                            {/* Rich CSS Tooltip */}
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none border border-gray-800">
                              {text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Heatmap Legend */}
                  <div className="flex items-center gap-1.5 justify-end text-[10px] text-gray-400 mt-2">
                    <span>Loss</span>
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-600" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-200" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 dark:bg-gray-800" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                    <span>Profit</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 🏆 Trading Poster Share Modal 🏆 */}
      {selectedShareTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_.2s_ease]">
          <div className="bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-3xl p-6 w-full max-w-[480px] shadow-2xl relative">
            <button
              onClick={() => setSelectedShareTrade(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="font-bold text-base mb-2">Share Closed Trade</h3>
            <p className="text-xs text-gray-500 mb-4">Download a sleek trading card to share your performance on social media!</p>
            
            {/* Card preview container */}
            <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-lg bg-gray-50 dark:bg-black/60 p-2 flex items-center justify-center">
              <div 
                className="w-full aspect-[3/2] rounded-xl overflow-hidden"
                dangerouslySetInnerHTML={{ __html: generateShareSvg(selectedShareTrade) }}
              />
            </div>
            
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setSelectedShareTrade(null)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition active:scale-98"
              >
                Close
              </button>
              <button
                onClick={() => downloadSharePoster(selectedShareTrade)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-groww-primary text-white hover:brightness-110 transition shadow-md flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Download className="w-4 h-4" /> Download SVG Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ScoreCard({ icon: Icon, label, value, color, sub }: {
  icon: any; label: string; value: string; color: string; sub: string;
}) {
  const ring = {
    green: 'ring-green-400/30 text-green-600 dark:text-green-400',
    yellow: 'ring-yellow-400/30 text-yellow-600 dark:text-yellow-400',
    red: 'ring-red-400/30 text-red-600 dark:text-red-400',
    blue: 'ring-blue-400/30 text-blue-600 dark:text-blue-400',
  }[color] || '';
  const iconBg = {
    green: 'bg-green-50 dark:bg-green-900/20',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20',
    red: 'bg-red-50 dark:bg-red-900/20',
    blue: 'bg-blue-50 dark:bg-blue-900/20',
  }[color] || '';

  return (
    <div className={cn('bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 ring-1', ring)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
      </div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function PnlRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const v = value || 0;
  return (
    <div className="flex justify-between items-center">
      <span className={cn('text-sm', bold ? 'font-semibold' : 'text-gray-500')}>{label}</span>
      <span className={cn('tabular-nums font-medium', bold && 'font-bold', v >= 0 ? 'text-gain' : 'text-loss')}>
        {v >= 0 ? '+' : ''}{formatCurrency(v)}
      </span>
    </div>
  );
}
