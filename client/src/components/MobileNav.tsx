import { Link } from 'react-router-dom';
import { LayoutDashboard, Search, Wallet, Bookmark, User, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/market', label: 'Market', icon: Search },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/positions', label: 'Holdings', icon: TrendingUp },
  { path: '/watchlist', label: 'Watch', icon: Bookmark },
  { path: '/orders', label: 'Orders', icon: User },
];

export default function MobileNav({ activePath }: { activePath: string }) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-groww-card border-t border-gray-200 dark:border-gray-800 px-2 py-2 flex justify-around">
      {navItems.map((item) => {
        const active = activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path));
        return (
          <Link
            key={item.path}
            to={item.path}
            data-tour={item.path === '/' ? '/dashboard' : item.path}
            className={cn(
              'flex flex-col items-center gap-0.5 text-[10px] font-medium',
              active ? 'text-groww-primary' : 'text-gray-500 dark:text-gray-400'
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
