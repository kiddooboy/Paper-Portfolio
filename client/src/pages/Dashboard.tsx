import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import StockLogo from '../components/StockLogo';
import HomeWatchlist from '../components/HomeWatchlist';
import Sparkline from '../components/Sparkline';
import axios from 'axios';

interface SectorQuote {
  name: string;
  displayName: string;
  totalStocks: number;
  liveCount: number;
  gainers: number;
  losers: number;
  change_percent: number;
}

// Sector name → its NSE sector-index symbol on Yahoo. Used to fetch a fresh
// intraday curve per sector so each card carries a real day-shape sparkline,
// not a fabricated one.
const SECTOR_INDEX_SYMBOL: Record<string, string> = {
  IT: '^CNXIT',
  FMCG: '^CNXFMCG',
  Pharma: '^CNXPHARMA',
  Auto: '^CNXAUTO',
  Metal: '^CNXMETAL',
  Realty: '^CNXREALTY',
  'PSU Bank': '^CNXPSUBANK',
  Energy: '^CNXENERGY',
  Finance: '^CNXFINANCE',
  Infra: '^CNXINFRA',
  Banking: '^NSEBANK',
  Healthcare: '^CNXHEALTHCARE',
  Media: '^CNXMEDIA',
  Midcap: '^CNXMIDCAP',
  MNC: '^CNXMNC',
  PSE: '^CNXPSE',
  Services: '^CNXSERVICE',
  Consumption: '^CNXCONSUMPTION',
  Commodities: '^CNXCOMMODITY',
  Smallcap: '^CNXSMALLCAP',
};

