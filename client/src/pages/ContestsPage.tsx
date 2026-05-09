import { useEffect, useState } from 'react';
import axios from 'axios';
import { Trophy, Users, Calendar, TrendingUp } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import toast from 'react-hot-toast';

export default function ContestsPage() {
  const [contests, setContests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeQty, setTradeQty] = useState('1');
  const [trading, setTrading] = useState(false);

  const load = () => axios.get('/api/contests').then(r => { setContests(r.data); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const join = async (id: number) => {
    await axios.post(`/api/contests/${id}/join`);
    toast.success('Joined contest!');
    load();
  };

  const openContest = async (c: any) => {
    setSelected(c);
    const r = await axios.get(`/api/contests/${c.id}/leaderboard`);
    setLeaderboard(r.data);
  };

  const trade = async (type: 'BUY' | 'SELL') => {
    if (!tradeSymbol || !tradeQty) return;
    setTrading(true);
    try {
      await axios.post(`/api/contests/${selected.id}/trade`, { symbol: tradeSymbol, type, quantity: Number(tradeQty) });
      toast.success(`${type} order executed!`);
      const r = await axios.get(`/api/contests/${selected.id}/leaderboard`);
      setLeaderboard(r.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Trade failed');
    } finally { setTrading(false); }
  };

  const statusColor = (s: string) => s === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : s === 'upcoming' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800';

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="w-7 h-7 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold">Trading Contests</h1>
          <p className="text-sm text-gray-500">Compete with others in time-limited trading challenges</p>
        </div>
      </div>

      {!selected ? (
        <div className="grid gap-4">
          {contests.length === 0 && <div className="text-center py-16 text-gray-400">No contests yet. Check back later!</div>}
          {contests.map((c: any) => (
            <div key={c.id} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{c.name}</h3>
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', statusColor(c.status))}>{c.status}</span>
                  </div>
                  <p className="text-sm text-gray-500">{c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.start_date?.slice(0,10)} → {c.end_date?.slice(0,10)}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.participantCount} participants</span>
                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Starting: {formatCurrency(c.starting_capital)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.status !== 'completed' && !c.joined && (
                    <button onClick={() => join(c.id)} className="px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">Join</button>
                  )}
                  <button onClick={() => openContest(c)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:border-groww-primary transition">
                    {c.joined ? 'Open' : 'View'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelected(null)} className="text-sm text-groww-primary hover:underline">← All Contests</button>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Trade panel */}
            {selected.joined && selected.status === 'active' && (
              <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <h3 className="font-bold">Place Trade</h3>
                <input value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value.toUpperCase())} placeholder="Symbol (e.g. RELIANCE)" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
                <input value={tradeQty} onChange={e => setTradeQty(e.target.value)} type="number" min="1" placeholder="Quantity" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => trade('BUY')} disabled={trading} className="py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition">BUY</button>
                  <button onClick={() => trade('SELL')} disabled={trading} className="py-2 bg-groww-loss text-white rounded-lg text-sm font-semibold hover:opacity-80 disabled:opacity-50 transition">SELL</button>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <div className={cn('bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden', selected.joined && selected.status === 'active' ? 'lg:col-span-2' : 'lg:col-span-3')}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-bold">Leaderboard</div>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-2.5 text-gray-500 font-semibold">#</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-semibold">Trader</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-semibold">Value</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-semibold">Return</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leaderboard.map((row: any) => (
                    <tr key={row.userId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3">
                        <span className={cn('font-bold text-sm', row.rank === 1 ? 'text-amber-400' : row.rank === 2 ? 'text-gray-400' : row.rank === 3 ? 'text-orange-400' : 'text-gray-500')}>{row.rank}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(row.portfolioValue)}</td>
                      <td className="px-4 py-3 text-right"><span className={cn('font-semibold', row.pnlPct >= 0 ? 'text-gain' : 'text-loss')}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct?.toFixed(2)}%</span></td>
                    </tr>
                  ))}
                  {!leaderboard.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No participants yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
