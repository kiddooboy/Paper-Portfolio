import { useEffect, useState } from 'react';
import axios from 'axios';
import { cn } from '../lib/utils';


export default function AchievementsPage() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/achievements').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  const achievements: any[] = data?.achievements || [];
  const categories = ['all', ...Array.from(new Set(achievements.map((a: any) => a.category)))];
  const filtered = filter === 'all' ? achievements : achievements.filter((a: any) => a.category === filter);
  const earned = achievements.filter((a: any) => a.earned).length;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Achievements</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{earned} / {achievements.length} earned</p>
      </div>

      {/* Progress bar */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm">Overall Progress</span>
          <span className="text-sm text-groww-primary font-bold">{achievements.length > 0 ? Math.round(earned / achievements.length * 100) : 0}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-2 rounded-full bg-groww-primary transition-all" style={{ width: `${achievements.length > 0 ? earned / achievements.length * 100 : 0}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {categories.slice(1).map(cat => {
            const catAchs = achievements.filter((a: any) => a.category === cat);
            const catEarned = catAchs.filter((a: any) => a.earned).length;
            return (
              <div key={cat} className="text-center">
                <div className="text-lg font-bold">{catEarned}/{catAchs.length}</div>
                <div className="text-xs text-gray-500 capitalize">{cat}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium capitalize transition',
              filter === cat ? 'bg-groww-primary text-white' : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 hover:border-groww-primary'
            )}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ach: any) => (
          <div key={ach.key}
            className={cn('rounded-2xl border p-4 transition relative overflow-hidden',
              ach.earned
                ? 'bg-white dark:bg-groww-card border-groww-primary/30 shadow-sm'
                : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 opacity-60'
            )}>
            {ach.earned && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-groww-primary" />}
            <div className="text-3xl mb-2">{ach.icon}</div>
            <div className="font-bold text-sm mb-1">{ach.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{ach.description}</div>
            {ach.earned && ach.earned_at && (
              <div className="mt-2 text-[10px] text-groww-primary font-medium">
                Earned {new Date(ach.earned_at).toLocaleDateString('en-IN')}
              </div>
            )}
            {!ach.earned && <div className="mt-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Locked</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
