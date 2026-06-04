import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import StockLogo from '../components/StockLogo';
import HomeWatchlist from '../components/HomeWatchlist';
import axios from 'axios';

interface SectorQuote {
  name: string;
  displayName: string;
  totalStocks: number;
  liveCount: number;
  gainers: number;
  losers: number;
  change_percent: number;
  indexSymbol: string | null;
  indexPrice: number | null;
  indexChange: number | null;
  sparkline?: number[];
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
    'Financial Services': 'Finance',
    'Banking': 'Banking',
    'Oil Gas & Consumable Fuels': 'Energy',
    'Capital Goods': 'Cap Goods',
    'Power': 'Power',
    'Consumer Durables': 'Durables',
    'Consumer Services': 'Services',
    'Chemicals': 'Chemicals',
    'Construction': 'Constru.',
    'Construction Materials': 'Materials',
    'Telecommunication': 'Telecom',
    'Services': 'Services',
    'Textiles': 'Textiles',
    'Media Entertainment & Publication': 'Media',
    'Metals': 'Metals',
    'Mining': 'Mining',
    'Agriculture': 'Agri.',
    'IT Services': 'IT',
    'Insurance': 'Insurance',
    'Retailing': 'Retail',
  };
  return map[name] || name;
}

export default function Dashboard() {
  const portfolio = usePortfolioStore((s) => s.data);
  const portfolioLoading = usePortfolioStore((s) => s.loading);
  const fetchPortfolioStore = usePortfolioStore((s) => s.fetch);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const allQuotes = useMarketStore((s) => s.quotes);
  const loading = portfolioLoading && !portfolio;

  const [sectors, setSectors] = useState<SectorQuote[]>([]);
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
    const id = setInterval(fetch, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [marketIsOpen]);

  // Tick counter — forces useMemo recomputation on every SSE tick or poll
  // so the movers lists update in real-time every ~4 seconds.
  const lastTickAt = useMarketStore((s) => s.lastTickAt);
  const lastFetched = useMarketStore((s) => s.lastFetched);
  const tick = lastTickAt || lastFetched;

  const [rotationIndex, setRotationIndex] = useState(() => Math.floor(Math.random() * 100));

  useEffect(() => {
    const id = setInterval(() => {
      setRotationIndex((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Derive gainers/losers, most bought from the global live quote store.
  // - Only consider quotes with a real price (>0) so we never surface ghost
  //   entries that would render as "₹0.00" in the UI.
  // - Restrict to Indian venues (NSE/BSE) — US tickers have their own
  //   dedicated section under /global-markets, so mixing them into the
  //   main Dashboard movers (whose prices are formatted in ₹) is confusing.
  const { allGainers, allLosers, allMostActive } = useMemo(() => {
    const arr = Object.values(allQuotes).filter(
      (q): q is NonNullable<typeof q> => !!q
        && typeof q.change_percent === 'number'
        && q.price > 0
        && (q.exchange === 'NSE' || q.exchange === 'BSE')
    );
    const g = arr.filter(q => q.change_percent > 0).sort((a, b) => b.change_percent - a.change_percent).slice(0, 24);
    const l = arr.filter(q => q.change_percent < 0).sort((a, b) => a.change_percent - b.change_percent).slice(0, 24);
    const ma = arr.filter(q => q.volume && q.volume > 0).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 24);
    return { allGainers: g, allLosers: l, allMostActive: ma };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allQuotes, tick]);

  const gainers = useMemo(() => {
    if (allGainers.length <= 6) return allGainers;
    const start = rotationIndex % allGainers.length;
    const res = [];
    for (let i = 0; i < 6; i++) {
      res.push(allGainers[(start + i) % allGainers.length]);
    }
    return res;
  }, [allGainers, rotationIndex]);

  const losers = useMemo(() => {
    if (allLosers.length <= 6) return allLosers;
    const start = rotationIndex % allLosers.length;
    const res = [];
    for (let i = 0; i < 6; i++) {
      res.push(allLosers[(start + i) % allLosers.length]);
    }
    return res;
  }, [allLosers, rotationIndex]);

  const mostBought = useMemo(() => {
    if (allMostActive.length <= 6) return allMostActive;
    const start = rotationIndex % allMostActive.length;
    const res = [];
    for (let i = 0; i < 6; i++) {
      res.push(allMostActive[(start + i) % allMostActive.length]);
    }
    return res;
  }, [allMostActive, rotationIndex]);

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

  useEffect(() => {
    fetchPortfolioStore();
    if (!marketIsOpen) return;
    const id = setInterval(() => fetchPortfolioStore(true), 8_000);
    return () => clearInterval(id);
  }, [fetchPortfolioStore, marketIsOpen]);
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
    <div className="flex flex-col lg:flex-row gap-3 p-3">
    {/* ── Left: main dashboard content ── */}
    <div className="flex-1 min-w-0 flex flex-col gap-3">

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
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {sectors.slice(0, 12).map((s) => (
                    <Link
                      key={s.name}
                      to="/sectors"
                      className={cn('rounded-lg p-2 flex flex-col hover:opacity-90 transition text-center', heatColor(s.change_percent))}
                    >
                      <p className="text-[11px] font-semibold text-white/90 leading-tight truncate">{shortName(s.name)}</p>
                      <p className={cn('text-xs font-bold mt-0.5', s.change_percent >= 0 ? 'text-green-200' : 'text-red-200')}>
                        {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                      </p>
                    </Link>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">
                  Nifty 50 · {sectors.length} sectors · <Link to="/sectors" className="text-groww-primary hover:underline">Tap to explore</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col h-[316px]">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-gain" /> Top Gainers
          </h3>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {gainers.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">No data yet</p>}
            {gainers.map((s: any) => <StockRow key={s.symbol} s={s} pctColor="gain" />)}
          </div>
        </div>

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col h-[316px]">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 shrink-0">
            <TrendingDown className="w-4 h-4 text-loss" /> Top Losers
          </h3>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {losers.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">No data yet</p>}
            {losers.map((s: any) => <StockRow key={s.symbol} s={s} pctColor="loss" />)}
          </div>
        </div>

        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col h-[316px]">
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
                  <p className="text-sm font-semibold tabular-nums">{s.price > 0 ? formatCurrency(s.price) : '—'}</p>
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
      <HomeWatchlist className="h-[316px]" />
    </div>

    </div>
  );
}

function StockRow({ s, pctColor }: { s: any; pctColor: 'gain' | 'loss' }) {
  const pct = s.change_percent ?? 0;
  const priceLabel = s.price > 0 ? formatCurrency(s.price) : '—';
  return (
    <Link to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}&fullscreen=1`}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
      <span className="flex items-center gap-2 min-w-0">
        <StockLogo symbol={s.symbol} size={28} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{s.symbol}</p>
          {s.name && <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{s.name}</p>}
        </div>
      </span>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">{priceLabel}</p>
        <p className={cn('text-[11px] font-medium tabular-nums', pctColor === 'gain' ? 'text-gain' : 'text-loss')}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </p>
      </div>
    </Link>
  );
}
