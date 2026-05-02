import { Link } from 'react-router-dom';
import { LayoutDashboard, Search, Wallet, ListOrdered, Bookmark, Trophy, ShieldCheck, TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
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
        const active = activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path));
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
