import { useEffect, useState } from 'react';
import axios from 'axios';
import { Trophy, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

interface LeaderEntry {
  rank: number;
  userId: number;
  name: string;
  portfolioValue: number;
  cashBalance: number;
  holdingsValue: number;
  totalPnl: number;
  pnlPercent: number;
  realizedPnl: number;
  unrealizedPnl: number;
  holdingsCount: number;
  closedTrades: number;
  totalTxns: number;
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
    <span className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0', cls)}>
      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
    </span>
  );
}

function PnlBadge({ value, pct, label }: { value: number; pct: number; label: string }) {
  const positive = value >= 0;
  const isZero = value === 0;
  const colorCls = isZero ? 'text-gray-400' : positive ? 'text-gain' : 'text-loss';
  return (
    <div className="text-right min-w-[88px]">
      <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
      <p className={cn('text-xs font-semibold flex items-center justify-end gap-0.5', colorCls)}>
        {!isZero && (positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
        {positive && !isZero ? '+' : ''}{formatCurrency(value)}
      </p>
      <p className={cn('text-[10px]', colorCls)}>
        {positive && !isZero ? '+' : ''}{pct.toFixed(2)}%
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" /> Top Traders
        </h1>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <Info className="w-3.5 h-3.5" />
          Ranked by % return on ₹1,00,000 starting capital
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {data.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Loading leaderboard…</div>
        )}

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
                  <p className="text-[11px] text-gray-400">
                    {entry.holdingsCount} {entry.holdingsCount === 1 ? 'holding' : 'holdings'}
                    {entry.closedTrades > 0 && ` · ${entry.closedTrades} closed`}
                    {' · '}
                    {formatCurrency(entry.portfolioValue)}
                  </p>
                </div>

                <div className="flex items-center gap-3 sm:gap-5">
                  <PnlBadge value={entry.totalPnl} pct={entry.pnlPercent} label="Overall" />
                  <span className="text-gray-400 shrink-0">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="bg-gray-50 dark:bg-gray-900/50 px-4 pb-4 space-y-3">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <SummaryCard
                      label="Cash"
                      value={formatCurrency(entry.cashBalance)}
                      tone="neutral"
                    />
                    <SummaryCard
                      label="Holdings"
                      value={formatCurrency(entry.holdingsValue)}
                      tone="neutral"
                    />
                    <SummaryCard
                      label="Realized P&L"
                      value={formatCurrency(entry.realizedPnl)}
                      tone={entry.realizedPnl >= 0 ? 'gain' : 'loss'}
                    />
                    <SummaryCard
                      label="Unrealized P&L"
                      value={formatCurrency(entry.unrealizedPnl)}
                      tone={entry.unrealizedPnl >= 0 ? 'gain' : 'loss'}
                    />
                  </div>

                  {/* Holdings table */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : userHoldings.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center bg-white dark:bg-groww-card rounded-lg">
                      No active holdings — currently in cash
                    </p>
                  ) : (
                    <div className="bg-white dark:bg-groww-card rounded-lg overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 bg-gray-50 dark:bg-gray-800/30">
                        <span className="col-span-4">Stock</span>
                        <span className="col-span-2 text-right">Qty</span>
                        <span className="col-span-3 text-right">Avg → LTP</span>
                        <span className="col-span-3 text-right">P&amp;L</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {userHoldings.map((h) => (
                          <div key={h.symbol} className="grid grid-cols-12 gap-2 items-center text-xs px-3 py-2.5">
                            <div className="col-span-4 min-w-0">
                              <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{h.symbol}</p>
                              <p className="text-[10px] text-gray-400 truncate">{h.name}</p>
                            </div>
                            <span className="col-span-2 text-right font-medium text-gray-700 dark:text-gray-300">{h.quantity}</span>
                            <div className="col-span-3 text-right">
                              <p className="text-gray-500 dark:text-gray-400 text-[11px]">{formatCurrency(h.avgPrice)}</p>
                              <p className="text-gray-700 dark:text-gray-200 font-medium">{formatCurrency(h.ltp)}</p>
                            </div>
                            <div className="col-span-3 text-right">
                              <p className={cn('font-semibold', h.pnl >= 0 ? 'text-gain' : 'text-loss')}>
                                {h.pnl >= 0 ? '+' : ''}{formatCurrency(h.pnl)}
                              </p>
                              <p className={cn('text-[10px]', h.pnlPct >= 0 ? 'text-gain' : 'text-loss')}>
                                {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile-only legend */}
      <p className="sm:hidden text-[10px] text-gray-400 text-center px-4">
        Ranked by overall % return on ₹1,00,000 starting capital
      </p>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'gain' | 'loss' | 'neutral' }) {
  const toneCls = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-gray-700 dark:text-gray-200';
  return (
    <div className="bg-white dark:bg-groww-card rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-800">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={cn('text-xs font-semibold mt-0.5', toneCls)}>{value}</p>
    </div>
  );
}
