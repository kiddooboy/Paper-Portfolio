// Live S&P / NASDAQ / DJ / VIX / Russell / FTSE strip — used at the top of
// the Global Markets page. Polls /api/global/indices every 30 s.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface IdxQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
}

export default function GlobalIndicesTicker() {
  const [items, setItems] = useState<IdxQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await axios.get('/api/global/indices');
        if (alive) setItems(res.data?.indices ?? []);
      } catch { /* keep last good */ }
      finally { if (alive) setLoading(false); }
    }
    load();
    const t = setInterval(load, 8_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading && !items.length) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {items.map((q) => {
        const up = (q.change_percent ?? 0) >= 0;
        return (
          <div
            key={q.symbol}
            className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 p-2.5 hover:border-groww-primary/40 hover:shadow-sm transition"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1 truncate">
              {q.name}
            </div>
            <div className="flex items-baseline justify-between gap-1">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono">
                {q.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-[10.5px] font-semibold flex items-center gap-0.5 ${up ? 'text-gain' : 'text-loss'}`}>
                {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {(q.change_percent ?? 0).toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
