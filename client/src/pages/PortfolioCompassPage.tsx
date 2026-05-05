import { useCallback, useState } from 'react';
import axios from 'axios';
import { formatCurrency, cn } from '../lib/utils';
import { usePortfolioStore } from '../store/portfolioStore';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ReferenceLine, Legend, Tooltip,
} from 'recharts';
import {
  Compass, Play, RefreshCw, Activity, BarChart3, AlertTriangle,
} from 'lucide-react';

interface MCScenario {
  monthly_values: number[];
  terminal_value: number;
  cagr_pct: number;
  absolute_return: number;
  percentage_return: number;
  label: string;
  percentile: number;
  confidence_band: { lower: number; upper: number };
}
interface MCResult {
  current_value: number;
  scenarios: { optimistic: MCScenario; expected: MCScenario; pessimistic: MCScenario };
  probability_scores: {
    probability_of_profit: number;
    probability_of_doubling: number;
    probability_of_major_loss_20pct: number;
    value_at_risk_5pct: number;
    var_drawdown_pct: number;
    conditional_var: number;
    annualized_sharpe_ratio: number;
  };
  holdings_analysis: {
    symbol: string; weight_pct: number;
    return_1y_pct: number; cagr_3y_pct: number;
  }[];
}

function fmtVal(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return formatCurrency(v);
}

