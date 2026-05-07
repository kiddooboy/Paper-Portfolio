import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
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
}

interface SectorStock {
  symbol: string;
  exchange: string;
  name: string;
  market_cap: number | null;
  price: number | null;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
}

function heatColor(pct: number) {
  if (pct >= 2) return 'bg-green-700 dark:bg-green-800';
  if (pct >= 1) return 'bg-green-600 dark:bg-green-700';
  if (pct >= 0) return 'bg-green-500/80 dark:bg-green-700/70';
  if (pct >= -1) return 'bg-red-500/80 dark:bg-red-700/70';
  if (pct >= -2) return 'bg-red-600 dark:bg-red-700';
  return 'bg-red-700 dark:bg-red-800';
}

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
  };
  return map[name] || name;
}

export default function SectorsPage() {
  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [sectorStocks, setSectorStocks] = useState<SectorStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);

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

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStocksLoading(true);
    setSectorStocks([]);
    axios.get(`/api/stocks/sectors/${encodeURIComponent(selected)}/stocks`)
      .then((res) => { if (!cancelled) setSectorStocks(res.data?.stocks || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStocksLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const sorted = [...sectors].sort((a, b) => b.change_percent - a.change_percent);

  // ── Sector drill-down view ──
  if (selected) {
    const meta = sectors.find((s) => s.name === selected);
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelected(null)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{selected}</h1>
            {meta && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {meta.totalStocks} stocks ·{' '}
                <span className={meta.change_percent >= 0 ? 'text-gain' : 'text-loss'}>
                  {meta.change_percent >= 0 ? '+' : ''}{meta.change_percent.toFixed(2)}% today
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {meta && (
          <div className="flex gap-3">
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex-1 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Gainers</p>
              <p className="text-lg font-bold text-gain">{meta.gainers}</p>
            </div>
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex-1 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Losers</p>
              <p className="text-lg font-bold text-loss">{meta.losers}</p>
            </div>
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex-1 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Unchanged</p>
              <p className="text-lg font-bold text-gray-500">{meta.unchanged}</p>
            </div>
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex-1 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Live / Total</p>
              <p className="text-lg font-bold">{meta.liveCount}/{meta.totalStocks}</p>
            </div>
          </div>
        )}

        {/* Stock list */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-bold">Stocks in {shortName(selected)}</h2>
          </div>

          {stocksLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Stock</th>
                  <th className="text-right px-5 py-3 font-medium">Price</th>
                  <th className="text-right px-5 py-3 font-medium">Change</th>
                  <th className="text-right px-5 py-3 font-medium hidden md:table-cell">Volume</th>
                  <th className="px-4 py-3 w-8 hidden md:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {sectorStocks.map((stock) => (
                  <tr key={stock.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-5 py-3.5">
                      <Link to={`/terminal/${stock.symbol}?exchange=${stock.exchange}`} className="hover:underline">
                        <p className="font-semibold">{stock.symbol}</p>
                        <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{stock.name}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-medium">
                      {stock.price != null ? formatCurrency(stock.price) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {stock.change_percent != null ? (
                        <div>
                          <span className={cn('font-semibold tabular-nums text-sm', stock.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                            {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                          </span>
                          {stock.change != null && (
                            <p className={cn('text-[11px] tabular-nums', stock.change >= 0 ? 'text-gain' : 'text-loss')}>
                              {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-xs text-gray-500 hidden md:table-cell">
                      {stock.volume != null ? stock.volume.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <Link to={`/terminal/${stock.symbol}?exchange=${stock.exchange}`}>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Main sectors view ──
  return (
    <div className="space-y-3">
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
              <button
                key={s.name}
                onClick={() => setSelected(s.name)}
                className={cn('rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:opacity-90 transition text-left', heatColor(s.change_percent))}
              >
                <p className="text-sm font-semibold text-white/90 leading-tight">{shortName(s.name)}</p>
                <div className="mt-3">
                  <p className={cn('text-lg font-bold', s.change_percent >= 0 ? 'text-green-200' : 'text-red-200')}>
                    {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-white/60">{s.totalStocks} stocks</p>
                </div>
              </button>
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
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sorted.map((s) => {
                const active = s.gainers + s.losers;
                const gainPct = active > 0 ? (s.gainers / active) * 100 : 50;
                return (
                  <tr
                    key={s.name}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer"
                    onClick={() => setSelected(s.name)}
                  >
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

                    <td className="px-4 py-3.5">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
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
