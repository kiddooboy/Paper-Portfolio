import { useEffect, useState } from 'react';
import axios from 'axios';
import { Repeat, Pause, Play, Trash2, Plus } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import toast from 'react-hot-toast';

export default function SIPPage() {
  const [sips, setSips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ symbol: '', quantity: '1', frequency: 'weekly', day_of_week: '1', day_of_month: '1' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => axios.get('/api/sip').then(r => { setSips(r.data); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/sip', {
        symbol: form.symbol,
        quantity: Number(form.quantity),
        frequency: form.frequency,
        day_of_week: form.frequency === 'weekly' ? Number(form.day_of_week) : undefined,
        day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : undefined,
      });
      toast.success('SIP created!');
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create SIP');
    } finally { setSubmitting(false); }
  };

  const toggle = async (id: number) => {
    await axios.put(`/api/sip/${id}/toggle`);
    load();
  };

  const del = async (id: number) => {
    await axios.delete(`/api/sip/${id}`);
    toast.success('SIP cancelled');
    load();
  };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Repeat className="w-6 h-6 text-groww-primary" /> SIP Simulation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automate recurring stock purchases to simulate SIP investing</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">
          <Plus className="w-4 h-4" /> New SIP
        </button>
      </div>

      {showCreate && (
        <form onSubmit={create} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="font-bold">Create New SIP</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Symbol</label>
              <input value={form.symbol} onChange={e => setForm(f => ({...f, symbol: e.target.value.toUpperCase()}))} required placeholder="e.g. HDFCBANK" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Quantity per run</label>
              <input value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))} type="number" min="1" required className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-dark text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {form.frequency === 'weekly' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Day of week</label>
                <select value={form.day_of_week} onChange={e => setForm(f => ({...f, day_of_week: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-dark text-sm">
                  {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Day of month</label>
                <input value={form.day_of_month} onChange={e => setForm(f => ({...f, day_of_month: e.target.value}))} type="number" min="1" max="28" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition">
              {submitting ? 'Creating...' : 'Create SIP'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:border-gray-400 transition">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {sips.length === 0 && <div className="text-center py-16 text-gray-400">No SIPs set up yet. Create your first SIP to automate buying.</div>}
        {sips.map((sip: any) => (
          <div key={sip.id} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4 flex-wrap">
            <div className={cn('w-2 h-10 rounded-full shrink-0', sip.is_active ? 'bg-groww-primary' : 'bg-gray-300 dark:bg-gray-700')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold">{sip.symbol}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', sip.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800')}>
                  {sip.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                <span>Buy {sip.quantity} shares · {sip.frequency}</span>
                {sip.current_price > 0 && <span>≈ {formatCurrency(sip.current_price * sip.quantity)} per run</span>}
                <span>Next: {sip.next_run ? new Date(sip.next_run).toLocaleDateString('en-IN') : '—'}</span>
                <span>{sip.total_runs} runs completed</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggle(sip.id)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-groww-primary transition">
                {sip.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={() => del(sip.id)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-groww-loss hover:text-groww-loss transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
