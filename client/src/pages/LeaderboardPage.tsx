import { useEffect, useState } from 'react';
import axios from 'axios';
import { Trophy, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '../lib/utils';

interface LeaderEntry {
  rank: number;
  userId: number;
  name: string;
  portfolioValue: number;
  totalPnl: number;
  pnlPercent: number;
  dayPnl: number;
  dayPnlPercent: number;
}

interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPct: number;
}

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' :
    rank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
    rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
    'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
  return (
    <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0', cls)}>
      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
    </span>
  );
}

function PnlBadge({ value, pct, label }: { value: number; pct: number; label: string }) {
  const positive = value >= 0;
  return (
    <div className="text-right">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={cn('text-xs font-semibold flex items-center justify-end gap-0.5', positive ? 'text-gain' : 'text-loss')}>
        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {positive ? '+' : ''}{formatCurrency(value)}
      </p>
      <p className={cn('text-[10px]', positive ? 'text-gain' : 'text-loss')}>
        {positive ? '+' : ''}{formatPercent(Math.abs(pct))}
      </p>
    </div>
  );
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [holdings, setHoldings] = useState<Record<number, Holding[]>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    axios.get('/api/leaderboard').then(r => setData(r.data));
  }, []);

  async function toggleUser(userId: number) {
    if (expanded === userId) { setExpanded(null); return; }
    setExpanded(userId);
    if (holdings[userId]) return;
    setLoadingId(userId);
    try {
      const r = await axios.get(`/api/leaderboard/${userId}/holdings`);
      setHoldings(prev => ({ ...prev, [userId]: r.data }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" /> Top Traders
      </h1>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {data.map((entry) => {
          const isOpen = expanded === entry.userId;
          const userHoldings = holdings[entry.userId] ?? [];
          const isLoading = loadingId === entry.userId;

          return (
            <div key={entry.rank} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              {/* Main row */}
              <button
                onClick={() => toggleUser(entry.userId)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left"
              >
                <RankBadge rank={entry.rank} />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{entry.name}</p>
                  <p className="text-xs text-gray-400">{formatCurrency(entry.portfolioValue)}</p>
                </div>

                <div className="flex items-center gap-4">
                  <PnlBadge value={entry.dayPnl} pct={entry.dayPnlPercent} label="Today" />
                  <PnlBadge value={entry.totalPnl} pct={entry.pnlPercent} label="Overall" />
                  <span className="text-gray-400 shrink-0">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>
              </button>

              {/* Holdings dropdown */}
              {isOpen && (
                <div className="bg-gray-50 dark:bg-gray-900/50 px-4 pb-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : userHoldings.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">No holdings yet</p>
                  ) : (
                    <div className="space-y-0 pt-1">
                      {/* Header */}
                      <div className="grid grid-cols-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 py-1.5">
                        <span>Stock</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">LTP</span>
                        <span className="text-right">P&amp;L</span>
                      </div>
                      {userHoldings.map((h) => (
                        <div
                          key={h.symbol}
                          className="grid grid-cols-4 items-center text-xs px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <div>
                            <p className="font-semibold text-gray-800 dark:text-gray-100">{h.symbol}</p>
                            <p className="text-[10px] text-gray-400 truncate max-w-[80px]">{h.name}</p>
                          </div>
                          <span className="text-right text-gray-600 dark:text-gray-300">{h.quantity}</span>
                          <span className="text-right text-gray-600 dark:text-gray-300">{formatCurrency(h.ltp)}</span>
                          <div className="text-right">
                            <p className={cn('font-semibold', h.pnl >= 0 ? 'text-gain' : 'text-loss')}>
                              {h.pnl >= 0 ? '+' : ''}{formatCurrency(h.pnl)}
                            </p>
                            <p className={cn('text-[10px]', h.pnlPct >= 0 ? 'text-gain' : 'text-loss')}>
                              {h.pnlPct >= 0 ? '+' : ''}{formatPercent(Math.abs(h.pnlPct))}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
