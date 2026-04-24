import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { XCircle, Clock, CheckCircle, XCircle as XCircleIcon } from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try { const res = await axios.get('/api/orders'); setOrders(res.data); } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const cancelOrder = async (id: number) => {
    try { await axios.post(`/api/orders/${id}/cancel`); toast.success('Order cancelled'); fetchOrders(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const filledOrders = orders.filter(o => o.status === 'FILLED');
  const otherOrders = orders.filter(o => !['PENDING', 'FILLED'].includes(o.status));

  if (loading) return <div className="space-y-2 animate-pulse">{Array.from({length:4}).map((_,i)=><div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg"/>)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Orders</h1>

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            Pending Orders ({pendingOrders.length})
          </h2>
          {pendingOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-groww-card rounded-xl border border-yellow-200 dark:border-yellow-900/30 p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', o.transaction_type==='BUY'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>{o.transaction_type}</span>
                  <span className="font-semibold">{o.symbol}</span>
                  <span className="text-xs text-gray-500">{o.type}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Qty: {o.quantity} @ {formatCurrency(o.price)}</p>
                {o.limit_price && <p className="text-xs text-gray-400">Limit: {formatCurrency(o.limit_price)}</p>}
                <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20">PENDING</span>
                <button onClick={()=>cancelOrder(o.id)} className="ml-2 text-gray-400 hover:text-red-500"><XCircle className="w-4 h-4"/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filled Orders */}
      {filledOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Filled Orders ({filledOrders.length})
          </h2>
          {filledOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', o.transaction_type==='BUY'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>{o.transaction_type}</span>
                  <span className="font-semibold">{o.symbol}</span>
                  <span className="text-xs text-gray-500">{o.type}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Qty: {o.quantity} @ {formatCurrency(o.price)}</p>
                <p className="text-xs text-gray-400">Filled: {o.filled_at ? new Date(o.filled_at).toLocaleString() : new Date(o.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-50 text-green-600 dark:bg-green-900/20">FILLED</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Other Orders (Cancelled, Failed, Expired) */}
      {otherOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-gray-500" />
            Other Orders ({otherOrders.length})
          </h2>
          {otherOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between opacity-60">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', o.transaction_type==='BUY'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>{o.transaction_type}</span>
                  <span className="font-semibold">{o.symbol}</span>
                  <span className="text-xs text-gray-500">{o.type}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Qty: {o.quantity} @ {formatCurrency(o.price)}</p>
                <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800">{o.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {orders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No orders yet</p>
        </div>
      )}
    </div>
  );
}
