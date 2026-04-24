import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import GlobalSearch from './GlobalSearch';
import { Bell, TrendingUp, Moon, Sun, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';

export default function Layout() {
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
  }, [isAuthenticated, navigate]);

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

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchCount = async () => {
      try {
        const res = await axios.get('/api/notifications/unread-count');
        setUnreadCount(res.data.count);
      } catch {}
    };
    fetchCount();
    // Refresh every 30 seconds normally, every 3 seconds on notifications page
    const interval = setInterval(fetchCount, location.pathname === '/notifications' ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, location.pathname]);

  // Listen for notification read events to update count immediately
  useEffect(() => {
    const handleNotificationRead = () => {
      axios.get('/api/notifications/unread-count')
        .then(res => setUnreadCount(res.data.count))
        .catch(() => {});
    };
    window.addEventListener('notification:read', handleNotificationRead);
    return () => window.removeEventListener('notification:read', handleNotificationRead);
  }, []);

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
          <button onClick={() => setDark(!dark)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => navigate('/notifications')} className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-groww-loss text-white text-[10px] rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">
            Logout
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden lg:block w-60 shrink-0 sticky top-[60px] h-[calc(100vh-60px)] border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-groww-dark">
          <Sidebar activePath={location.pathname} />
        </aside>

        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 max-w-6xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      <MobileNav activePath={location.pathname} />

      {/* Floating Chat Button */}
      <button
        onClick={() => navigate('/ai-chat')}
        className="fixed bottom-6 left-6 z-50 bg-groww-primary text-white p-4 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        title="AI Assistant"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
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
