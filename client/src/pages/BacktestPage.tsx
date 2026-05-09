import { useEffect, useState } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn, formatCurrency } from '../lib/utils';
import { FlaskConical } from 'lucide-react';

export default function BacktestPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'1m' | '3m' | '6m' | '1y'>('6m');

  const load = (r: string) => {
    setLoading(true);
    axios.get(`/api/portfolio/backtest?range=${r}`).then(res => { setData(res.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(range); }, [range]);

  const snapshots = data?.snapshots || [];
  const last = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="w-6 h-6 text-groww-primary" /> Portfolio Backtest</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historical performance of your current portfolio allocation</p>
      </div>

      {/* Range selector */}
      <div className="flex gap-2">
        {(['1m', '3m', '6m', '1y'] as const).map(r => (
          <button key={r} onClick={() => setRange(r)} className={cn('px-4 py-1.5 rounded-full text-sm font-semibold transition', range === r ? 'bg-groww-primary text-white' : 'border border-gray-200 dark:border-gray-700 hover:border-groww-primary')}>
            {r === '1y' ? '1 Year' : r === '6m' ? '6 Mo' : r === '3m' ? '3 Mo' : '1 Mo'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No portfolio history available for this range. Keep trading to build history.</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Start Value', val: first ? formatCurrency(first.portfolio_value) : '—', sub: '' },
              { label: 'End Value', val: last ? formatCurrency(last.portfolio_value) : '—', sub: '' },
              { label: 'Total Return', val: last ? `${last.pnl_percent >= 0 ? '+' : ''}${last.pnl_percent.toFixed(2)}%` : '—', color: last?.pnl_percent >= 0 ? 'text-gain' : 'text-loss' },
              { label: 'Abs. P&L', val: last ? formatCurrency(Math.abs(last.pnl)) : '—', color: last?.pnl >= 0 ? 'text-gain' : 'text-loss', prefix: last?.pnl >= 0 ? '+' : '-' },
            ].map(c => (
              <div key={c.label} className="bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                <div className={cn('font-bold text-base', c.color || '')}>{c.prefix || ''}{c.val}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="font-semibold mb-4 text-sm">Portfolio Value Over Time</div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={snapshots} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00B386" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00B386" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.ceil(snapshots.length / 6)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: any, n: string) => [formatCurrency(v), n === 'portfolio_value' ? 'Portfolio' : 'Invested']} />
                <Area type="monotone" dataKey="portfolio_value" stroke="#00B386" fill="url(#pgGrad)" strokeWidth={2} name="portfolio_value" />
                <Area type="monotone" dataKey="invested_capital" stroke="#6366f1" fill="url(#capGrad)" strokeWidth={1.5} strokeDasharray="4 2" name="invested_capital" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-groww-primary inline-block" /> Portfolio Value</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block border-dashed border-t" /> Invested Capital</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
