import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { cn, formatCurrency } from '../lib/utils';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/collections').then(r => { setCollections(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const openCollection = async (id: number) => {
    const r = await axios.get(`/api/collections/${id}`);
    setSelected(r.data);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collections & Themes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Curated stock baskets by theme and sector</p>
      </div>

      {!selected ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">No collections yet. Ask an admin to seed collections.</div>
          )}
          {collections.map((c: any) => (
            <button key={c.id} onClick={() => openCollection(c.id)}
              className="bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-left hover:border-groww-primary hover:shadow-lg transition group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: (c.color || '#00B386') + '20' }}>
                  {c.icon || '📊'}
                </div>
                <div>
                  <div className="font-bold group-hover:text-groww-primary transition">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.stock_count} stocks</div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{c.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="text-sm text-groww-primary hover:underline">← Back</button>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{selected.icon || '📊'}</span>
              <div>
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <p className="text-sm text-gray-500">{selected.description}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Symbol</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Price</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Change</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Sector</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {(selected.items || []).map((item: any) => (
                  <tr key={item.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{item.symbol}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[140px]">{item.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{item.price > 0 ? formatCurrency(item.price) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('text-sm font-semibold', item.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                        {item.change_percent >= 0 ? '+' : ''}{item.change_percent?.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-xs text-gray-500">{item.sector || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/terminal/${item.symbol}`} className="text-xs bg-groww-primary text-white px-3 py-1.5 rounded-lg hover:bg-green-600 transition">
                        Trade
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
