import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { cn, formatCurrency } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';

interface SectorQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
}

// Map sector names to the NIFTY 500 symbols we track, for gainers/losers bar
const SECTOR_SYMBOLS: Record<string, string[]> = {
  'IT':       ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'MPHASIS', 'PERSISTENT', 'COFORGE', 'LTTS'],
  'FMCG':     ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'GODREJCP', 'TATACONSUM', 'COLPAL', 'EMAMILTD'],
  'Pharma':   ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BIOCON', 'ALKEM', 'TORNTPHARM', 'AUROPHARMA', 'LUPIN'],
  'Auto':     ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'TVSMOTOR', 'ASHOKLEY', 'MRF', 'BOSCHLTD'],
  'Metal':    ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'COALINDIA', 'NMDC', 'SAIL', 'VEDL', 'NATIONALUM', 'HINDCOPPER', 'APLAPOLLO'],
  'Realty':   ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'BRIGADE', 'PHOENIXLTD', 'SOBHA', 'MAHLIFE', 'SUNTECK', 'NESCO'],
  'PSU Bank': ['SBIN', 'BANKBARODA', 'PNB', 'CANBK', 'UNIONBANK', 'INDIANB', 'BANKINDIA', 'MAHABANK', 'IOB', 'UCOBANK'],
  'Energy':   ['NTPC', 'POWERGRID', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'TATAPOWER', 'ADANIGREEN', 'ADANIPOWER', 'TORNTPOWER'],
  'Finance':  ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 'BAJFINANCE', 'BAJAJFINSV', 'HDFCLIFE', 'SBILIFE', 'MUTHOOTFIN', 'CHOLAFIN'],
  'Infra':    ['LT', 'ADANIPORTS', 'ULTRACEMCO', 'GRASIM', 'SHREECEM', 'ACC', 'AMBUJACEM', 'IRB', 'KNR', 'GPPL'],
};

function heatColor(pct: number) {
  if (pct >= 2) return 'bg-green-700 dark:bg-green-800';
  if (pct >= 1) return 'bg-green-600 dark:bg-green-700';
  if (pct >= 0) return 'bg-green-500/80 dark:bg-green-700/70';
  if (pct >= -1) return 'bg-red-500/80 dark:bg-red-700/70';
  if (pct >= -2) return 'bg-red-600 dark:bg-red-700';
  return 'bg-red-700 dark:bg-red-800';
}

export default function SectorsPage() {
  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const allQuotes = useMarketStore((s) => s.quotes);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await axios.get('/api/stocks/sectors');
        if (!cancelled) setSectors(res.data?.sectors || []);
      } catch {}
      if (!cancelled) setLoading(false);
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Compute gainers/losers per sector from live quote store
  const sectorStats = sectors.map((s) => {
    const symbols = SECTOR_SYMBOLS[s.name] || [];
    let gainers = 0, losers = 0;
    for (const sym of symbols) {
      const q = allQuotes[sym];
      if (!q) continue;
      if (q.change_percent > 0) gainers++;
      else if (q.change_percent < 0) losers++;
    }
    const total = gainers + losers || 1;
    return { ...s, gainers, losers, total: gainers + losers };
  });

  const sorted = [...sectorStats].sort((a, b) => b.change_percent - a.change_percent);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Sector Performance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">NSE sector indices · Today's performance</p>
      </div>

      {/* Heatmap */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Sector Heatmap · Today</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {sectorStats.map((s) => (
              <div
                key={s.symbol}
                className={cn('rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:opacity-90 transition', heatColor(s.change_percent))}
              >
                <p className="text-sm font-semibold text-white/90">{s.name}</p>
                <div className="mt-3">
                  <p className={cn('text-lg font-bold', s.change_percent >= 0 ? 'text-green-200' : 'text-red-200')}>
                    {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-white/60">{formatCurrency(s.price)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">NSE sector indices · {sectors.length} sectors</p>
        </div>
      )}

      {/* Trending sectors table */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold">Trending Sectors</h2>
        </div>

        {loading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Sector</th>
                <th className="text-center px-4 py-3 font-medium hidden md:table-cell">Gainers / Losers</th>
                <th className="text-right px-5 py-3 font-medium">Price</th>
                <th className="text-right px-5 py-3 font-medium">1D Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sorted.map((s) => {
                const gainPct = s.total > 0 ? (s.gainers / s.total) * 100 : 50;
                return (
                  <tr key={s.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    {/* Sector name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', s.change_percent >= 0 ? 'bg-gain' : 'bg-loss')} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>

                    {/* Gainers/losers bar */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {s.total > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gain w-5 text-right tabular-nums">{s.gainers}</span>
                          <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                            <div className="bg-gain rounded-l-full transition-all" style={{ width: `${gainPct}%` }} />
                            <div className="bg-loss flex-1 rounded-r-full" />
                          </div>
                          <span className="text-xs text-loss w-5 tabular-nums">{s.losers}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-5 py-3.5 text-right tabular-nums font-medium">
                      {formatCurrency(s.price)}
                    </td>

                    {/* Change */}
                    <td className="px-5 py-3.5 text-right">
                      <span className={cn('font-semibold tabular-nums', s.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                        {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
