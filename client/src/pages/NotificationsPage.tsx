import { useEffect, useState, useMemo } from 'react';
import { Bell, Check, Trash2, Filter, Mail, MailOpen } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';
import notify from '../lib/notify';
import EmptyState from '../components/EmptyState';

interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'order' | 'price_alert' | 'system' | string;
  read: 0 | 1 | boolean;
  created_at: string;
}

interface GroupRow { type: string; count: number; unread: number }

const TYPE_LABEL: Record<string, string> = {
  order:       'Orders',
  price_alert: 'Price Alerts',
  system:      'System',
  ai_insight:  'AI Insights',
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const secs = Math.max(0, (Date.now() - t) / 1000);
  if (secs < 60)       return `${Math.floor(secs)}s ago`;
  if (secs < 3600)     return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)    return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [symbol, setSymbol] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params: any = { limit: 200, days: 60 };
      if (typeFilter)             params.type   = typeFilter;
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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeFilter, readFilter, symbol]);

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
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'p-4 flex items-start gap-3 transition hover:bg-gray-50 dark:hover:bg-gray-800/40',
                  !n.read && 'bg-blue-50/40 dark:bg-blue-900/10'
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={() => toggle(n.id)}
                  className="mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {TYPE_LABEL[n.type] || n.type}
                    </span>
                    {!n.read && (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">New</span>
                    )}
                    <span className="text-[10px] text-gray-400">{relativeTime(n.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{n.message}</p>
                </div>
                <div className="flex items-center gap-1">
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
