// TradingView-style mini watchlist that replaces the old AIChatPanel on the
// Dashboard. Shows a curated cross-region list (India megacaps + US blue
// chips) with live price, day's % move, and a single-line sparkline coloured
// red or green based on direction.
//
// Live prices come from the existing market store (tier1 push); intraday
// candles are fetched once per mount (and refreshed every 5 min) per symbol.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useMarketStore } from '../store/marketStore';
import { useAuthStore } from '../store/authStore';
import { formatCurrency } from '../lib/utils';
import StockLogo from './StockLogo';
import Sparkline from './Sparkline';

type Region = 'all' | 'IN' | 'US';

interface WatchEntry {
  symbol: string;
  exchange: 'NSE' | 'NASDAQ' | 'NYSE';
  region: 'IN' | 'US';
  name: string;
}

// Curated, ordered so the row positions feel deliberate (not alphabetical).
const WATCHLIST: WatchEntry[] = [
  // ── India ──
  { symbol: 'RELIANCE',   exchange: 'NSE',    region: 'IN', name: 'Reliance' },
  { symbol: 'HDFCBANK',   exchange: 'NSE',    region: 'IN', name: 'HDFC Bank' },
  { symbol: 'TCS',        exchange: 'NSE',    region: 'IN', name: 'TCS' },
  { symbol: 'INFY',       exchange: 'NSE',    region: 'IN', name: 'Infosys' },
  { symbol: 'ICICIBANK',  exchange: 'NSE',    region: 'IN', name: 'ICICI Bank' },
  { symbol: 'BHARTIARTL', exchange: 'NSE',    region: 'IN', name: 'Bharti Airtel' },
  // ── United States ──
  { symbol: 'AAPL',  exchange: 'NASDAQ', region: 'US', name: 'Apple' },
  { symbol: 'MSFT',  exchange: 'NASDAQ', region: 'US', name: 'Microsoft' },
  { symbol: 'NVDA',  exchange: 'NASDAQ', region: 'US', name: 'NVIDIA' },
  { symbol: 'GOOGL', exchange: 'NASDAQ', region: 'US', name: 'Alphabet' },
  { symbol: 'AMZN',  exchange: 'NASDAQ', region: 'US', name: 'Amazon' },
  { symbol: 'TSLA',  exchange: 'NASDAQ', region: 'US', name: 'Tesla' },
  { symbol: 'META',  exchange: 'NASDAQ', region: 'US', name: 'Meta' },
];

interface HistoryPoint { date: string; close: number; }

interface HomeWatchlistProps {
  className?: string;
}

export default function HomeWatchlist({ className = '' }: HomeWatchlistProps) {
  const [tab, setTab] = useState<Region>('all');
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [fxRate, setFxRate] = useState<number>(0);

  const quotes = useMarketStore((s) => s.quotes);
  const inMarketOpen = useMarketStore((s) => s.status?.isOpen ?? true);
  const ccyPref = useAuthStore((s) => s.user?.currency_display || 'INR');

  // Make sure tier1 picks up our visible symbols.
  const addSymbols = useMarketStore((s) => s.addSymbols);
  useEffect(() => {
    addSymbols(WATCHLIST.map((w) => w.symbol));
  }, [addSymbols]);

  // Pull USD/INR once so we can convert US prices to ₹ when the user prefers it.
  useEffect(() => {
    let alive = true;
    axios.get('/api/fx/usdinr').then((res) => {
      if (alive) setFxRate(Number(res.data?.rate) || 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Fetch today's intraday sparkline once on mount, then refresh every 5 min
  // while IN market is open. When closed, fetch once and freeze the chart.
  useEffect(() => {
    let alive = true;
    async function fetchAll() {
      // Run in chunks of 4 so we don't hammer Yahoo all at once via our server.
      const chunks: WatchEntry[][] = [];
      for (let i = 0; i < WATCHLIST.length; i += 4) chunks.push(WATCHLIST.slice(i, i + 4));
      const accumulated: Record<string, number[]> = {};
      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map((w) =>
            axios.get(`/api/stocks/${w.symbol}/history`, {
              params: { exchange: w.exchange, range: 'today', interval: '15m' },
            }).then((r) => r.data as HistoryPoint[])
          )
        );
        if (!alive) return;
        chunk.forEach((w, idx) => {
          const r = results[idx];
          if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 1) {
            // Keep just the close column. Trim to the last ~30 points so the
            // sparkline always shows "today shape" not a wandering 2-day blob.
            const closes = r.value.map((p) => Number(p.close)).filter(Number.isFinite).slice(-30);
            if (closes.length > 1) accumulated[w.symbol] = closes;
          }
        });
        setHistory((prev) => ({ ...prev, ...accumulated }));
      }
    }
    fetchAll();
    // Only set up the 5-min refresh interval when IN market is open; when
    // closed the sparkline stays at the closing intraday curve.
    if (!inMarketOpen) return () => { alive = false; };
    const id = setInterval(fetchAll, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [inMarketOpen]);

  const filtered = useMemo(
    () => (tab === 'all' ? WATCHLIST : WATCHLIST.filter((w) => w.region === tab)),
    [tab],
  );

  const renderPrice = (w: WatchEntry, raw: number) => {
    if (w.region === 'IN') return formatCurrency(raw);
    // US row: respect the user's display preference.
    if (ccyPref === 'USD' || !fxRate) return formatCurrency(raw, { currency: 'USD' });
    return formatCurrency(raw * fxRate, { currency: 'INR' });
  };

  return (
    <div className={`flex flex-col bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Watchlist</h3>
          <Link
            to="/global-markets"
            className="text-[10px] uppercase tracking-wider font-semibold text-amber-500 hover:text-amber-600 dark:text-amber-400"
          >
            Global →
          </Link>
        </div>
        <div className="flex gap-1">
          {(['all', 'IN', 'US'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                tab === t
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t === 'all' ? 'All' : t === 'IN' ? 'India' : 'US'}
            </button>
          ))}
        </div>
      </div>

      {/* Rows — scrollable if constrained */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800/60 flex-1 overflow-y-auto">
        {filtered.map((w) => {
          const q = quotes[w.symbol];
          const price = q?.price ?? 0;
          const pct = q?.change_percent ?? 0;
          const up = pct >= 0;
          const points = history[w.symbol];

          return (
            <Link
              key={`${w.symbol}-${w.exchange}`}
              to={`/stock/${w.symbol}?exchange=${w.exchange}`}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
            >
              <StockLogo symbol={w.symbol} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-bold text-gray-900 dark:text-gray-100 font-mono">
                    {w.symbol}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
                    {w.region === 'IN' ? 'NSE' : w.exchange}
                  </span>
                </div>
                <div className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate">{w.name}</div>
              </div>

              {points && points.length > 1 ? (
                <Sparkline data={points} positive={up} width={64} height={22} />
              ) : (
                <div className="w-16 h-[22px] rounded-md bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
              )}

              <div className="text-right shrink-0 min-w-[68px]">
                <div className="text-[12px] font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {price > 0 ? renderPrice(w, price) : '—'}
                </div>
                <div className={`text-[10.5px] font-semibold tabular-nums flex items-center justify-end gap-0.5 ${up ? 'text-gain' : 'text-loss'}`}>
                  {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {up ? '+' : ''}{pct.toFixed(2)}%
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span>{inMarketOpen ? 'Live · 4s · sparkline = today' : 'Frozen at close · sparkline = today'}</span>
        {fxRate > 0 && <span className="font-mono">₹{fxRate.toFixed(2)}/$</span>}
      </div>
    </div>
  );
}
