import { useEffect, useState } from 'react';
import axios from 'axios';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '../lib/utils';

export default function LeaderboardPage() {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => { axios.get('/api/leaderboard').then(r => setData(r.data)); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-500"/> Top Traders</h1>
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {data.map((entry) => (
          <div key={entry.rank} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', entry.rank===1?'bg-yellow-100 text-yellow-700':entry.rank===2?'bg-gray-100 text-gray-700':entry.rank===3?'bg-orange-100 text-orange-700':'bg-gray-50 text-gray-500 dark:bg-gray-800')}>{entry.rank}</span>
              <span className="font-medium">{entry.name}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatCurrency(entry.portfolioValue)}</p>
              <p className={cn('text-xs flex items-center justify-end gap-1', entry.totalPnl>=0?'text-gain':'text-loss')}>
                {entry.totalPnl>=0?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}
                {formatPercent(entry.pnlPercent)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
