import { Link } from 'react-router-dom';
import { LayoutDashboard, Search, Wallet, ListOrdered, Bookmark, Trophy, ShieldCheck, TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

// Custom AI bot icon shared with the floating button
function AiBotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="18" height="14" rx="4" fill="currentColor" fillOpacity="0.15"/>
      <rect x="4" y="7" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="13" y1="7" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13" cy="2.5" r="1.5" fill="currentColor"/>
      <circle cx="9.5" cy="13" r="1.8" fill="currentColor"/>
      <circle cx="16.5" cy="13" r="1.8" fill="currentColor"/>
      <circle cx="10.1" cy="12.4" r="0.55" fill="white"/>
      <circle cx="17.1" cy="12.4" r="0.55" fill="white"/>
      <rect x="9" y="17" width="2" height="2" rx="0.5" fill="currentColor" fillOpacity="0.7"/>
      <rect x="12" y="16" width="2" height="3" rx="0.5" fill="currentColor"/>
      <rect x="15" y="15" width="2" height="4" rx="0.5" fill="currentColor" fillOpacity="0.7"/>
      <rect x="1.5" y="11" width="2.5" height="5" rx="1.25" fill="currentColor" fillOpacity="0.5"/>
      <rect x="22" y="11" width="2.5" height="5" rx="1.25" fill="currentColor" fillOpacity="0.5"/>
    </svg>
  );
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/market', label: 'Market', icon: Search },
  { path: '/sectors', label: 'Sectors', icon: PieChart },
  { path: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { path: '/positions', label: 'Positions', icon: BarChart3 },
  { path: '/orders', label: 'Orders', icon: ListOrdered },
  { path: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

export default function Sidebar({ activePath }: { activePath: string }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  return (
    <nav className="p-4 space-y-1">
      {navItems.map((item) => {
        const active = activePath === item.path || (item.path !== '/dashboard' && activePath.startsWith(item.path));
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-green-50 dark:bg-green-900/20 text-groww-primary'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}

      {/* AI Chat */}
      <Link
        to="/ai-chat"
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          activePath === '/ai-chat'
            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
        )}
      >
        <AiBotIcon className="w-5 h-5" />
        AI Assistant
      </Link>

      {isAdmin && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
          <Link
            to="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              activePath === '/admin'
                ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            Admin
          </Link>
        </>
      )}
    </nav>
  );
}
