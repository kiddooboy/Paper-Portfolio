import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { XCircle, Clock, CheckCircle, AlertCircle, Edit2, X } from 'lucide-react';
import { useOrdersStore } from '../store/ordersStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function statusBadge(status: string, isMarketClosed: boolean) {
  if (status === 'PENDING' && isMarketClosed) return 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400';
  if (status === 'PENDING') return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
  if (status === 'FILLED') return 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400';
  if (status === 'FAILED') return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function ModifyModal({ order, onClose, onSaved }: { order: any; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(String(order.quantity));
  const [limitPrice, setLimitPrice] = useState(String(order.limit_price || ''));
  const [triggerPrice, setTriggerPrice] = useState(String(order.trigger_price || ''));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {};
      if (qty && parseInt(qty) !== order.quantity) body.quantity = parseInt(qty);
      if (limitPrice && parseFloat(limitPrice) !== order.limit_price) body.limitPrice = parseFloat(limitPrice);
      if (triggerPrice && parseFloat(triggerPrice) !== order.trigger_price) body.triggerPrice = parseFloat(triggerPrice);
      if (Object.keys(body).length === 0) { toast('No changes made'); onClose(); return; }
      await axios.put(`/api/orders/${order.id}`, body);
      toast.success('Order modified');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Modify failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Modify Order — {order.symbol}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Quantity</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </div>
          {(order.type === 'LIMIT' || order.type === 'SL') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Limit Price</label>
              <input type="number" step="0.05" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
            </div>
          )}
          {(order.type === 'SL' || order.type === 'SL-M') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trigger Price</label>
              <input type="number" step="0.05" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm" />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-groww-primary text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const orders = useOrdersStore((s) => s.orders);
  const loadingFromStore = useOrdersStore((s) => s.loading);
  const fetchOrders = useOrdersStore((s) => s.fetch);
  const refreshPortfolio = usePortfolioStore((s) => s.fetch);
  const loading = loadingFromStore && orders.length === 0;
  const marketStatus = useMarketStore((s) => s.status);
  const isMarketClosed = marketStatus ? !marketStatus.isOpen : false;
  const [modifyOrder, setModifyOrder] = useState<any>(null);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const cancelOrder = async (id: number) => {
    try {
      await axios.post(`/api/orders/${id}/cancel`);
      toast.success('Order cancelled');
      await Promise.all([fetchOrders(true), refreshPortfolio(true)]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const filledOrders = orders.filter(o => o.status === 'FILLED');
  const otherOrders = orders.filter(o => !['PENDING', 'FILLED'].includes(o.status));

  if (loading) return <div className="space-y-2 animate-pulse">{Array.from({length:4}).map((_,i)=><div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg"/>)}</div>;

  const OrderCard = ({ o, showActions }: { o: any; showActions?: boolean }) => (
    <div key={o.id} className={cn('bg-white dark:bg-groww-card rounded-xl border p-4 flex items-center justify-between',
      o.status === 'PENDING' ? 'border-yellow-200 dark:border-yellow-900/30' : 'border-gray-100 dark:border-gray-800',
      !showActions && 'opacity-60')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
            o.transaction_type === 'BUY'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
            {o.transaction_type}
          </span>
          <span className="font-semibold">{o.symbol}</span>
          <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{o.type}</span>
          {o.product_type && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded',
              o.product_type === 'MIS' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400')}>
              {o.product_type}
            </span>
          )}
          {o.is_amo === 1 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">AMO</span>
          )}
          {o.is_gtt === 1 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">GTT</span>
          )}
          {o.parent_order_id && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">Bracket</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">Qty: {o.quantity} @ {formatCurrency(o.price)}</p>
        {o.limit_price && <p className="text-xs text-gray-400">Limit: {formatCurrency(o.limit_price)}</p>}
        {o.trigger_price && <p className="text-xs text-amber-500">Trigger: {formatCurrency(o.trigger_price)}</p>}
        {o.is_gtt === 1 && o.gtt_valid_till && <p className="text-xs text-violet-500">GTT valid till: {o.gtt_valid_till}</p>}
        <p className="text-xs text-gray-400">
          {o.status === 'FILLED' && o.filled_at
            ? `Filled: ${new Date(o.filled_at).toLocaleString()}`
            : new Date(o.created_at).toLocaleString()}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 ml-3 flex-shrink-0">
        <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', statusBadge(o.status, isMarketClosed))}>
          {o.status === 'PENDING' && isMarketClosed ? 'QUEUED' : o.status}
        </span>
        {showActions && (
          <div className="flex gap-1 mt-1">
            <button onClick={() => setModifyOrder(o)} title="Modify order"
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-groww-primary transition">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => cancelOrder(o.id)} title="Cancel order"
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {modifyOrder && (
        <ModifyModal order={modifyOrder} onClose={() => setModifyOrder(null)} onSaved={() => fetchOrders(true)} />
      )}

      <h1 className="text-2xl font-bold">Orders</h1>

      {pendingOrders.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" /> Pending Orders ({pendingOrders.length})
            </h2>
            {isMarketClosed && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-7">
                🕐 Market is closed — orders execute at next market open
                {marketStatus?.nextOpen && (
                  <span className="font-medium"> ({new Date(marketStatus.nextOpen).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true })})</span>
                )}
              </p>
            )}
          </div>
          {pendingOrders.map(o => <OrderCard key={o.id} o={o} showActions />)}
        </div>
      )}

      {filledOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" /> Filled Orders ({filledOrders.length})
          </h2>
          {filledOrders.map(o => <OrderCard key={o.id} o={o} />)}
        </div>
      )}

      {otherOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-gray-500" /> Other Orders ({otherOrders.length})
          </h2>
          {otherOrders.map(o => <OrderCard key={o.id} o={o} />)}
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