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
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading && !items.length) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-white/5 border border-white/10" />
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
            className="rounded-lg bg-slate-900/60 border border-white/10 p-3 hover:border-amber-400/40 transition"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
              {q.name}
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-base font-bold text-gray-100 font-mono">
                {q.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-semibold flex items-center gap-0.5 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {(q.change_percent ?? 0).toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
