import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';
import { useWatchlistStore } from '../store/watchlistStore';
import StockLogo from '../components/StockLogo';
import GlobalSearch from '../components/GlobalSearch';

export default function WatchlistPage() {
  const watchlists = useWatchlistStore((s) => s.watchlists);
  const fetchWatchlists = useWatchlistStore((s) => s.fetch);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const allQuotes = useMarketStore((s) => s.quotes);

  const fetch = () => fetchWatchlists(true);
  useEffect(() => { fetchWatchlists(); }, [fetchWatchlists]);

  // Enrich watchlist items with live prices from global store
  const enrichedWatchlists = useMemo(() => {
    return watchlists.map(wl => ({
      ...wl,
      items: (wl.items || []).map((item: any) => {
        const liveQ = allQuotes[item.symbol];
        if (liveQ) {
          return { ...item, price: liveQ.price, change_percent: liveQ.change_percent, change: liveQ.change };
        }
        return item;
      }),
    }));
  }, [watchlists, allQuotes]);

  const create = async () => {
    try { await axios.post('/api/watchlists', { name: newName || 'My Watchlist' }); setNewName(''); setShowNew(false); fetch(); toast.success('Created'); }
    catch { toast.error('Failed'); }
  };
  const removeItem = async (wlId: number, symbol: string) => {
    try { await axios.delete(`/api/watchlists/${wlId}/items/${symbol}`); fetch(); toast.success('Removed'); }
    catch { toast.error('Failed'); }
  };

  const renameWatchlist = async (id: number) => {
    if (!editName.trim()) return;
    try { await axios.patch(`/api/watchlists/${id}`, { name: editName.trim() }); setEditingId(null); fetch(); toast.success('Renamed'); }
    catch { toast.error('Failed to rename'); }
  };
  const deleteWatchlist = async (id: number) => {
    if (!confirm('Delete this watchlist?')) return;
    try { await axios.delete(`/api/watchlists/${id}`); fetch(); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
  };

  const addToWatchlist = async (symbol: string, exchange: string = 'NSE') => {
    try {
      // Get the first watchlist (or create one if none exists)
      let targetList = watchlists[0];
      if (!targetList) {
        const res = await axios.post('/api/watchlists', { name: 'My Watchlist' });
        targetList = res.data;
        await fetch();
      }
      
      await axios.post(`/api/watchlists/${targetList.id}/items`, { symbol, exchange });
      fetch();
      toast.success(`${symbol} added to watchlist`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to add to watchlist');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Watchlists</h1>
        <button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-groww-primary text-white text-sm"><Plus className="w-4 h-4"/> New</button>
      </div>

      {/* Global Stock Search */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <h3 className="font-semibold mb-3">Search & Add Stocks</h3>
        <GlobalSearch onStockSelect={(symbol, exchange) => addToWatchlist(symbol, exchange)} />
      </div>
      {showNew && (
        <div className="flex gap-2">
          <input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="Name" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"/>
          <button onClick={create} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium">Create</button>
        </div>
      )}
      {enrichedWatchlists.map((wl) => (
        <div key={wl.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            {editingId === wl.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameWatchlist(wl.id); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold"
                />
                <button onClick={() => renameWatchlist(wl.id)} className="p-1 text-groww-primary hover:opacity-80"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold">{wl.name}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditingId(wl.id); setEditName(wl.name); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteWatchlist(wl.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}
          </div>
          {wl.items?.length === 0 && <p className="text-sm text-gray-500">No stocks added</p>}
          <div className="space-y-2">
            {wl.items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <Link to={`/terminal/${item.symbol}`} className="flex-1 flex items-center gap-2">
                  <StockLogo symbol={item.symbol} size={40} />
                  <div>
                    <p className="font-medium text-sm">{item.name || item.symbol}</p>
                    <p className="text-xs text-gray-500">{item.symbol} • {formatCurrency(item.price)} <span className={item.change_percent>=0?'text-green-600':'text-red-500'}>{item.change_percent>=0?'+':''}{item.change_percent?.toFixed(2)}%</span></p>
                  </div>
                </Link>
                <button onClick={()=>removeItem(wl.id, item.symbol)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
