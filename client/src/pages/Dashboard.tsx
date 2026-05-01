import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
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
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const p = enrichedPortfolio;

  return (
    <div className="space-y-6">

      {/* ── Your Investments panel ── */}
      {p && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Your investments</h2>
          <div className="flex flex-wrap gap-6 items-end">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Current</p>
              <p className="text-2xl font-bold">{formatCurrency(p.currentValue || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">1D returns</p>
              <p className={cn('text-sm font-semibold tabular-nums', (p.dayChangeTotal ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                {(p.dayChangeTotal ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.dayChangeTotal ?? 0)} ({(p.dayChangePct ?? 0) >= 0 ? '+' : ''}{(p.dayChangePct ?? 0).toFixed(2)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Total returns</p>
              <p className={cn('text-sm font-semibold tabular-nums', (p.totalPnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                {(p.totalPnl || 0) >= 0 ? '+' : ''}{formatCurrency(p.totalPnl || 0)} ({(p.totalPnlPercent || 0) >= 0 ? '+' : ''}{(p.totalPnlPercent || 0).toFixed(2)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Invested</p>
              <p className="text-sm font-semibold tabular-nums">{formatCurrency(p.investedValue || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Available cash</p>
              <p className="text-sm font-semibold tabular-nums">{formatCurrency(p.balance || 0)}</p>
            </div>
          </div>
        </div>
      )}


      {/* Market Breadth */}
      {breadth.total > 10 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-indigo-500" /> Market Breadth
            <span className="ml-auto text-xs text-gray-400 font-normal">{breadth.total} stocks tracked</span>
          </h3>
          <div className="flex rounded-full overflow-hidden h-3 mb-3">
            <div className="bg-gain transition-all" style={{ width: `${breadth.advPct}%` }} title={`Advances: ${breadth.advances}`} />
            <div className="bg-gray-200 dark:bg-gray-700 transition-all" style={{ width: `${Math.round(breadth.unchanged / breadth.total * 100)}%` }} title={`Unchanged: ${breadth.unchanged}`} />
            <div className="bg-loss transition-all" style={{ width: `${breadth.decPct}%` }} title={`Declines: ${breadth.declines}`} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gain font-medium">▲ {breadth.advances} Advances ({breadth.advPct}%)</span>
            <span className="text-gray-400">A/D Ratio: {breadth.adRatio}</span>
            <span className="text-loss font-medium">{breadth.declines} Declines ({breadth.decPct}%) ▼</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-0 gap-0">
        {p?.holdings?.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
            No holdings yet. Start exploring the market!
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gain" /> Top Gainers</h3>
          <div className="space-y-2">
            {gainers.slice(0, 5).map((s: any) => (
              <Link key={s.symbol} to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <span className="flex items-center gap-2 text-sm font-medium"><StockLogo symbol={s.symbol} size={32} />{s.symbol}</span>
                <div className="text-right">
                  <span className="text-sm font-medium tabular-nums block">{formatCurrency(s.price ?? 0)}</span>
                  <span className="text-xs text-gain font-medium">+{(s.change_percent ?? 0).toFixed(2)}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-loss" /> Top Losers</h3>
          <div className="space-y-2">
            {losers.slice(0, 5).map((s: any) => (
              <Link key={s.symbol} to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <span className="flex items-center gap-2 text-sm font-medium"><StockLogo symbol={s.symbol} size={32} />{s.symbol}</span>
                <div className="text-right">
                  <span className="text-sm font-medium tabular-nums block">{formatCurrency(s.price ?? 0)}</span>
                  <span className="text-xs text-loss font-medium">{(s.change_percent ?? 0).toFixed(2)}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-600" /> Most Bought</h3>
        <div className="space-y-2">
          {mostBought.map((s: any) => (
            <Link key={s.symbol} to={`/terminal/${s.symbol}?exchange=${s.exchange || 'NSE'}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <span className="flex items-center gap-2 text-sm font-medium"><StockLogo symbol={s.symbol} size={32} />{s.symbol}</span>
              <div className="text-right">
                <span className="text-sm text-blue-600 font-medium block">{formatCurrency(s.price || 0)}</span>
                <span className="text-xs text-gray-500">Vol: {formatNumber(s.volume || 0)}</span>
              </div>
            </Link>
          ))}
          {mostBought.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No volume data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
