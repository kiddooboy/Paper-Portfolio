import { useEffect, useState } from 'react';
import axios from 'axios';
import { cn, formatCurrency } from '../lib/utils';

interface SectorQuote {
  name: string;
  displayName: string;
  totalStocks: number;
  liveCount: number;
  gainers: number;
  losers: number;
  unchanged: number;
  change_percent: number;
  indexSymbol: string | null;
  indexPrice: number | null;
  indexChange: number | null;
}

function heatColor(pct: number) {
  if (pct >= 2) return 'bg-green-700 dark:bg-green-800';
  if (pct >= 1) return 'bg-green-600 dark:bg-green-700';
  if (pct >= 0) return 'bg-green-500/80 dark:bg-green-700/70';
  if (pct >= -1) return 'bg-red-500/80 dark:bg-red-700/70';
  if (pct >= -2) return 'bg-red-600 dark:bg-red-700';
  return 'bg-red-700 dark:bg-red-800';
}

// Abbreviate long sector names for the heatmap tile
function shortName(name: string): string {
  const map: Record<string, string> = {
    'Information Technology': 'IT',
    'Fast Moving Consumer Goods': 'FMCG',
    'Healthcare': 'Healthcare',
    'Automobile and Auto Components': 'Auto',
    'Metals & Mining': 'Metals',
    'Realty': 'Realty',
    'Financial Services': 'Financials',
    'Oil Gas & Consumable Fuels': 'Energy',
    'Capital Goods': 'Cap Goods',
    'Power': 'Power',
    'Consumer Durables': 'Durables',
    'Consumer Services': 'Cons Svc',
    'Chemicals': 'Chemicals',
    'Construction': 'Construction',
    'Construction Materials': 'Cement',
    'Telecommunication': 'Telecom',
    'Services': 'Services',
    'Textiles': 'Textiles',
    'Media Entertainment & Publication': 'Media',
    'Diversified': 'Diversified',
  };
  return map[name] || name;
}

export default function SectorsPage() {
  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/stocks/sectors');
        if (!cancelled) setSectors(res.data?.sectors || []);
      } catch {}
      if (!cancelled) setLoading(false);
    };
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const sorted = [...sectors].sort((a, b) => b.change_percent - a.change_percent);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Sector Performance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">All NSE-listed stocks · Grouped by sector · Market-cap weighted</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {sorted.map((s) => (
              <div
                key={s.name}
                className={cn('rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:opacity-90 transition', heatColor(s.change_percent))}
              >
                <p className="text-sm font-semibold text-white/90 leading-tight">{shortName(s.name)}</p>
                <div className="mt-3">
                  <p className={cn('text-lg font-bold', s.change_percent >= 0 ? 'text-green-200' : 'text-red-200')}>
                    {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-white/60">{s.totalStocks} stocks</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{sectors.length} sectors · live data from {sectors.reduce((a, s) => a + s.liveCount, 0)} stocks</p>
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
                <th className="text-right px-5 py-3 font-medium hidden lg:table-cell">Stocks</th>
                <th className="text-right px-5 py-3 font-medium">1D Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sorted.map((s) => {
                const active = s.gainers + s.losers;
                const gainPct = active > 0 ? (s.gainers / active) * 100 : 50;
                return (
                  <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', s.change_percent >= 0 ? 'bg-gain' : 'bg-loss')} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {active > 0 ? (
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

                    <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                      <span className="text-xs text-gray-500 tabular-nums">{s.liveCount}/{s.totalStocks}</span>
                    </td>

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
