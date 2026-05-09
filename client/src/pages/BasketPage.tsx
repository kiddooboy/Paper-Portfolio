import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShoppingBag, Plus, Trash2, Zap } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import toast from 'react-hot-toast';

export default function BasketPage() {
  const [baskets, setBaskets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', items: [{ symbol: '', quantity: '1', transaction_type: 'BUY' }] });
  const [executing, setExecuting] = useState<number | null>(null);

  const load = () => axios.get('/api/baskets').then(r => { setBaskets(r.data); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { symbol: '', quantity: '1', transaction_type: 'BUY' }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: string, val: string) => setForm(f => ({ ...f, items: f.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) }));

  const create = async (e: any) => {
    e.preventDefault();
    try {
      await axios.post('/api/baskets', { ...form, items: form.items.filter(i => i.symbol).map(i => ({ ...i, quantity: Number(i.quantity) })) });
      toast.success('Basket created!');
      setShowCreate(false);
      setForm({ name: '', description: '', items: [{ symbol: '', quantity: '1', transaction_type: 'BUY' }] });
      load();
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Failed'); }
  };

  const execute = async (id: number) => {
    setExecuting(id);
    try {
      const r = await axios.post(`/api/baskets/${id}/execute`);
      toast.success(`Executed ${r.data.filled}/${r.data.total} orders`);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Execution failed'); }
    finally { setExecuting(null); }
  };

  const del = async (id: number) => {
    await axios.delete(`/api/baskets/${id}`);
    toast.success('Basket deleted');
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-groww-primary" /> Basket Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Buy/sell multiple stocks in one click</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">
          <Plus className="w-4 h-4" /> New Basket
        </button>
      </div>

      {showCreate && (
        <form onSubmit={create} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="font-bold">Create Basket</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-500 mb-1 block">Basket Name</label><input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" /></div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500">Stocks</div>
            {form.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={item.symbol} onChange={e => updateItem(i, 'symbol', e.target.value.toUpperCase())} placeholder="Symbol" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
                <input value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} type="number" min="1" className="w-20 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
                <select value={item.transaction_type} onChange={e => updateItem(i, 'transaction_type', e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-dark text-sm">
                  <option>BUY</option><option>SELL</option>
                </select>
                {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="p-2 text-groww-loss hover:opacity-80"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-xs text-groww-primary hover:underline">+ Add stock</button>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-groww-primary text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm transition">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {baskets.length === 0 && <div className="text-center py-16 text-gray-400">No baskets yet. Create one to batch-execute multiple trades.</div>}
        {baskets.map((basket: any) => (
          <div key={basket.id} className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold">{basket.name}</div>
                <div className="text-xs text-gray-500">{basket.stock_count} stocks · Est. {formatCurrency(basket.estimated_value)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => execute(basket.id)} disabled={executing === basket.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-groww-primary text-white rounded-lg text-xs font-semibold hover:bg-green-600 disabled:opacity-50 transition">
                  <Zap className="w-3.5 h-3.5" />{executing === basket.id ? 'Executing...' : 'Execute All'}
                </button>
                <button onClick={() => del(basket.id)} className="p-1.5 text-gray-400 hover:text-groww-loss transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(basket.items || []).map((item: any) => (
                <div key={item.symbol} className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', item.transaction_type === 'BUY' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400')}>
                  <span>{item.symbol}</span>
                  <span className="opacity-70">×{item.quantity}</span>
                  {item.price > 0 && <span className="opacity-70">@ {formatCurrency(item.price)}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
