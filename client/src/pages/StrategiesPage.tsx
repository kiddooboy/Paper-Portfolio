import { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Share2, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [tab, setTab] = useState<'feed' | 'mine'>('feed');
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', is_public: true });
  const [cloning, setCloning] = useState<number | null>(null);

  const load = () => {
    Promise.all([
      axios.get('/api/strategies').catch(() => ({ data: [] })),
      axios.get('/api/strategies/mine').catch(() => ({ data: [] })),
    ]).then(([pub, own]) => {
      setStrategies(pub.data);
      setMine(own.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const publish = async (e: any) => {
    e.preventDefault();
    try {
      await axios.post('/api/strategies', form);
      toast.success('Strategy published!');
      setShowPublish(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Failed'); }
  };

  const clone = async (id: number) => {
    setCloning(id);
    try {
      const r = await axios.post(`/api/strategies/${id}/clone`);
      toast.success(`Cloned! ${r.data.filled} stocks bought.`);
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Clone failed'); }
    finally { setCloning(null); }
  };

  const del = async (id: number) => {
    await axios.delete(`/api/strategies/${id}`);
    toast.success('Deleted');
    load();
  };

  const list = tab === 'feed' ? strategies : mine;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Share2 className="w-6 h-6 text-groww-primary" /> Strategy Sharing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Share your portfolio strategy or clone from others</p>
        </div>
        <button onClick={() => setShowPublish(!showPublish)} className="flex items-center gap-1.5 px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">
          <Plus className="w-4 h-4" /> Publish Mine
        </button>
      </div>

      <div className="flex gap-1">
        {(['feed', 'mine'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 rounded-full text-sm font-medium capitalize transition', tab === t ? 'bg-groww-primary text-white' : 'border border-gray-200 dark:border-gray-700 hover:border-groww-primary')}>
            {t === 'feed' ? 'Community' : 'My Strategies'}
          </button>
        ))}
      </div>

      {showPublish && tab === 'mine' && (
        <form onSubmit={publish} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="font-bold">Publish Strategy</h3>
          <div><label className="text-xs text-gray-500 mb-1 block">Strategy Name</label><input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" placeholder="e.g. Nifty Blue-chip Value" /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Description</label><textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm resize-none" rows={2} /></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({...f, is_public: e.target.checked}))} className="rounded" />
            Make public (visible to all users)
          </label>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">Publish</button>
            <button type="button" onClick={() => setShowPublish(false)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {list.length === 0 && <div className="text-center py-16 text-gray-400">{tab === 'feed' ? 'No strategies published yet.' : 'You haven\'t published any strategies.'}</div>}
        {list.map((s: any) => {
          const snapshot: any[] = Array.isArray(s.snapshot) ? s.snapshot : [];
          return (
            <div key={s.id} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="font-bold text-lg">{s.name}</div>
                  {s.author_name && <div className="text-xs text-gray-500">by {s.author_name} · {s.clones} clones</div>}
                  <p className="text-sm text-gray-500">{s.description}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {tab === 'feed' && (
                    <button onClick={() => clone(s.id)} disabled={cloning === s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-groww-primary text-white rounded-lg text-xs font-semibold hover:bg-green-600 disabled:opacity-50 transition">
                      <Copy className="w-3.5 h-3.5" />{cloning === s.id ? 'Cloning...' : 'Clone'}
                    </button>
                  )}
                  {tab === 'mine' && (
                    <button onClick={() => del(s.id)} className="p-1.5 text-gray-400 hover:text-groww-loss transition"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
              {snapshot.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {snapshot.slice(0, 8).map((h: any) => (
                    <span key={h.symbol} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full font-medium">{h.symbol} <span className="text-gray-400">{h.weight}%</span></span>
                  ))}
                  {snapshot.length > 8 && <span className="text-xs text-gray-400">+{snapshot.length - 8} more</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
