// Global Markets — the brand-new top-level section for US equity paper-trading.
//
// Distinct "Wall Street Dark" visual identity: navy/slate gradient hero, amber
// accents, GICS sector grid, curated thematic watchlists, gainers/losers, news.
// All data comes from the new /api/global/* endpoints; trading uses the
// existing /api/orders endpoint (with exchange=NASDAQ|NYSE).

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  Globe, TrendingUp, TrendingDown, Sparkles, DollarSign, Building2,
  Newspaper, Loader2, AlertCircle,
} from 'lucide-react';
import GlobalIndicesTicker from '../components/GlobalIndicesTicker';
import CurrencyToggle from '../components/CurrencyToggle';
import { formatCurrency } from '../lib/utils';
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
      } catch (e) { /* keep stale */ }
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
    <div className="min-h-[calc(100dvh-60px)] bg-gradient-to-br from-slate-950 via-blue-950/50 to-slate-950 text-gray-100">
      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23fbbf24%22%20fill-opacity%3D%220.04%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-amber-400/10 border border-amber-400/30">
                  <Globe className="w-5 h-5 text-amber-400" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Global Markets
                </h1>
                {status && (
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                    status.isOpen
                      ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30 animate-pulse'
                      : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                  }`}>
                    {status.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 max-w-xl">
                Trade NASDAQ &amp; NYSE blue chips on paper. Real prices · simulated execution · settled in ₹ at the locked rate.
              </p>
            </div>
            <CurrencyToggle />
          </div>

          {fxRate > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-lg bg-slate-900/60 border border-white/10 text-sm">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-gray-400">USD / INR</span>
              <span className="font-mono font-bold text-amber-400">₹{fxRate.toFixed(2)}</span>
              <span className="text-[10px] text-gray-500 ml-1">live · locks at trade submission</span>
            </div>
          )}

          <GlobalIndicesTicker />
        </div>
      </header>

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ─── Main column ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Curated baskets */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300">Curated baskets</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-2 px-2 scrollbar-thin">
              {CURATED_BUCKETS.map((b) => (
                <button
                  key={b}
                  onClick={() => setActiveBucket(b)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                    activeBucket === b
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                  }`}
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
                  className="block rounded-lg bg-slate-900/60 border border-white/10 hover:border-amber-400/40 transition p-3"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-bold font-mono text-gray-100">{s.symbol}</span>
                    <span className="text-[9px] uppercase text-gray-500">{s.exchange}</span>
                  </div>
                  <div className="text-xs text-gray-400 truncate mb-2">{s.name}</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-gray-100">{renderPrice(s.price)}</span>
                    <span className={`text-xs font-semibold ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              ))}
              {!activeStocks.length && (
                <div className="col-span-full text-xs text-gray-500 text-center py-6 border border-dashed border-white/10 rounded-lg">
                  Loading basket…
                </div>
              )}
            </div>
          </section>

          {/* Sectors */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300">GICS Sectors</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {sectors.map((s) => {
                const up = s.avg_change_percent >= 0;
                return (
                  <div key={s.name} className="rounded-lg bg-slate-900/60 border border-white/10 p-3">
                    <div className="text-xs font-semibold text-gray-300 mb-1 truncate">{s.name}</div>
                    <div className={`text-lg font-bold font-mono ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {up ? '+' : ''}{s.avg_change_percent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {s.up} ↑ &nbsp; {s.down} ↓
                    </div>
                  </div>
                );
              })}
              {!sectors.length && (
                <div className="col-span-full text-xs text-gray-500 text-center py-6 border border-dashed border-white/10 rounded-lg">
                  Sectors warm up after the first US tier-2 sweep…
                </div>
              )}
            </div>
          </section>

          {/* Gainers / Losers / Most Active */}
          {movers && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MoverTable title="Top Gainers" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} items={movers.gainers} renderPrice={renderPrice} />
              <MoverTable title="Top Losers" icon={<TrendingDown className="w-4 h-4 text-rose-400" />} items={movers.losers} renderPrice={renderPrice} />
              <MoverTable title="Most Active" icon={<Sparkles className="w-4 h-4 text-amber-400" />} items={movers.mostActive} renderPrice={renderPrice} />
            </section>
          )}
        </div>

        {/* ─── News rail ─────────────────────────────────────────────────── */}
        <aside className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Newspaper className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300">US Market News</h2>
          </div>
          {loadingNews ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : news.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
              <AlertCircle className="w-4 h-4" />
              News feeds unavailable.
            </div>
          ) : (
            <div className="space-y-2">
              {news.slice(0, 12).map((n) => (
                <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg bg-slate-900/60 border border-white/10 hover:border-amber-400/40 p-3 transition">
                  <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1 font-semibold">{n.source}</div>
                  <div className="text-sm text-gray-100 font-medium line-clamp-2 mb-1">{n.title}</div>
                  {n.description && (
                    <div className="text-xs text-gray-500 line-clamp-2">{n.description}</div>
                  )}
                </a>
              ))}
            </div>
          )}
        </aside>
      </main>

      {/* ─── Footer disclaimer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-slate-950/50 mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-[11px] text-gray-500">
          <p>
            Paper-trading simulation only. US equity prices via Yahoo Finance; FX rate via USD/INR=X. Settled in ₹ at the rate
            locked when the order is submitted. Not investment advice. Real US investing for Indian residents requires LRS
            compliance — out of scope for this app.
          </p>
        </div>
      </footer>
    </div>
  );
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
    <div className="rounded-lg bg-slate-900/60 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/5">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">{title}</h3>
      </div>
      <div className="divide-y divide-white/5">
        {items.slice(0, 8).map((s) => (
          <Link
            key={s.symbol}
            to={`/stock/${s.symbol}?exchange=${s.exchange}`}
            className="flex items-baseline justify-between px-3 py-2 hover:bg-white/5 transition"
          >
            <div>
              <div className="text-sm font-bold font-mono text-gray-100">{s.symbol}</div>
              <div className="text-[10px] text-gray-500 truncate max-w-[120px]">{s.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-gray-100">{renderPrice(s.price)}</div>
              <div className={`text-[10px] font-semibold ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
              </div>
            </div>
          </Link>
        ))}
        {!items.length && (
          <div className="px-3 py-6 text-xs text-gray-500 text-center">Warming up…</div>
        )}
      </div>
    </div>
  );
}
