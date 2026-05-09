import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { cn, formatCurrency } from '../lib/utils';
import { Info } from 'lucide-react';

export default function FIIDIIPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'fii' | 'dii'>('all');

  useEffect(() => {
    axios.get('/api/market/fii-dii').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  const history = data?.history || [];

  const chartData = history.map((d: any) => ({
    date: d.date.slice(5),
    FII: d.fii_net,
    DII: d.dii_net,
    Net: d.net,
  }));

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">FII / DII Activity</h1>
        <p className="text-sm text-gray-500 mt-0.5">Foreign & domestic institutional investor flows (30-day)</p>
      </div>

      {data?.note && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{data.note}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'FII 30D Net', val: data?.summary?.fii_30d, color: data?.summary?.fii_30d >= 0 ? 'text-gain' : 'text-loss' },
          { label: 'DII 30D Net', val: data?.summary?.dii_30d, color: data?.summary?.dii_30d >= 0 ? 'text-gain' : 'text-loss' },
          { label: 'Overall Net', val: data?.summary?.net_30d, color: data?.summary?.net_30d >= 0 ? 'text-gain' : 'text-loss' },
          { label: 'Nifty 50', val: data?.nifty?.price, sub: `${data?.nifty?.change_percent >= 0 ? '+' : ''}${data?.nifty?.change_percent?.toFixed(2)}%`, color: data?.nifty?.change_percent >= 0 ? 'text-gain' : 'text-loss' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className={cn('font-bold text-base tabular-nums', c.color)}>
              {c.val !== undefined ? (c.label === 'Nifty 50' ? formatCurrency(c.val) : `${c.val >= 0 ? '+' : ''}₹${Math.abs(c.val).toLocaleString('en-IN')} Cr`) : '—'}
            </div>
            {c.sub && <div className={cn('text-xs font-semibold', c.color)}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Toggle */}
      <div className="flex gap-2">
        {(['all', 'fii', 'dii'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition', filter === f ? 'bg-groww-primary text-white' : 'border border-gray-200 dark:border-gray-700 hover:border-groww-primary')}>
            {f === 'all' ? 'FII + DII' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="font-semibold mb-4 text-sm">Daily Net Flows (₹ Cr)</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')} Cr`]} />
            <ReferenceLine y={0} stroke="#666" />
            {(filter === 'all' || filter === 'fii') && <Bar dataKey="FII" fill="#00B386" radius={[2, 2, 0, 0]} />}
            {(filter === 'all' || filter === 'dii') && <Bar dataKey="DII" fill="#6366f1" radius={[2, 2, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* History table */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
            <th className="text-left px-4 py-3 text-gray-500 font-semibold">Date</th>
            <th className="text-right px-4 py-3 text-gray-500 font-semibold">FII Net</th>
            <th className="text-right px-4 py-3 text-gray-500 font-semibold">DII Net</th>
            <th className="text-right px-4 py-3 text-gray-500 font-semibold">Overall</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {[...history].reverse().slice(0, 20).map((d: any) => (
              <tr key={d.date} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                <td className="px-4 py-2.5 font-mono text-xs">{d.date}</td>
                <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-semibold', d.fii_net >= 0 ? 'text-gain' : 'text-loss')}>{d.fii_net >= 0 ? '+' : ''}₹{Math.abs(d.fii_net).toLocaleString('en-IN')} Cr</td>
                <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-semibold', d.dii_net >= 0 ? 'text-gain' : 'text-loss')}>{d.dii_net >= 0 ? '+' : ''}₹{Math.abs(d.dii_net).toLocaleString('en-IN')} Cr</td>
                <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-semibold', d.net >= 0 ? 'text-gain' : 'text-loss')}>{d.net >= 0 ? '+' : ''}₹{Math.abs(d.net).toLocaleString('en-IN')} Cr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