function yFmt(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export default function PortfolioCompassPage() {
  const rawData = usePortfolioStore((s) => s.data);
  const isEmpty = !rawData?.holdings?.length;
  const currentValue = (rawData as any)?.currentValue ?? 0;

  const [mcResult, setMcResult] = useState<MCResult | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcError, setMcError] = useState<string | null>(null);

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

  const chartData = mcResult
    ? Array.from({ length: 61 }, (_, i) => ({
        month: i,
        label: i === 0 ? 'Now' : i % 12 === 0 ? `${i / 12}Y` : '',
        optimistic:  mcResult.scenarios.optimistic.monthly_values[i],
        expected:    mcResult.scenarios.expected.monthly_values[i],
        pessimistic: mcResult.scenarios.pessimistic.monthly_values[i],
      }))
    : [];

  const ps = mcResult?.probability_scores;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#00B386)' }}>
              <Compass className="w-5 h-5 text-white" />
            </span>
            Portfolio Compass
          </h1>
          <p className="text-sm text-gray-400 mt-1 ml-11">5-year Monte Carlo simulation · 1,000 runs · NSE historical data</p>
        </div>
        <button
          onClick={runSimulation}
          disabled={mcLoading || isEmpty}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm',
            mcResult
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              : 'text-white hover:opacity-90',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
          style={!mcResult ? { background: 'linear-gradient(135deg,#6366f1,#00B386)' } : {}}
        >
          {mcLoading
            ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Running…</>
            : mcResult
            ? <><RefreshCw className="w-3.5 h-3.5" /> Re-run</>
            : <><Play className="w-3.5 h-3.5 fill-current" /> Run Simulation</>
          }
        </button>
      </div>

      {/* Error */}
      {mcError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {mcError}
        </div>
      )}

      {/* Empty / idle state */}
      {!mcResult && !mcLoading && !mcError && (
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-12 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f120,#00B38620)' }}>
            <BarChart3 className="w-10 h-10 text-indigo-400" />
          </div>
          <div>
            <p className="font-bold text-lg text-gray-700 dark:text-gray-200">See where your holdings could go</p>
            <p className="text-sm text-gray-400 mt-1.5 max-w-md">
              Run a Monte Carlo simulation across 1,000 scenarios to forecast your 5-year portfolio range based on real NSE market data and correlations.
            </p>
          </div>
          {isEmpty && (
            <p className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg">
              Add holdings to your portfolio first to run a simulation.
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {mcLoading && (
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-16 flex flex-col items-center gap-4 text-gray-400">
          <div className="w-14 h-14 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-base font-semibold text-gray-600 dark:text-gray-300">Running 1,000 simulations…</p>
            <p className="text-sm mt-1">This usually takes 2–8 seconds</p>
          </div>
        </div>
      )}

      {/* Results */}
      {mcResult && !mcLoading && (
        <div className="space-y-5">
          {/* 3 scenario cards */}
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: 'optimistic'  as const, color: 'text-gain',   gradFrom: '#00B38615', gradTo: '#00B38605', border: 'border-green-200 dark:border-green-800',   ringColor: '#00B386' },
              { key: 'expected'    as const, color: 'text-indigo-600 dark:text-indigo-400', gradFrom: '#6366f115', gradTo: '#6366f105', border: 'border-indigo-200 dark:border-indigo-800', ringColor: '#6366f1' },
              { key: 'pessimistic' as const, color: 'text-loss',   gradFrom: '#ef444415', gradTo: '#ef444405', border: 'border-red-200 dark:border-red-800',       ringColor: '#ef4444' },
            ]).map(({ key, color, gradFrom, border }) => {
              const s = mcResult.scenarios[key];
              const gain = s.percentage_return >= 0;
              return (
                <div key={key} className={cn('rounded-2xl border p-5', border)} style={{ background: gradFrom }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{s.label}</p>
                    <span className="text-[10px] text-gray-400 bg-white/60 dark:bg-gray-800/60 px-2 py-0.5 rounded-full">{s.percentile}th %ile</span>
                  </div>
                  <p className="text-2xl font-extrabold tabular-nums text-gray-800 dark:text-gray-100">{fmtVal(s.terminal_value)}</p>
                  <p className={cn('text-sm font-bold tabular-nums mt-0.5', color)}>
                    {gain ? '+' : ''}{s.percentage_return.toFixed(1)}% total
                  </p>
                  <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 flex justify-between text-[11px] text-gray-400">
                    <span>CAGR <strong className={cn('font-semibold', color)}>{s.cagr_pct.toFixed(1)}%</strong></span>
                    <span>5Y gain <strong className="text-gray-600 dark:text-gray-300">{fmtVal(Math.abs(s.absolute_return))}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fan chart */}
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" /> 5-Year Projection Fan
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 10, fill: '#9ca3af' }} width={58} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <ReferenceLine y={currentValue} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: 'Today', position: 'insideTopLeft', fontSize: 9, fill: '#9ca3af' }} />
                  <Tooltip
                    formatter={(v: any, name: string) => [fmtVal(Number(v)), name]}
                    labelFormatter={(l) => l || ''}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <Line type="monotone" dataKey="optimistic"  name="Bull Case (85th)" stroke="#00B386" strokeWidth={1.5} strokeDasharray="6 3" dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expected"    name="Base Case (50th)" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pessimistic" name="Bear Case (15th)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk metrics */}
          {ps && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Prob. of Profit</p>
                <p className={cn('text-2xl font-extrabold tabular-nums', ps.probability_of_profit >= 50 ? 'text-gain' : 'text-loss')}>
                  {ps.probability_of_profit.toFixed(1)}%
                </p>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-groww-primary rounded-full" style={{ width: `${ps.probability_of_profit}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">chance of positive return</p>
              </div>
              <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Prob. of 2×</p>
                <p className="text-2xl font-extrabold tabular-nums text-indigo-600 dark:text-indigo-400">
                  {ps.probability_of_doubling.toFixed(1)}%
                </p>
                <p className="text-[10px] text-gray-400 mt-4">chance of doubling in 5Y</p>
              </div>
              <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Value at Risk (5%)</p>
                <p className="text-2xl font-extrabold tabular-nums text-loss">{fmtVal(ps.value_at_risk_5pct)}</p>
                <p className="text-[10px] text-gray-400 mt-4">floor in worst 5% scenarios</p>
              </div>
              <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Max Drawdown Risk</p>
                <p className="text-2xl font-extrabold tabular-nums text-loss">{ps.var_drawdown_pct.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-400 mt-4">downside from today</p>
              </div>
            </div>
          )}

          {/* Holdings breakdown */}
          {mcResult.holdings_analysis?.length > 0 && (
            <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <p className="text-sm font-semibold mb-3">Holdings Used in Simulation</p>
              <div className="space-y-2">
                {mcResult.holdings_analysis.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between text-xs px-3 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl">
                    <span className="font-semibold text-gray-700 dark:text-gray-200 w-28 truncate">{h.symbol.replace('.NS', '')}</span>
                    <span className="text-gray-400">{h.weight_pct.toFixed(1)}% weight</span>
                    <span className={cn('font-medium tabular-nums', h.return_1y_pct >= 0 ? 'text-gain' : 'text-loss')}>
                      1Y: {h.return_1y_pct >= 0 ? '+' : ''}{h.return_1y_pct.toFixed(1)}%
                    </span>
                    <span className={cn('font-medium tabular-nums', h.cagr_3y_pct >= 0 ? 'text-gain' : 'text-loss')}>
                      3Y CAGR: {h.cagr_3y_pct >= 0 ? '+' : ''}{h.cagr_3y_pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
