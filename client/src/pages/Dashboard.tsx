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

      {/* ── Row 1: Investments + Market Breadth ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Your Investments */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Your investments</p>

          {p ? (
            <>
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-0.5">Current value</p>
                <p className="text-3xl font-bold">{formatCurrency(p.currentValue || 0)}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Stat label="1D returns"
                  value={`${(p.dayChangeTotal ?? 0) >= 0 ? '+' : ''}${formatCurrency(p.dayChangeTotal ?? 0)}`}
                  sub={`${(p.dayChangePct ?? 0) >= 0 ? '+' : ''}${(p.dayChangePct ?? 0).toFixed(2)}%`}
                  color={(p.dayChangeTotal ?? 0) >= 0 ? 'gain' : 'loss'} />
                <Stat label="Total returns"
                  value={`${(p.totalPnl || 0) >= 0 ? '+' : ''}${formatCurrency(p.totalPnl || 0)}`}
                  sub={`${(p.totalPnlPercent || 0) >= 0 ? '+' : ''}${(p.totalPnlPercent || 0).toFixed(2)}%`}
                  color={(p.totalPnl || 0) >= 0 ? 'gain' : 'loss'} />
                <Stat label="Invested" value={formatCurrency(p.investedValue || 0)} />
                <Stat label="Available cash" value={formatCurrency(p.balance || 0)} />
              </div>

              {p.holdings?.length === 0 && (
                <Link to="/market" className="mt-4 inline-flex items-center gap-1.5 text-xs text-groww-primary font-semibold hover:underline">
                  Explore stocks to invest →
                </Link>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Sign in to see your investments
            </div>
          )}
        </div>

        {/* Market Breadth Donut */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Market Breadth</p>

          {breadth.total > 10 ? (
            <div className="flex items-center gap-6">
              {/* Donut */}
              <div className="relative shrink-0">
                <PieChart width={110} height={110}>
                  <Pie
                    data={[{ value: breadth.advPct }, { value: 100 - breadth.advPct }]}
                    cx={50} cy={50}
                    innerRadius={35} outerRadius={50}
                    startAngle={90} endAngle={-270}
                    dataKey="value" stroke="none"
                  >
                    <Cell fill={donutColor} />
                    <Cell fill={donutBg} />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-extrabold tabular-nums leading-none">{breadth.advPct}%</span>
                  <span className={cn('text-[11px] font-bold mt-0.5', isBull ? 'text-gain' : 'text-loss')}>
                    {isBull ? 'Bull' : 'Bear'}
                  </span>
                </div>
              </div>

              {/* Stats grid */}
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-3">
                  <Stat label="Advances" value={String(breadth.advances)} color="gain" />
                  <Stat label="Declines" value={String(breadth.declines)} color="loss" />
                  <Stat label="Unchanged" value={String(breadth.unchanged)} />
                  <Stat label="A/D Ratio" value={String(breadth.adRatio)} />
                </div>
                <p className="text-[11px] text-gray-400">
                  {breadth.total} stocks · {isBull ? 'Bullish' : 'Bearish'} breadth
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-6 text-center">Loading market data…</p>
          )}
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

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: 'gain' | 'loss' }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums leading-tight',
        color === 'gain' ? 'text-gain' : color === 'loss' ? 'text-loss' : ''
      )}>{value}</p>
      {sub && <p className={cn('text-[11px] tabular-nums', color === 'gain' ? 'text-gain' : color === 'loss' ? 'text-loss' : 'text-gray-400')}>{sub}</p>}
    </div>
  );
}

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
