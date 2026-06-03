// Global Markets — the top-level section for US equity paper-trading.
//
// Styled to match the rest of Paper Portfolio (light bg-gray-50 / dark
// groww-card, groww-primary green accents) — a familiar shell wrapping
// US-specific data. The Region toggle in the header keeps prices in
// either USD or ₹ (FX-converted) per the user's preference.

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  Globe, TrendingUp, TrendingDown, Sparkles,
  Building2, Newspaper, Loader2, AlertCircle, Activity,
} from 'lucide-react';
import GlobalIndicesTicker from '../components/GlobalIndicesTicker';
import CurrencyToggle from '../components/CurrencyToggle';
import StockLogo from '../components/StockLogo';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

interface USStock {
  symbol: string;
  name: string;
  exchange: 'NASDAQ' | 'NYSE';
  sector?: string;
  price: number;
  change: number;
  change_percent: number;
  volume?: number;
}

interface Sector {
  name: string;
  avg_change_percent: number;
  count: number;
  up: number;
  down: number;
}

interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  pubDate: string;
  image?: string;
}

const CURATED_BUCKETS = [
  'Magnificent 7', 'Semis', 'AI Stocks', 'Banks', 'Megacap Tech',
];

export default function GlobalMarketsPage() {
  const ccy = useAuthStore((s) => s.user?.currency_display || 'INR');

  const [status, setStatus] = useState<{ isOpen: boolean; label: string; fx: { rate: number } } | null>(null);
  const [movers, setMovers] = useState<{ gainers: USStock[]; losers: USStock[]; mostActive: USStock[] } | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [watchlists, setWatchlists] = useState<Record<string, USStock[]>>({});
  const [activeBucket, setActiveBucket] = useState<string>(CURATED_BUCKETS[0]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [s, m, sec, w] = await Promise.all([
          axios.get('/api/global/status'),
          axios.get('/api/global/movers'),
          axios.get('/api/global/sectors'),
          axios.get('/api/global/watchlists'),
        ]);
        if (!alive) return;
        setStatus(s.data);
        setMovers(m.data);
        setSectors(sec.data?.sectors ?? []);
        setWatchlists(w.data?.watchlists ?? {});
      } catch { /* keep stale */ }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingNews(true);
    axios.get('/api/global/news').then((res) => {
      if (alive) setNews(res.data?.items ?? []);
    }).catch(() => {}).finally(() => { if (alive) setLoadingNews(false); });
    return () => { alive = false; };
  }, []);

  const fxRate = status?.fx?.rate ?? 0;
  const renderPrice = (usd: number) => {
    if (ccy === 'USD' || !fxRate) return `$${usd.toFixed(2)}`;
    return formatCurrency(usd * fxRate, { currency: 'INR' });
  };

  const activeStocks = useMemo(() => watchlists[activeBucket] || [], [watchlists, activeBucket]);

  return (
    <div className="min-h-[calc(100dvh-60px)] bg-gray-50 dark:bg-groww-dark text-gray-900 dark:text-groww-text">
      {/* ─── Page header ─────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-5 h-5 text-groww-primary" strokeWidth={2.5} />
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Global Markets</h1>
                {status && (
                  <span className={cn(
                    'text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ml-1',
                    status.isOpen
                      ? 'bg-groww-primary/10 text-groww-primary'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  )}>
                    {status.isOpen && <span className="inline-block w-1.5 h-1.5 rounded-full bg-groww-primary animate-pulse mr-1.5" />}
                    {status.label}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-xl">
                NASDAQ &amp; NYSE blue chips on paper. Real prices · simulated execution · settled in ₹ at the rate locked at trade time.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {fxRate > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs">
                  <Activity className="w-3.5 h-3.5 text-groww-primary" />
                  <span className="text-gray-500 dark:text-gray-400">USD/INR</span>
                  <span className="font-bold font-mono text-gray-900 dark:text-gray-100">₹{fxRate.toFixed(2)}</span>
                </div>
              )}
              <CurrencyToggleLight />
            </div>
          </div>

          {/* Indices strip — keeps the groww-primary feel */}
          <GlobalIndicesTicker />
        </div>
      </div>

      {/* ─── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ─── Main column ───────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Curated baskets */}
          <section className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-groww-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Curated baskets</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1 scrollbar-thin">
              {CURATED_BUCKETS.map((b) => (
                <button
                  key={b}
                  onClick={() => setActiveBucket(b)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition border',
                    activeBucket === b
                      ? 'bg-groww-primary border-groww-primary text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {activeStocks.map((s) => (
                <Link
                  key={s.symbol}
                  to={`/stock/${s.symbol}?exchange=${s.exchange}`}
                  className="block rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 hover:border-groww-primary/40 hover:shadow-sm transition p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StockLogo symbol={s.symbol} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100 truncate">{s.symbol}</div>
                      <div className="text-[9px] uppercase text-gray-400 dark:text-gray-500">{s.exchange}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1.5">{s.name}</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{renderPrice(s.price)}</span>
                    <span className={cn('text-xs font-semibold', s.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                      {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              ))}
              {!activeStocks.length && (
                <div className="col-span-full text-xs text-gray-500 dark:text-gray-400 text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  Loading basket…
                </div>
              )}
            </div>
          </section>

          {/* Sectors */}
          <section className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-groww-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">GICS Sectors</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {sectors.map((s) => {
                const up = s.avg_change_percent >= 0;
                return (
                  <div key={s.name} className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 p-3">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">{s.name}</div>
                    <div className={cn('text-lg font-bold font-mono', up ? 'text-gain' : 'text-loss')}>
                      {up ? '+' : ''}{s.avg_change_percent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                      {s.up} ↑ &nbsp; {s.down} ↓
                    </div>
                  </div>
                );
              })}
              {!sectors.length && (
                <div className="col-span-full text-xs text-gray-500 dark:text-gray-400 text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  Sectors warm up after the first US tier-2 sweep…
                </div>
              )}
            </div>
          </section>

          {/* Gainers / Losers / Most Active */}
          {movers && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MoverTable title="Top Gainers" icon={<TrendingUp className="w-4 h-4 text-gain" />} items={movers.gainers} renderPrice={renderPrice} />
              <MoverTable title="Top Losers" icon={<TrendingDown className="w-4 h-4 text-loss" />} items={movers.losers} renderPrice={renderPrice} />
              <MoverTable title="Most Active" icon={<Sparkles className="w-4 h-4 text-groww-primary" />} items={movers.mostActive} renderPrice={renderPrice} />
            </section>
          )}
        </div>

        {/* ─── News rail ─────────────────────────────────────────────── */}
        <aside className="space-y-3">
          <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-groww-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">US Market News</h2>
            </div>
            {loadingNews ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : news.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-4">
                <AlertCircle className="w-4 h-4" />
                News feeds unavailable.
              </div>
            ) : (
              <div className="space-y-2">
                {news.slice(0, 12).map((n) => (
                  <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                    className="block rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 hover:border-groww-primary/40 hover:shadow-sm p-3 transition">
                    <div className="text-[10px] uppercase tracking-wider text-groww-primary mb-1 font-semibold">{n.source}</div>
                    <div className="text-sm text-gray-900 dark:text-gray-100 font-medium line-clamp-2 mb-1">{n.title}</div>
                    {n.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.description}</div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── Footer disclaimer ─────────────────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-[11px] text-gray-500 dark:text-gray-400">
          Paper-trading simulation only. US equity prices via Yahoo Finance; FX rate via USD/INR=X.
          Settled in ₹ at the rate locked when the order is submitted. Not investment advice.
        </div>
      </div>
    </div>
  );
}

/** Light-themed variant of the currency toggle, matching this page's palette. */
function CurrencyToggleLight() {
  return <CurrencyToggle className="bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700" />;
}

function MoverTable({
  title, icon, items, renderPrice,
}: {
  title: string;
  icon: React.ReactNode;
  items: USStock[];
  renderPrice: (usd: number) => string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-groww-card border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.slice(0, 8).map((s) => (
          <Link
            key={s.symbol}
            to={`/stock/${s.symbol}?exchange=${s.exchange}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
          >
            <StockLogo symbol={s.symbol} size={22} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{s.symbol}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{s.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{renderPrice(s.price)}</div>
              <div className={cn('text-[10px] font-semibold', s.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
              </div>
            </div>
          </Link>
        ))}
        {!items.length && (
          <div className="px-3 py-6 text-xs text-gray-500 dark:text-gray-400 text-center">Warming up…</div>
        )}
      </div>
    </div>
  );
}
