import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import GlobalSearch from './GlobalSearch';
import SetMpinModal from './SetMpinModal';
import IdleLock from './IdleLock';
import { Bell, TrendingUp, Moon, Sun, ListOrdered, BarChart3, LogOut, ChevronRight, User, Check, ShoppingBag, TrendingDown, Info, ShieldCheck, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

export default function Layout() {
  const { isAuthenticated, isInitializing, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(true);
  const fetchNotifications = useNotificationsStore((s) => s.fetch);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) navigate('/');
  }, [isInitializing, isAuthenticated, navigate]);

  useEffect(() => {
    if (!dark) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [dark]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Refresh notifications periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(true), 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  if (isInitializing && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className={cn('min-h-screen bg-gray-50 dark:bg-groww-dark text-gray-900 dark:text-groww-text transition-colors', dark ? 'dark' : '')}>
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-groww-dark/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <TrendingUp className="w-6 h-6 text-groww-primary" />
          <span className="font-bold text-lg tracking-tight hidden sm:inline">Paper Portfolio</span>
        </div>
        <MarketBadge />
        <div className="flex-1 flex justify-center">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <span className="font-mono">{currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
            <span className="text-[10px] uppercase tracking-wide">IST</span>
          </div>
          <NotificationDropdown />
          <ProfileMenu dark={dark} onToggleDark={() => setDark(!dark)} />
        </div>
      </header>

      <IndexTicker />

      <div className="flex">
        <aside className="hidden lg:block w-60 shrink-0 sticky top-[60px] h-[calc(100vh-60px)] border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-groww-dark overflow-y-auto pb-20">
          <Sidebar activePath={location.pathname} />
        </aside>

        <main className={cn(
          'flex-1 w-full min-w-0',
          location.pathname.startsWith('/terminal')
            ? 'overflow-hidden p-0'
            : 'p-3 sm:p-4 pb-24 lg:pb-4'
        )}>
          <Outlet />
        </main>
      </div>

      {isAuthenticated && user?.has_mpin === false && <SetMpinModal />}
      <IdleLock />
      <MobileNav activePath={location.pathname} />

      {/* Floating AI Chat Button — bottom-right (clears mobile tab bar) */}
      <button
        onClick={() => navigate('/ai-chat')}
        className="fixed right-4 bottom-4 max-lg:bottom-20 z-50 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 focus:outline-none"
        title="AI Assistant"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #00B386 100%)', padding: '14px' }}
      >
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="7" width="18" height="14" rx="4" fill="white" fillOpacity="0.95"/>
          <line x1="13" y1="7" x2="13" y2="3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="13" cy="2.5" r="1.5" fill="white"/>
          <circle cx="9.5" cy="13" r="2" fill="#6366f1"/>
          <circle cx="16.5" cy="13" r="2" fill="#6366f1"/>
          <circle cx="10.2" cy="12.3" r="0.6" fill="white"/>
          <circle cx="17.2" cy="12.3" r="0.6" fill="white"/>
          <rect x="9" y="17" width="2" height="2" rx="0.5" fill="#00B386"/>
          <rect x="12" y="16" width="2" height="3" rx="0.5" fill="#6366f1"/>
          <rect x="15" y="15" width="2" height="4" rx="0.5" fill="#00B386"/>
          <rect x="1.5" y="11" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
          <rect x="22" y="11" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
        </svg>
      </button>
    </div>
  );
}

const INDEX_SYMBOLS = [
  { key: '^NSEI',      label: 'NIFTY 50' },
  { key: '^BSESN',     label: 'SENSEX' },
  { key: '^NSEBANK',   label: 'BANKNIFTY' },
  { key: '^CNX100',    label: 'NIFTY 100' },
  { key: '^CNXIT',     label: 'NIFTY IT' },
  { key: '^NSEMDCP50', label: 'MIDCAP 50' },
];

function IndexTicker() {
  const [indices, setIndices] = useState<Record<string, any>>({});
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await axios.get('/api/stocks/indices');
        if (cancelled) return;
        const map: Record<string, any> = {};
        for (const idx of res.data?.indices || []) map[idx.symbol] = idx;
        setIndices(map);
        setIsOpen(!!res.data?.isOpen);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const items = INDEX_SYMBOLS.map(({ key, label }) => {
    const d = indices[key];
    return { label, price: d?.price ?? 0, change: d?.change ?? 0, pct: d?.change_percent ?? 0 };
  });

  return (
    <div className="w-full bg-white dark:bg-groww-dark border-b border-gray-200 dark:border-gray-800">
      <div className="grid grid-cols-6 lg:[grid-template-columns:240px_repeat(5,1fr)] divide-x divide-gray-200 dark:divide-gray-800">
        {items.map(({ label, price, pct }) => (
          <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{label}</span>
              {isOpen && price > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" title="Live" />}
            </div>
            <span className="text-[11px] font-semibold tabular-nums">{price > 0 ? formatCurrency(price) : '—'}</span>
            {price > 0 && (
              <span className={cn('text-[10px] font-medium tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileMenu({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const menuItems = [
    { icon: <ListOrdered className="w-4 h-4" />, label: 'Orders', path: '/orders' },
    { icon: <BarChart3 className="w-4 h-4" />, label: 'Positions', path: '/positions' },
    ...(user?.role === 'admin' ? [{ icon: <ShieldCheck className="w-4 h-4 text-indigo-500" />, label: 'Admin Console', path: '/admin' }] : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full bg-groww-primary flex items-center justify-center text-white font-bold text-sm hover:opacity-90 transition"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-50">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-groww-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <User className="w-4 h-4 text-gray-400 shrink-0" />
          </div>

          {/* Balance */}
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <p className="text-base font-bold tabular-nums">{formatCurrency(user?.balance ?? 0)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Wallet className="w-3 h-3" /> Available balance</p>
            </div>
          </div>

          {/* Nav items */}
          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setOpen(false); }}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-sm"
              >
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  {item.icon}
                  {item.label}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>

          {/* Theme + Logout */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 flex items-center justify-between">
            <button
              onClick={onToggleDark}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="flex items-center gap-1.5 text-sm font-semibold text-groww-loss hover:opacity-80 transition"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketBadge() {
  const status = useMarketStore((s) => s.status);
  if (!status) return null;

  const colorMap: Record<string, string> = {
    Open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'Pre-market': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'After hours': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    Closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const dotColor = status.isOpen ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className={cn('hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0', colorMap[status.label] || colorMap.Closed)}>
      <span className="relative flex h-2 w-2">
        {status.isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
        <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColor)} />
      </span>
      {status.label}
    </div>
  );
}

function NotificationDropdown() {
  const { items, unreadCount, fetch, markRead } = useNotificationsStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch fresh when opened
  useEffect(() => {
    if (open) fetch(true);
  }, [open, fetch]);

  const recent = items.slice(0, 8);

  const iconFor = (type: string, title: string) => {
    if (type === 'price_alert') return <TrendingDown className="w-4 h-4 text-amber-400" />;
    if (title.toLowerCase().includes('sell')) return <TrendingDown className="w-4 h-4 text-red-400" />;
    if (title.toLowerCase().includes('buy')) return <ShoppingBag className="w-4 h-4 text-groww-primary" />;
    return <Info className="w-4 h-4 text-blue-400" />;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-groww-loss text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-groww-loss text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={async () => {
                  for (const n of items.filter((n) => !n.read)) await markRead(n.id);
                }}
                className="text-[11px] text-groww-primary hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
            ) : (
              recent.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.read) markRead(n.id); }}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/60',
                    !n.read && 'bg-groww-primary/5 dark:bg-groww-primary/10'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 mt-0.5">
                    {iconFor(n.type, n.title)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-semibold leading-snug', !n.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300')}>
                      {n.title}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {n.read ? <Check className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0 mt-1" /> : <span className="w-2 h-2 rounded-full bg-groww-primary shrink-0 mt-1.5" />}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
            <button
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="w-full text-center text-xs font-semibold text-groww-primary hover:underline py-1"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
