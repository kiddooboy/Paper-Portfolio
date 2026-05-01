import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { PieChart, Pie, Cell } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import StockLogo from '../components/StockLogo';

export default function Dashboard() {
  const portfolio = usePortfolioStore((s) => s.data);
  const portfolioLoading = usePortfolioStore((s) => s.loading);
  const fetchPortfolioStore = usePortfolioStore((s) => s.fetch);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const allQuotes = useMarketStore((s) => s.quotes);
  const loading = portfolioLoading && !portfolio;

  // Derive gainers/losers, most bought by volume from the global live quote store
  const { gainers, losers, mostBought, breadth } = useMemo(() => {
    const arr = Object.values(allQuotes);
    const sorted = arr.filter(q => q && typeof q.change_percent === 'number');
    const g = sorted.filter(q => q.change_percent > 0).sort((a, b) => b.change_percent - a.change_percent).slice(0, 5);
    const l = sorted.filter(q => q.change_percent < 0).sort((a, b) => a.change_percent - b.change_percent).slice(0, 5);
    const mb = sorted.filter(q => q.volume && q.volume > 0).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);

    const advances = sorted.filter(q => q.change_percent > 0).length;
    const declines = sorted.filter(q => q.change_percent < 0).length;
    const unchanged = sorted.length - advances - declines;
    const total = sorted.length || 1;

    return {
      gainers: g, losers: l, mostBought: mb,
      breadth: { advances, declines, unchanged, total,
        advPct: Math.round(advances / total * 100),
        decPct: Math.round(declines / total * 100),
        adRatio: declines > 0 ? (advances / declines).toFixed(2) : '∞',
      },
    };
  }, [allQuotes]);

  // Enrich portfolio holdings with live prices from global store
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
    let investedValue = 0, currentValue = 0;
    for (const h of holdings) {
      investedValue += h.avg_buy_price * h.quantity;
      currentValue += (h.current_price || h.avg_buy_price) * h.quantity;
    }
    const totalPnl = currentValue - investedValue;
    const totalPnlPercent = investedValue > 0 ? (totalPnl / investedValue) * 100 : 0;
    return { ...portfolio, holdings, investedValue, currentValue, totalPnl, totalPnlPercent: +totalPnlPercent.toFixed(2) };
  }, [portfolio, allQuotes]);

  // Refresh portfolio in store on mount (bootstrap may have already loaded it)
  useEffect(() => {
    fetchPortfolioStore();
  }, [fetchPortfolioStore]);

  // Keep auth balance in sync with the latest portfolio fetch
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
  const isBull = breadth.advPct >= 50;
  const donutColor = isBull ? '#00B386' : '#EB5B3C';
  const donutBg = '#1e293b';

  return (
    <div className="space-y-4">

      {/* ── Row 1: Investments + Market Breadth — Layout 4 accent-border ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Your Investments ── green top accent */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="h-1 w-full bg-gain" />
          <div className="p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Your Investments</p>

            {p ? (
              <>
                {/* Current value + today badge */}
                <div className="flex items-start justify-between mb-4">
                  <p className="text-3xl font-bold">{formatCurrency(p.currentValue || 0)}</p>
                  <div className="text-right">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold',
                      (p.dayChangePct ?? 0) >= 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-gain'
                        : 'bg-red-100 dark:bg-red-900/20 text-loss'
                    )}>
                      {(p.dayChangePct ?? 0) >= 0 ? '+' : ''}{(p.dayChangePct ?? 0).toFixed(2)}% today
                    </span>
                    <p className={cn('text-xs font-semibold mt-1 tabular-nums', (p.dayChangeTotal ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.dayChangeTotal ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.dayChangeTotal ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Sub-cards with left accent border */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="border-l-2 border-gain pl-3 py-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">Total returns</p>
                    <p className={cn('text-sm font-bold tabular-nums leading-tight', (p.totalPnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.totalPnl || 0) >= 0 ? '+' : ''}{formatCurrency(p.totalPnl || 0)}
                    </p>
                    <p className={cn('text-[11px] tabular-nums', (p.totalPnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.totalPnlPercent || 0) >= 0 ? '+' : ''}{(p.totalPnlPercent || 0).toFixed(2)}%
                    </p>
                  </div>
                  <div className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 py-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">Invested</p>
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(p.investedValue || 0)}</p>
                  </div>
                  <div className="border-l-2 border-blue-400 pl-3 py-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">Available cash</p>
                    <p className="text-sm font-bold tabular-nums text-blue-500">{formatCurrency(p.balance || 0)}</p>
                  </div>
                </div>

                {p.holdings?.length === 0 && (
                  <Link to="/market" className="mt-3 inline-flex items-center gap-1 text-xs text-groww-primary font-semibold hover:underline">
                    Explore stocks to invest →
                  </Link>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 py-6 text-center">Sign in to see your investments</p>
            )}
          </div>
        </div>

        {/* ── Market Breadth ── red/green top accent based on sentiment */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className={cn('h-1 w-full', isBull ? 'bg-gain' : 'bg-loss')} />
          <div className="p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Market Breadth</p>

            {breadth.total > 10 ? (
              <>
                <div className="flex items-center gap-5 mb-4">
                  {/* Donut */}
                  <div className="relative shrink-0">
                    <PieChart width={100} height={100}>
                      <Pie
                        data={[{ value: breadth.advPct }, { value: 100 - breadth.advPct }]}
                        cx={46} cy={46}
                        innerRadius={33} outerRadius={46}
                        startAngle={90} endAngle={-270}
                        dataKey="value" stroke="none"
                      >
                        <Cell fill={donutColor} />
                        <Cell fill={donutBg} />
                      </Pie>
                    </PieChart>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-base font-extrabold tabular-nums leading-none">{breadth.advPct}%</span>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide mt-0.5', isBull ? 'text-gain' : 'text-loss')}>
                        {isBull ? 'Bull' : 'Bear'}
                      </span>
                    </div>
                  </div>

                  {/* Advances / Declines big numbers */}
                  <div className="flex gap-6">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Advances</p>
                      <p className="text-2xl font-extrabold text-gain">{breadth.advances}</p>
                      <div className="h-0.5 w-8 bg-gain mt-1 rounded-full" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Declines</p>
                      <p className="text-2xl font-extrabold text-loss">{breadth.declines}</p>
                      <div className="h-0.5 w-8 bg-loss mt-1 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Footer stats */}
                <div className="flex items-center gap-4 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <span>Unchanged: <strong className="text-gray-600 dark:text-gray-300">{breadth.unchanged}</strong></span>
                  <span>A/D: <strong className="text-gray-600 dark:text-gray-300">{breadth.adRatio}</strong></span>
                  <span className="ml-auto">{breadth.total} stocks</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 py-6 text-center">Loading market data…</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Gainers | Losers | Most Bought ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Top Gainers */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-gain" /> Top Gainers
          </h3>
          <div className="space-y-1">
            {gainers.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>}
            {gainers.map((s: any) => (
              <StockRow key={s.symbol} s={s} pctColor="gain" />
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-loss" /> Top Losers
          </h3>
          <div className="space-y-1">
            {losers.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>}
            {losers.map((s: any) => (
              <StockRow key={s.symbol} s={s} pctColor="loss" />
            ))}
          </div>
        </div>

        {/* Most Bought */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-500" /> Most Active
          </h3>
          <div className="space-y-1">
            {mostBought.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>}
            {mostBought.map((s: any) => (
              <Link key={s.symbol} to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}`}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                <span className="flex items-center gap-2 min-w-0">
                  <StockLogo symbol={s.symbol} size={30} />
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

    </div>
  );
}

/* ── Sub-components ── */

function StockRow({ s, pctColor }: { s: any; pctColor: 'gain' | 'loss' }) {
  const pct = s.change_percent ?? 0;
  return (
    <Link to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}`}
      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
      <span className="flex items-center gap-2 min-w-0">
        <StockLogo symbol={s.symbol} size={30} />
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
