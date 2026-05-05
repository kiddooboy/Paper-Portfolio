import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
  LineChart, Line, Legend,
} from 'recharts';
import StockLogo from '../components/StockLogo';
import {
  ArrowUpRight, TrendingUp,
  Shield, Target, Award, AlertTriangle, Activity,
  BarChart3, PiggyBank, Repeat, Play, RefreshCw,
} from 'lucide-react';

interface MCResult {
  current_value: number;
  scenarios: {
    optimistic: { monthly_values: number[]; final_value: number; total_return_pct: number };
    expected:   { monthly_values: number[]; final_value: number; total_return_pct: number };
    pessimistic:{ monthly_values: number[]; final_value: number; total_return_pct: number };
  };
  probability_scores: {
    probability_of_profit: number;
    var_95?: number;
    var_5?: number;
    [key: string]: any;
  };
}

const COLORS = ['#00B386', '#6366F1', '#F59E0B', '#EB5B3C', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

type SortKey = 'value' | 'pnl' | 'pnl_pct' | 'weight' | 'day' | 'qty' | 'avg';
type SortDir = 'asc' | 'desc';

export default function PortfolioPage() {
  const rawData = usePortfolioStore((s) => s.data);
  const portfolioLoading = usePortfolioStore((s) => s.loading);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tab, setTab] = useState<'holdings' | 'transactions' | 'pnl'>('holdings');
  const [tradePnl, setTradePnl] = useState<{ trades: any[]; totalRealized: number } | null>(null);
  const [mcResult, setMcResult] = useState<MCResult | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcError, setMcError] = useState<string | null>(null);
  const allQuotes = useMarketStore((s) => s.quotes);
  const loading = (portfolioLoading && !rawData);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const runSimulation = useCallback(async () => {
    setMcLoading(true);
    setMcError(null);
    try {
      const r = await axios.post('/api/monte-carlo');
      setMcResult(r.data);
    } catch (e: any) {
      setMcError(e?.response?.data?.error || 'Simulation failed. Please try again.');
    } finally {
      setMcLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'pnl' && !tradePnl) {
      axios.get('/api/portfolio/trade-pnl').then(r => setTradePnl(r.data)).catch(() => {});
    }
  }, [tab, tradePnl]);

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
    return { ...rawData, holdings, investedValue, currentValue, totalPnl, totalPnlPercent: +totalPnlPercent.toFixed(2) };
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
    <div className="space-y-5">
      {/* ═══════════ HERO BANNER ═══════════ */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-2xl p-6 border border-green-100 dark:border-green-900/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Portfolio value</p>
            <h2 className="text-3xl font-bold">{formatCurrency(data?.currentValue || 0)}</h2>
          </div>
          <div className="flex gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Total invested</p>
              <p className="font-semibold">{formatCurrency(data?.investedValue || 0)}</p>
            </div>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Available cash</p>
              <p className="font-semibold">{formatCurrency(data?.balance || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ MONTE CARLO FORECAST ═══════════ */}
      <MonteCarloPanel
        mcResult={mcResult}
        mcLoading={mcLoading}
        mcError={mcError}
        onRun={runSimulation}
        currentValue={data?.currentValue ?? 0}
        isEmpty={isEmpty}
      />

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
              <Link to={`/terminal/${hl.bestPerformer.symbol}?exchange=NSE`} className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
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
              <Link to={`/terminal/${hl.worstPerformer.symbol}?exchange=NSE`} className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
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
              <Link to={`/terminal/${hl.biggestHolding.symbol}?exchange=NSE`} className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
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
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setTab('holdings')} className={cn('flex-1 py-3 text-sm font-medium transition', tab === 'holdings' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Holdings ({risk.holdingsCount || 0})
              </button>
              <button onClick={() => setTab('transactions')} className={cn('flex-1 py-3 text-sm font-medium transition', tab === 'transactions' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Transactions ({data?.transactions?.length || 0})
              </button>
              <button onClick={() => setTab('pnl')} className={cn('flex-1 py-3 text-sm font-medium transition', tab === 'pnl' ? 'text-groww-primary border-b-2 border-groww-primary' : 'text-gray-500')}>
                Realized P&L
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
                      <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('weight')}>Weight {sortKey === 'weight' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHoldings.map((h: any) => (
                      <tr key={h.symbol} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        <td className="px-4 py-3">
                          <Link to={`/terminal/${h.symbol}?exchange=${h.exchange || 'NSE'}`} className="flex items-center gap-2.5">
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
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(h.weight, 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{h.weight}%</span>
                          </div>
                        </td>
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
                        <p className="text-[11px] text-gray-500 mt-0.5">{t.quantity} × {formatCurrency(t.price)} · {new Date(t.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
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
                            </tr>
                          </thead>
                          <tbody>
                            {tradePnl.trades.map((t: any) => (
                              <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2.5">
                                  <Link to={`/terminal/${t.symbol}?exchange=NSE`} className="font-medium hover:text-groww-primary">{t.symbol}</Link>
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
          </div>
        </>
      )}
    </div>
  );
}

/* ── Monte Carlo Panel ── */

function MonteCarloPanel({
  mcResult, mcLoading, mcError, onRun, currentValue, isEmpty,
}: {
  mcResult: MCResult | null;
  mcLoading: boolean;
  mcError: string | null;
  onRun: () => void;
  currentValue: number;
  isEmpty: boolean;
}) {
  const fmtVal = (v: number) => {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
    if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
    return formatCurrency(v);
  };

  const yFmt = (v: number) => {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000)     return `₹${(v / 1000).toFixed(0)}K`;
    return `₹${v}`;
  };

  const chartData = mcResult
    ? Array.from({ length: 61 }, (_, i) => ({
        month: i,
        label: i === 0 ? 'Now' : i % 12 === 0 ? `${i / 12}Y` : '',
        optimistic:  mcResult.scenarios.optimistic.monthly_values[i],
        expected:    mcResult.scenarios.expected.monthly_values[i],
        pessimistic: mcResult.scenarios.pessimistic.monthly_values[i],
      }))
    : [];

  const prob = mcResult?.probability_scores?.probability_of_profit;
  const varValue = mcResult?.probability_scores?.var_95 ?? mcResult?.probability_scores?.var_5;

  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-indigo-500" />
            </span>
            5-Year Portfolio Forecast
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 ml-9">Monte Carlo simulation · 1,000 runs · based on NSE historical data</p>
        </div>
        <button
          onClick={onRun}
          disabled={mcLoading || isEmpty}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition',
            mcResult
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              : 'bg-indigo-600 text-white hover:bg-indigo-700',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {mcLoading
            ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Running…</>
            : mcResult
            ? <><RefreshCw className="w-3.5 h-3.5" /> Re-run</>
            : <><Play className="w-3.5 h-3.5 fill-current" /> Run Simulation</>
          }
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {mcError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {mcError}
          </div>
        )}

        {!mcResult && !mcLoading && !mcError && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200">See where your portfolio could go</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">
                Run a Monte Carlo simulation across 1,000 scenarios to forecast your 5-year portfolio range based on real NSE market data.
              </p>
            </div>
            {isEmpty && <p className="text-xs text-orange-500">Add holdings to your portfolio to run a simulation.</p>}
          </div>
        )}

        {mcLoading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm">Running 1,000 simulations…</p>
            <p className="text-xs text-gray-300">This usually takes 2–4 seconds</p>
          </div>
        )}

        {mcResult && !mcLoading && (
          <div className="space-y-5">
            {/* 3 scenario cards */}
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'optimistic',  label: 'Optimistic',  color: 'text-gain',    bg: 'bg-green-50 dark:bg-green-900/20',  border: 'border-green-200 dark:border-green-800', pct: '85th %ile' },
                { key: 'expected',    label: 'Expected',    color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', pct: '50th %ile' },
                { key: 'pessimistic', label: 'Pessimistic', color: 'text-loss',    bg: 'bg-red-50 dark:bg-red-900/20',      border: 'border-red-200 dark:border-red-800',   pct: '15th %ile' },
              ] as const).map(({ key, label, color, bg, border, pct }) => {
                const s = mcResult.scenarios[key];
                const gain = s.total_return_pct >= 0;
                return (
                  <div key={key} className={cn('rounded-xl border p-3', bg, border)}>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-[10px] text-gray-400 mb-1">{pct}</p>
                    <p className="font-bold text-sm tabular-nums text-gray-800 dark:text-gray-100">{fmtVal(s.final_value)}</p>
                    <p className={cn('text-xs font-semibold tabular-nums', color)}>
                      {gain ? '+' : ''}{s.total_return_pct.toFixed(1)}%
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Fan chart */}
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={yFmt}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    width={56}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <ReferenceLine y={currentValue} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'Today', position: 'insideTopLeft', fontSize: 9, fill: '#9ca3af' }} />
                  <Tooltip
                    formatter={(v: any, name: string) => [fmtVal(Number(v)), name.charAt(0).toUpperCase() + name.slice(1)]}
                    labelFormatter={(label) => label ? `Month ${chartData.findIndex(d => d.label === label) || label}` : ''}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="optimistic"  stroke="#00B386" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expected"    stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pessimistic" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Probability + VaR */}
            <div className="grid grid-cols-2 gap-3">
              {prob !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Probability of Profit</p>
                  <p className={cn('text-2xl font-extrabold tabular-nums', prob >= 0.5 ? 'text-gain' : 'text-loss')}>
                    {(prob * 100).toFixed(1)}%
                  </p>
                  <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-groww-primary rounded-full" style={{ width: `${(prob * 100).toFixed(0)}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">chance of positive return in 5Y</p>
                </div>
              )}
              {varValue !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Value at Risk (95%)</p>
                  <p className="text-2xl font-extrabold tabular-nums text-loss">{fmtVal(Math.abs(varValue))}</p>
                  <p className="text-[10px] text-gray-400 mt-1">max expected loss in worst 5% scenarios</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
