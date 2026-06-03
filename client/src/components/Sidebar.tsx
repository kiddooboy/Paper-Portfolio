import { Link } from 'react-router-dom';
import { LayoutDashboard, Search, ListOrdered, Bookmark, Trophy, TrendingUp, BarChart3, PieChart, Compass, Newspaper, SlidersHorizontal, Medal, ChevronDown, ChevronRight, Users, GraduationCap, Sparkles, MessageSquare, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';

const sections = [
  {
    label: 'Main',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/market', label: 'Market', icon: Search },
      { path: '/global-markets', label: 'Global Markets', icon: Globe, badge: 'NEW' },
      { path: '/sectors', label: 'Sectors', icon: PieChart },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { path: '/portfolio', label: 'Portfolio', icon: TrendingUp },
      { path: '/compass',   label: 'Portfolio Compass', icon: Compass },
      { path: '/positions', label: 'Holdings', icon: BarChart3 },
      { path: '/orders', label: 'Orders', icon: ListOrdered },
    ],
  },
  {
    label: 'Trading',
    items: [
      { path: '/watchlist', label: 'Watchlist',  icon: Bookmark        },
      { path: '/screener',  label: 'Screener',   icon: SlidersHorizontal },
    ],
  },
  {
    label: 'AI & Insights',
    items: [
      { path: '/recommendations', label: 'Daily Picks', icon: Sparkles, badge: 'NEW' },
      { path: '/ai-chat',         label: 'AI Chat',     icon: MessageSquare },
    ],
  },
  {
    label: 'Social',
    items: [
      { path: '/community',    label: 'Community',    icon: Users },
      { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { path: '/achievements', label: 'Achievements', icon: Medal },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '/news', label: 'News', icon: Newspaper },
      { path: '/learn', label: 'Trading Academy', icon: GraduationCap },
    ],
  },
];

export default function Sidebar({ activePath }: { activePath: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (label: string) => setCollapsed(c => ({ ...c, [label]: !c[label] }));

  return (
    <nav className="p-3 space-y-4">
      {sections.map(section => {
        const isCollapsed = collapsed[section.label];
        return (
          <div key={section.label}>
            <button
              onClick={() => toggle(section.label)}
              className="w-full flex items-center justify-between px-2 mb-1 group"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition">{section.label}</span>
              {isCollapsed ? <ChevronRight className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = activePath === item.path || (item.path !== '/dashboard' && activePath.startsWith(item.path));
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      data-tour={item.path}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-green-50 dark:bg-green-900/20 text-groww-primary'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {'badge' in item && (item as any).badge && (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-groww-primary/15 text-groww-primary border border-groww-primary/20">
                          {(item as any).badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