export default function Dashboard() {
  const portfolio = usePortfolioStore((s) => s.data);
  const portfolioLoading = usePortfolioStore((s) => s.loading);
  const fetchPortfolioStore = usePortfolioStore((s) => s.fetch);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const allQuotes = useMarketStore((s) => s.quotes);
  const loading = portfolioLoading && !portfolio;

  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  // Per-sector intraday sparkline data (key = sector name → closes array).
  const [sectorSpark, setSectorSpark] = useState<Record<string, number[]>>({});
  const marketIsOpen = useMarketStore((s) => s.status?.isOpen ?? true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await axios.get('/api/stocks/sectors');
        if (!cancelled) setSectors(res.data?.sectors || []);
      } catch {}
    };
    fetch();
    // Freeze refresh when NSE is closed — values aren't changing anyway.
    if (!marketIsOpen) return () => { cancelled = true; };
    const id = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [marketIsOpen]);

  // Fetch per-sector intraday sparkline curves — one network round per sector,
  // throttled so we don't slam Yahoo through our server. Refreshes every 5 min
  // while NSE is open; otherwise fetched once on mount and frozen.
  useEffect(() => {
    let alive = true;
    if (!sectors.length) return;
    const targets = sectors.slice(0, 8).filter((s) => SECTOR_INDEX_SYMBOL[s.name]);
    async function loadSparks() {
      const out: Record<string, number[]> = {};
      // Run in chunks of 4 to keep the server's Yahoo bandwidth happy.
      for (let i = 0; i < targets.length; i += 4) {
        const chunk = targets.slice(i, i + 4);
        const results = await Promise.allSettled(
          chunk.map((s) =>
            axios.get(`/api/stocks/${SECTOR_INDEX_SYMBOL[s.name]}/history`, {
              params: { exchange: 'NSE', range: 'today', interval: '15m' },
            }).then((r) => r.data as { close: number }[])
          )
        );
        if (!alive) return;
        chunk.forEach((s, idx) => {
          const r = results[idx];
          if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 1) {
            const closes = r.value.map((p) => Number(p.close)).filter(Number.isFinite).slice(-30);
            if (closes.length > 1) out[s.name] = closes;
          }
        });
        setSectorSpark((prev) => ({ ...prev, ...out }));
      }
    }
    loadSparks();
    if (!marketIsOpen) return () => { alive = false; };
    const id = setInterval(loadSparks, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [sectors, marketIsOpen]);

  // Derive gainers/losers, most bought from the global live quote store
  const { gainers, losers, mostBought } = useMemo(() => {
    const arr = Object.values(allQuotes);
    const sorted = arr.filter(q => q && typeof q.change_percent === 'number');
    const g = sorted.filter(q => q.change_percent > 0).sort((a, b) => b.change_percent - a.change_percent).slice(0, 5);
    const l = sorted.filter(q => q.change_percent < 0).sort((a, b) => a.change_percent - b.change_percent).slice(0, 5);
    const mb = sorted.filter(q => q.volume && q.volume > 0).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);
    return { gainers: g, losers: l, mostBought: mb };
  }, [allQuotes]);

  // Enrich portfolio holdings with live prices
  const enrichedPortfolio = useMemo(() => {
    if (!portfolio) return null;
    const holdings = (portfolio.holdings || []).map((h: any) => {
      const liveQ = allQuotes[h.symbol];
      if (liveQ) {
        const currentPrice = liveQ.price;
        const currentValue = currentPrice * h.quantity;
        const pnl = (currentPrice - h.avg_buy_price) * h.quantity;
        const pnlPercent = h.avg_buy_price > 0 ? ((currentPrice - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;
        return { ...h, current_price: currentPrice, current_value: currentValue, pnl, pnl_percent: +pnlPercent.toFixed(2) };
      }
      return h;
    });
    // Headline aggregates (invested / current value / P&L / day change) come
    // straight from the server response so the Dashboard matches the Portfolio
    // and Leaderboard pages exactly — a single source of truth. The per-holding
    // live enrichment above is only for any per-row display.
    return { ...portfolio, holdings };
  }, [portfolio, allQuotes]);

  useEffect(() => { fetchPortfolioStore(); }, [fetchPortfolioStore]);
  useEffect(() => {
    if (portfolio?.balance !== undefined) updateBalance(portfolio.balance);
  }, [portfolio?.balance, updateBalance]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-44 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-44 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const p = enrichedPortfolio;

  return (
    <div className="flex flex-col lg:flex-row gap-3 p-3 overflow-y-auto lg:overflow-hidden lg:h-[calc(100vh-150px)]">
    {/* ── Left: main dashboard content ── */}
    <div className="flex-1 min-w-0 flex flex-col gap-3 lg:h-full">

      {/* ── Row 1: Investments + Sector Heatmap ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:shrink-0">

        {/* Your Investments */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
          <div className="h-1 w-full bg-gain shrink-0" />
          <div className="p-5 flex flex-col flex-1 justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Your Investments</p>

            {p ? (
              <>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums min-w-0 break-words">{formatCurrency(p.currentValue || 0)}</p>
                  <div className="text-right shrink-0">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap',
                      (p.dayChangePct ?? 0) >= 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-gain'
                        : 'bg-red-100 dark:bg-red-900/20 text-loss'
                    )}>
                      {(p.dayChangePct ?? 0) >= 0 ? '+' : ''}{(p.dayChangePct ?? 0).toFixed(2)}% today
                    </span>
                    <p className={cn('text-xs sm:text-sm font-semibold mt-1 tabular-nums', (p.dayChangeTotal ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.dayChangeTotal ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.dayChangeTotal ?? 0)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="border-l-2 border-gain pl-2 sm:pl-3 py-1 min-w-0">
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-1">Total returns</p>
                    <p className={cn('text-[13px] sm:text-base font-bold tabular-nums leading-tight', (p.totalPnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.totalPnl || 0) >= 0 ? '+' : ''}{formatCurrency(p.totalPnl || 0)}
                    </p>
                    <p className={cn('text-[10px] sm:text-xs font-medium tabular-nums', (p.totalPnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.totalPnlPercent || 0) >= 0 ? '+' : ''}{(p.totalPnlPercent || 0).toFixed(2)}%
                    </p>
                  </div>
                  <div className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 sm:pl-3 py-1 min-w-0">
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-1">Invested</p>
                    <p className="text-[13px] sm:text-base font-bold tabular-nums leading-tight">{formatCurrency(p.investedValue || 0)}</p>
                  </div>
                  <div className="border-l-2 border-blue-400 pl-2 sm:pl-3 py-1 min-w-0">
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-1">Available cash</p>
                    <p className="text-[13px] sm:text-base font-bold tabular-nums leading-tight text-blue-500">{formatCurrency(p.balance || 0)}</p>
                  </div>
                </div>

                {p.holdings?.length === 0 && (
                  <Link to="/market" className="mt-3 inline-flex items-center gap-1 text-sm text-groww-primary font-semibold hover:underline">
                    Explore stocks to invest →
                  </Link>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">Sign in to see your investments</p>
            )}
          </div>
        </div>

        {/* Sector Heatmap */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="h-1 w-full bg-blue-500" />
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sector Performance · Today</p>
              <Link to="/sectors" className="text-[10px] text-groww-primary font-semibold hover:underline">
                View all →
              </Link>
            </div>

            {sectors.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Loading sector data…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-2">
                  {sectors.slice(0, 8).map((s) => {
                    const up = s.change_percent >= 0;
                    const points = sectorSpark[s.name];
                    return (
                      <Link
                        key={s.name}
                        to="/sectors"
                        className="rounded-lg p-2 flex flex-col bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 hover:border-groww-primary/40 hover:shadow-sm transition"
                      >
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 leading-tight truncate">{s.name}</p>
                        <div className="mt-1 -mx-0.5 h-[18px]">
                          {points && points.length > 1 ? (
                            <Sparkline data={points} positive={up} width={68} height={18} strokeWidth={1.5} />
                          ) : (
                            <div className="h-full rounded bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
                          )}
                        </div>
                        <p className={cn('text-xs font-bold mt-0.5 tabular-nums', up ? 'text-gain' : 'text-loss')}>
                          {up ? '+' : ''}{s.change_percent.toFixed(2)}%
                        </p>
                      </Link>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400">
                  Nifty 50 · {sectors.length} sectors · <Link to="/sectors" className="text-groww-primary hover:underline">Tap to explore</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Gainers | Losers | Most Active ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:flex-1 lg:min-h-0">

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col min-h-0 max-h-[320px] lg:max-h-none">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-gain" /> Top Gainers
          </h3>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {gainers.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">No data yet</p>}
            {gainers.map((s: any) => <StockRow key={s.symbol} s={s} pctColor="gain" />)}
          </div>
        </div>

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col min-h-0 max-h-[320px] lg:max-h-none">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 shrink-0">
            <TrendingDown className="w-4 h-4 text-loss" /> Top Losers
          </h3>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {losers.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">No data yet</p>}
            {losers.map((s: any) => <StockRow key={s.symbol} s={s} pctColor="loss" />)}
          </div>
        </div>

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col min-h-0 max-h-[320px] lg:max-h-none">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-blue-500" /> Most Active
          </h3>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {mostBought.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">No data yet</p>}
            {mostBought.map((s: any) => (
              <Link key={s.symbol} to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}&fullscreen=1`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                <span className="flex items-center gap-2 min-w-0">
                  <StockLogo symbol={s.symbol} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.symbol}</p>
                    <p className="text-[11px] text-gray-400">Vol: {formatNumber(s.volume || 0)}</p>
                  </div>
                </span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(s.price || 0)}</p>
                  <p className={cn('text-[11px] font-medium tabular-nums', (s.change_percent ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                    {(s.change_percent ?? 0) >= 0 ? '+' : ''}{(s.change_percent ?? 0).toFixed(2)}%
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>{/* end left col */}

    {/* ── Right: Live cross-region watchlist ──
        Self-sized (no fixed height) so every row is visible without an
        inner scrollbar. */}
    <div className="hidden xl:flex flex-col w-[360px] shrink-0">
      <HomeWatchlist />
    </div>

    </div>
  );
}

function StockRow({ s, pctColor }: { s: any; pctColor: 'gain' | 'loss' }) {
  const pct = s.change_percent ?? 0;
  return (
    <Link to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}&fullscreen=1`}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
      <span className="flex items-center gap-2 min-w-0">
        <StockLogo symbol={s.symbol} size={28} />
        <p className="text-sm font-medium truncate">{s.symbol}</p>
      </span>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">{formatCurrency(s.price ?? 0)}</p>
        <p className={cn('text-[11px] font-medium tabular-nums', pctColor === 'gain' ? 'text-gain' : 'text-loss')}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </p>
      </div>
    </Link>
  );
}
