import { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, TrendingDown, Activity, BarChart2, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';


export default function MarketOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'gainers' | 'losers' | 'active' | '52high' | '52low'>('gainers');

  useEffect(() => {
    axios.get('/api/market/overview').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  const tabs = [
    { key: 'gainers', label: 'Top Gainers', icon: TrendingUp, color: 'text-gain' },
    { key: 'losers', label: 'Top Losers', icon: TrendingDown, color: 'text-loss' },
    { key: 'active', label: 'Most Active', icon: Activity, color: 'text-blue-400' },
    { key: '52high', label: '52W High', icon: BarChart2, color: 'text-amber-400' },
    { key: '52low', label: '52W Low', icon: AlertTriangle, color: 'text-orange-400' },
  ] as const;

  const listMap: Record<string, any[]> = {
    gainers: data?.gainers || [],
    losers: data?.losers || [],
    active: data?.most_active || [],
    '52high': data?.near_52w_high || [],
    '52low': data?.near_52w_low || [],
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Market Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{data?.total_stocks || 0} NSE stocks tracked live</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition',
              tab === t.key ? 'bg-groww-primary text-white' : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-groww-primary'
            )}>
            <t.icon className={cn('w-3.5 h-3.5', tab === t.key ? 'text-white' : t.color)} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Stock</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Price</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Change</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Volume</th>
                {(tab === '52high' || tab === '52low') && (
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {tab === '52high' ? '52W High' : '52W Low'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {listMap[tab]?.map((stock: any, i) => (
                <tr key={stock.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link to={`/stock/${stock.symbol}`} className="hover:text-groww-primary transition">
                      <div className="font-semibold">{stock.symbol}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{stock.name}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(stock.price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('text-sm font-semibold', stock.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                      {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {stock.volume ? (stock.volume / 1000).toFixed(0) + 'K' : '—'}
                  </td>
                  {(tab === '52high' || tab === '52low') && (
                    <td className="px-4 py-3 text-right hidden sm:table-cell font-mono text-xs text-amber-500">
                      {tab === '52high' ? formatCurrency(stock.high_52w) : formatCurrency(stock.low_52w)}
                    </td>
                  )}
                </tr>
              ))}
              {!listMap[tab]?.length && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
