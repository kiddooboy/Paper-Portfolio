import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import StockLogo from '../components/StockLogo';

type Tab = 'gainers' | 'losers';

export default function MarketExplorer() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE' | ''>('');
  const [activeTab, setActiveTab] = useState<Tab>('gainers');
  const [loading, setLoading] = useState(true);

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
        if (url === '/api/stocks') {
          setStocks(res.data?.stocks || []);
        } else {
          setStocks(res.data || []);
        }
      } catch {}
      setLoading(false);
    }, query ? 300 : 0);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [activeTab, query, exchange]);

  const tabs: { key: Tab; label: string }[] = useMemo(
    () => [
      { key: 'gainers', label: 'Gainers' },
      { key: 'losers', label: 'Losers' },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Market Explorer</h1>
        <span className="text-xs text-gray-500">
          Live prices · Yahoo Finance
        </span>
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
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {query ? `No stocks found for "${query}"` : 'No stocks available'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stocks.map((stock) => {
            const ex = stock.exchange || 'NSE';
            const cp: number = stock.change_percent ?? 0;
            const price: number = stock.price ?? 0;
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
          })}
        </div>
      )}
    </div>
  );
}
