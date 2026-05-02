import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Search, Filter, Bookmark } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import StockLogo from '../components/StockLogo';
import { useWatchlistStore } from '../store/watchlistStore';
import toast from 'react-hot-toast';

type Tab = 'gainers' | 'losers';

export default function MarketExplorer() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE' | ''>('');
  const [activeTab, setActiveTab] = useState<Tab>('gainers');
  const [loading, setLoading] = useState(true);
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist);
  const fetchWatchlist = useWatchlistStore((s) => s.fetch);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        let url = '';
        let params: any = {};
        if (query.trim()) {
          url = '/api/stocks';
          params = { q: query.trim(), limit: 48, live: 1 };
          if (exchange) params.exchange = exchange;
        } else if (activeTab === 'losers') {
          url = '/api/stocks/losers';
        } else {
          url = '/api/stocks/gainers';
        }
        const res = await axios.get(url, { params, signal: controller.signal });
        setStocks(url === '/api/stocks' ? (res.data?.stocks || []) : (res.data || []));
      } catch {}
      setLoading(false);
    }, query ? 300 : 0);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [activeTab, query, exchange]);

  const tabs: { key: Tab; label: string }[] = useMemo(() => [
    { key: 'gainers', label: 'Gainers' },
    { key: 'losers', label: 'Losers' },
  ], []);

  const toggleWatchlist = useCallback(async (e: React.MouseEvent, symbol: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await axios.post('/api/watchlists/toggle', { symbol });
      await fetchWatchlist(true);
      const nowIn = useWatchlistStore.getState().isInWatchlist(symbol);
      toast.success(nowIn ? `${symbol} added to watchlist` : `${symbol} removed from watchlist`);
    } catch {
      toast.error('Failed to update watchlist');
    }
  }, [fetchWatchlist]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Market Explorer</h1>
        <span className="text-xs text-gray-500">Live prices · Yahoo Finance</span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NSE / BSE stocks..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value as any)}
            className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm appearance-none"
          >
            <option value="">All Exchanges</option>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
        </div>
      </div>

      {!query && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition',
                activeTab === t.key
                  ? 'bg-groww-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-44 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {query ? `No stocks found for "${query}"` : 'No stocks available'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {stocks.map((stock) => {
            const ex = stock.exchange || 'NSE';
            const cp: number = stock.change_percent ?? 0;
            const change: number = stock.change ?? 0;
            const price: number = stock.price ?? 0;
            const isGain = cp >= 0;
            const bookmarked = isInWatchlist(stock.symbol);
            return (
              <Link
                key={`${stock.symbol}:${ex}`}
                to={`/terminal/${stock.symbol}?exchange=${ex}`}
                className="group relative bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
              >
                {/* Bookmark button — visible on hover or if bookmarked */}
                <button
                  onClick={(e) => toggleWatchlist(e, stock.symbol)}
                  className={cn(
                    'absolute top-3 right-3 p-1 rounded-lg transition-all duration-150',
                    bookmarked
                      ? 'opacity-100 text-groww-primary'
                      : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-groww-primary'
                  )}
                  title={bookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  <Bookmark className={cn('w-4 h-4', bookmarked && 'fill-groww-primary')} />
                </button>

                {/* Logo */}
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <StockLogo symbol={stock.symbol} size={48} />
                </div>

                {/* Name */}
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate leading-tight">
                    {stock.name || stock.symbol}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{stock.symbol}</p>
                </div>

                {/* Price + change */}
                <div>
                  <p className="text-base font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(price)}
                  </p>
                  <p className={cn('text-sm font-medium tabular-nums mt-0.5', isGain ? 'text-gain' : 'text-loss')}>
                    {isGain ? '+' : ''}{change.toFixed(2)} ({isGain ? '+' : ''}{cp.toFixed(2)}%)
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}