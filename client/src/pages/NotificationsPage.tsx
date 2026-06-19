import { useEffect, useState, useMemo } from 'react';
import {
  Bell, Check, Trash2, Filter, Mail, MailOpen,
  TrendingUp, TrendingDown, Minus, Target, ShieldAlert,
  Percent, Brain, RefreshCw, X, ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';
import notify from '../lib/notify';
import EmptyState from '../components/EmptyState';
import { useMarketStore } from '../store/marketStore';

interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'order' | 'price_alert' | 'system' | string;
  read: 0 | 1 | boolean;
  created_at: string;
  campaign_id?: number | null;
}

interface GroupRow { type: string; count: number; unread: number }

interface RecCampaign {
  id: number;
  symbol: string;
  title: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  current_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  expected_return: number | null;
  confidence_score: number;
  rationale: string | null;
  time_horizon: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
}

const TYPE_LABEL: Record<string, string> = {
  order:       'Orders',
  price_alert: 'Price Alerts',
  system:      'System',
  ai_insight:  'AI Insights',
};

const actionCfg = {
  BUY:  { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30', btnBg: 'bg-green-600 hover:bg-green-700', icon: TrendingUp,   label: 'BUY'  },
  SELL: { color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30',         btnBg: 'bg-red-600 hover:bg-red-700',     icon: TrendingDown, label: 'SELL' },
  HOLD: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/30', btnBg: 'bg-yellow-600 hover:bg-yellow-700', icon: Minus, label: 'HOLD' },
};

// Parse SQLite datetime('now') strings as UTC (they have no timezone suffix but are UTC)
function parseUtc(iso: string): Date {
  if (!iso) return new Date(0);
  // SQLite returns "2024-01-15 10:30:00" — treat as UTC by appending Z
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function relativeTime(iso: string): string {
  const secs = Math.max(0, (Date.now() - parseUtc(iso).getTime()) / 1000);
  if (secs < 60)    return `${Math.floor(secs)}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── Recommendation Trade Modal ─────────────────────────────────────────────

function RecTradeModal({
  campaignId,
  onClose,
}: {
  campaignId: number;
  onClose: () => void;
}) {
  const quotes = useMarketStore((s) => s.quotes);
  const [rec, setRec] = useState<RecCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState('1');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/admin/recommendations/campaign/${campaignId}`)
      .then(({ data }) => {
        setRec(data.campaign);
        axios.post(`/api/admin/recommendations/campaign/${campaignId}/click`).catch(() => {});
      })
      .catch(() => notify.error('Could not load recommendation'))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const livePrice = rec ? (quotes[rec.symbol]?.price ?? rec.current_price ?? null) : null;
  const cfg = rec ? actionCfg[rec.action] : null;
  const AIcon = cfg?.icon ?? Minus;

  const estimatedValue = livePrice && parseInt(qty) > 0
    ? (livePrice * parseInt(qty)).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : null;

  const handleConfirm = async () => {
    if (!rec || rec.action === 'HOLD') return;
    const quantity = parseInt(qty, 10);
    if (!quantity || quantity < 1) { notify.error('Enter a valid quantity'); return; }
    setPlacing(true);
    try {
      const payload: any = {
        symbol: rec.symbol,
        type: orderType,
        transaction_type: rec.action,
        quantity,
        price: orderType === 'LIMIT' ? parseFloat(limitPrice) || livePrice || 0 : livePrice || 0,
        product_type: 'CNC',
      };
      if (rec.target_price) payload.target_price = rec.target_price;
      if (rec.stop_loss)    payload.trigger_price = rec.stop_loss;

      const { data } = await axios.post('/api/orders', payload);
      axios.post(`/api/admin/recommendations/campaign/${rec.id}/convert`, {
        order_id: data.order?.id,
      }).catch(() => {});
      setPlaced(true);
      notify.success(`Order placed: ${rec.action} ${quantity} × ${rec.symbol}`);
    } catch (err: any) {
      notify.fromError(err, 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">AI Recommendation</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <RefreshCw size={20} className="animate-spin text-blue-500" />
          </div>
        ) : !rec ? (
          <div className="py-10 text-center text-sm text-gray-400">Recommendation not available.</div>
        ) : placed ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center mx-auto">
              <Check size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white">Order placed!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Your {rec.action} order for {rec.symbol} has been submitted.</p>
            <button
              onClick={onClose}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              {/* Symbol + action */}
              <div className={cn('rounded-xl border p-4', cfg!.bg)}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className={cn('text-2xl font-black', cfg!.color)}>{rec.symbol}</div>
                    {livePrice && (
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                        ₹{livePrice.toFixed(2)} <span className="text-gray-400 text-xs">current</span>
                      </div>
                    )}
                  </div>
                  <span className={cn('inline-flex items-center gap-1.5 text-base font-black px-3 py-1.5 rounded-xl border', cfg!.bg, cfg!.color)}>
                    <AIcon size={14} /> {cfg!.label}
                  </span>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Target',  value: rec.target_price   ? `₹${rec.target_price.toFixed(0)}`   : '—', icon: Target,      color: 'text-green-600 dark:text-green-400' },
                    { label: 'SL',      value: rec.stop_loss      ? `₹${rec.stop_loss.toFixed(0)}`      : '—', icon: ShieldAlert, color: 'text-red-600 dark:text-red-400'     },
                    { label: 'Return',  value: rec.expected_return ? `${rec.expected_return.toFixed(1)}%` : '—', icon: Percent,     color: 'text-blue-600 dark:text-blue-400'   },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white/50 dark:bg-black/20 rounded-lg p-2.5 text-center">
                      <Icon size={12} className={cn('mx-auto mb-1', color)} />
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">{label}</div>
                      <div className={cn('text-xs font-bold mt-0.5', color)}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confidence + horizon */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Brain size={11} className="text-blue-500" />
                  Confidence: <span className="font-semibold text-gray-900 dark:text-white">{rec.confidence_score.toFixed(0)}%</span>
                </div>
                <div className="text-gray-400">·</div>
                <div className="text-gray-500 dark:text-gray-400">
                  Horizon: <span className="font-semibold text-gray-900 dark:text-white">{rec.time_horizon}</span>
                </div>
                <div className="text-gray-400">·</div>
                <div className={cn('font-semibold', rec.risk_level === 'LOW' ? 'text-green-600 dark:text-green-400' : rec.risk_level === 'HIGH' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400')}>
                  {rec.risk_level} risk
                </div>
              </div>

              {/* Rationale */}
              {rec.rationale && (
                <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 leading-relaxed">
                  {rec.rationale}
                </p>
              )}

              {rec.action !== 'HOLD' && (
                <>
                  {/* Quantity */}
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Order type */}
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Order Type</label>
                    <div className="flex gap-2">
                      {(['MARKET', 'LIMIT'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setOrderType(t)}
                          className={cn(
                            'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                            orderType === t
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300'
                              : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {orderType === 'LIMIT' && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Limit Price ₹</label>
                      <input
                        type="number"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        placeholder={livePrice?.toFixed(2)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  {estimatedValue && (
                    <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Est. value</span>
                      <span className="font-semibold text-gray-900 dark:text-white">₹{estimatedValue}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Dismiss
              </button>
              {rec.action !== 'HOLD' ? (
                <button
                  onClick={handleConfirm}
                  disabled={placing}
                  className={cn('flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60', cfg!.btnBg)}
                >
                  {placing
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <AIcon size={14} />}
                  {placing ? 'Placing…' : `Confirm ${rec.action}`}
                  {!placing && <ChevronRight size={14} />}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-yellow-600 hover:bg-yellow-700 text-sm font-bold text-white transition-colors"
                >
                  Acknowledged
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [symbol, setSymbol] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeRecCampaignId, setActiveRecCampaignId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params: any = { limit: 200, days: 60 };
      if (typeFilter)              params.type   = typeFilter;
      if (readFilter === 'unread') params.read   = '0';
      if (readFilter === 'read')   params.read   = '1';
      if (symbol)                  params.symbol = symbol.trim().toUpperCase();
      const res = await axios.get('/api/notifications', { params });
      setItems(res.data?.notifications || []);
      setGroups(res.data?.groups || []);
    } catch (err) {
      notify.fromError(err, 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, readFilter, symbol]);

  const unreadTotal = useMemo(
    () => groups.reduce((s, g) => s + (Number(g.unread) || 0), 0),
    [groups],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function markRead(id: number) {
    try {
      await axios.post(`/api/notifications/${id}/read`);
      setItems((s) => s.map((n) => n.id === id ? { ...n, read: 1 } : n));
    } catch (err) { notify.fromError(err); }
  }

  async function markAllRead() {
    try {
      await axios.post('/api/notifications/read-all');
      setItems((s) => s.map((n) => ({ ...n, read: 1 })));
      notify.success('All notifications marked read');
      load();
    } catch (err) { notify.fromError(err); }
  }

  async function deleteOne(id: number) {
    try {
      await axios.delete(`/api/notifications/${id}`);
      setItems((s) => s.filter((n) => n.id !== id));
    } catch (err) { notify.fromError(err); }
  }

  async function deleteSelected() {
    if (!selected.size) return;
    try {
      await axios.delete('/api/notifications', { data: { ids: [...selected] } });
      setItems((s) => s.filter((n) => !selected.has(n.id)));
      setSelected(new Set());
      notify.success(`Deleted ${selected.size} notification(s)`);
    } catch (err) { notify.fromError(err); }
  }

  function handleRowClick(n: Notification) {
    if (!n.campaign_id) return;
    if (!n.read) markRead(n.id);
    setActiveRecCampaignId(n.campaign_id);
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-groww-primary" />
            Notifications
            {unreadTotal > 0 && (
              <span className="text-[11px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-full">
                {unreadTotal} unread
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Last 60 days · grouped by type and filterable by symbol
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50"
            >
              <Trash2 className="w-3 h-3 inline -mt-0.5 mr-1" />
              Delete {selected.size}
            </button>
          )}
          {unreadTotal > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <Check className="w-3 h-3 inline -mt-0.5 mr-1" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-gray-500"><Filter className="w-3 h-3" /> Filter:</div>
        <button
          onClick={() => setTypeFilter('')}
          className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg transition',
            typeFilter === ''
              ? 'bg-groww-primary text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
        >
          All ({groups.reduce((s, g) => s + Number(g.count), 0)})
        </button>
        {groups.map((g) => (
          <button
            key={g.type}
            onClick={() => setTypeFilter(g.type)}
            className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5',
              typeFilter === g.type
                ? 'bg-groww-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')}
          >
            {TYPE_LABEL[g.type] || g.type}
            <span className="text-[10px] opacity-75">{g.count}</span>
            {g.unread > 0 && (
              <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 leading-snug">{g.unread}</span>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Symbol…"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none focus:border-groww-primary uppercase"
          />
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as any)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none focus:border-groww-primary"
          >
            <option value="all">All</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-6 h-6" />}
            title="You're all caught up"
            message="When orders fill, alerts trigger, or insights are generated, they'll appear here."
            actionLabel="Explore market"
            actionHref="/market"
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((n) => {
              const isRec = !!n.campaign_id;
              return (
                <li
                  key={n.id}
                  onClick={isRec ? () => handleRowClick(n) : undefined}
                  className={cn(
                    'p-4 flex items-start gap-3 transition hover:bg-gray-50 dark:hover:bg-gray-800/40',
                    !n.read && 'bg-blue-50/40 dark:bg-blue-900/10',
                    isRec && 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => toggle(n.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {TYPE_LABEL[n.type] || n.type}
                      </span>
                      {isRec && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                          <Brain size={9} /> AI Rec
                        </span>
                      )}
                      {!n.read && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">New</span>
                      )}
                      <span className="text-[10px] text-gray-400">{relativeTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{n.message}</p>
                    {isRec && (
                      <div className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                        Tap to view trade details <ChevronRight size={10} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {!n.read && (
                      <button
                        onClick={() => markRead(n.id)}
                        title="Mark as read"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        <MailOpen className="w-4 h-4" />
                      </button>
                    )}
                    {!!n.read && (
                      <span className="p-1.5 text-gray-300 dark:text-gray-600" title="Read">
                        <Mail className="w-4 h-4" />
                      </span>
                    )}
                    <button
                      onClick={() => deleteOne(n.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recommendation trade popup */}
      {activeRecCampaignId !== null && (
        <RecTradeModal
          campaignId={activeRecCampaignId}
          onClose={() => setActiveRecCampaignId(null)}
        />
      )}
    </div>
  );
}
