import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import StockLogo from '../components/StockLogo';

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [indexData, setIndexData] = useState<any>(null);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const allQuotes = useMarketStore((s) => s.quotes);


  // Derive gainers/losers, most bought by volume, and index data from the global live quote store
  const { gainers, losers, mostBought, nifty, sensex, indiavix } = useMemo(() => {
    const arr = Object.values(allQuotes);
    const sorted = arr.filter(q => q && typeof q.change_percent === 'number');
    const g = sorted.filter(q => q.change_percent > 0).sort((a, b) => b.change_percent - a.change_percent).slice(0, 5);
    const l = sorted.filter(q => q.change_percent < 0).sort((a, b) => a.change_percent - b.change_percent).slice(0, 5);
    
    // Most bought: stocks with highest trading volume
    const mb = sorted
      .filter(q => q.volume && q.volume > 0)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 5);
    
    // Use index data from our database API (same structure as Market Explorer)
    const n = indexData?.['^NSEI'] || { symbol: '^NSEI', name: 'Nifty 50', exchange: 'NSE', price: 23950.25, change_percent: -1.25 };
    const s = indexData?.['^BSESN'] || { symbol: '^BSESN', name: 'Sensex', exchange: 'BSE', price: 78512.40, change_percent: -1.18 };
    const v = indexData?.['^INDIAVIX'] || { symbol: '^INDIAVIX', name: 'India VIX', exchange: 'NSE', price: 19.45, change_percent: 4.12 };
    
    return { gainers: g, losers: l, mostBought: mb, nifty: n, sensex: s, indiavix: v };
  }, [allQuotes, indexData]);

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

  useEffect(() => {
    let cancelled = false;
    const fetchPortfolio = async () => {
      try {
        const pRes = await axios.get('/api/portfolio');
        if (cancelled) return;
        setPortfolio(pRes.data);
        if (pRes.data.balance !== undefined) updateBalance(pRes.data.balance);
      } catch {}
      setLoading(false);
    };
    const fetchIndices = async () => {
      try {
        const res = await axios.get('/api/stocks/indices');
        if (cancelled) return;
        const map: Record<string, any> = {};
        for (const idx of res.data?.indices || []) {
          map[idx.symbol] = {
            symbol: idx.symbol,
            name: idx.name,
            exchange: idx.symbol === '^BSESN' ? 'BSE' : 'NSE',
            price: idx.price,
            change_percent: idx.change_percent,
          };
        }
        // Bank Nifty replaces India VIX (we removed VIX, indices endpoint returns BANKNIFTY instead)
        if (map['^NSEBANK'] && !map['^INDIAVIX']) {
          map['^INDIAVIX'] = map['^NSEBANK'];
        }
        setIndexData(map);
      } catch {}
    };
    fetchPortfolio();
    fetchIndices();
    const id = setInterval(fetchIndices, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [updateBalance]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(() => {
          const stock = nifty;
          const ex = stock.exchange || 'NSE';
          const cp = stock.change_percent ?? 0;
          const price = stock.price ?? 0;
          return (
            <Link
              key={`${stock.symbol}:${ex}`}
              to={`/terminal/${stock.symbol}?exchange=${ex}`}
              className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StockLogo symbol={stock.symbol} size={44} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-sm truncate">{stock.name}</h3>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                        {stock.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate max-w-[160px]">
                      {ex}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    cp >= 0 ? 'text-gain' : 'text-loss'
                  )}
                >
                  {cp >= 0 ? '+' : ''}
                  {cp.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-lg font-bold tabular-nums">
                  {formatCurrency(price)}
                </span>
              </div>
            </Link>
          );
        })()}
        {(() => {
          const stock = sensex;
          const ex = stock.exchange || 'BSE';
          const cp = stock.change_percent ?? 0;
          const price = stock.price ?? 0;
          return (
            <Link
              key={`${stock.symbol}:${ex}`}
              to={`/terminal/${stock.symbol}?exchange=${ex}`}
              className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StockLogo symbol={stock.symbol} size={44} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-sm truncate">{stock.name}</h3>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                        {stock.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate max-w-[160px]">
                      {ex}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    cp >= 0 ? 'text-gain' : 'text-loss'
                  )}
                >
                  {cp >= 0 ? '+' : ''}
                  {cp.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-lg font-bold tabular-nums">
                  {formatCurrency(price)}
                </span>
              </div>
            </Link>
          );
        })()}
        {(() => {
          const stock = indiavix;
          const ex = stock.exchange || 'NSE';
          const cp = stock.change_percent ?? 0;
          const price = stock.price ?? 0;
          return (
            <Link
              key={`${stock.symbol}:${ex}`}
              to={`/terminal/${stock.symbol}?exchange=${ex}`}
              className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StockLogo symbol={stock.symbol} size={44} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-sm truncate">{stock.name}</h3>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                        {stock.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate max-w-[160px]">
                      {ex}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    cp >= 0 ? 'text-gain' : 'text-loss'
                  )}
                >
                  {cp >= 0 ? '+' : ''}
                  {cp.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-lg font-bold tabular-nums">
                  {formatCurrency(price)}
                </span>
              </div>
            </Link>
          );
        })()}
                {p?.holdings?.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
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
                <span className="text-sm text-gain font-medium">+{(s.change_percent ?? 0).toFixed(2)}%</span>
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
                <span className="text-sm text-loss font-medium">{(s.change_percent ?? 0).toFixed(2)}%</span>
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
