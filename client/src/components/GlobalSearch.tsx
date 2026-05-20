import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import axios from 'axios';
import StockLogo from './StockLogo';

interface Result {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
}

interface GlobalSearchProps {
  onStockSelect?: (symbol: string, exchange: string) => void;
}

export default function GlobalSearch({ onStockSelect }: GlobalSearchProps = {}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      // Ctrl/Cmd+K from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      // Plain `/` shortcut — only when not already typing in a field
      if (!inField && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await axios.get('/api/stocks/search', {
          params: { q, limit: 12 },
          signal: controller.signal,
        });
        setResults(res.data);
        setActive(0);
      } catch {}
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const go = (r: Result) => {
    if (onStockSelect) {
      onStockSelect(r.symbol, r.exchange);
      setOpen(false);
      setQ('');
    } else {
      window.open(`/terminal/${r.symbol}?exchange=${r.exchange}&fullscreen=1`, '_blank');
      setOpen(false);
      setQ('');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search NSE / BSE stocks (Ctrl+K)"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm border border-transparent focus:border-groww-primary focus:bg-white dark:focus:bg-gray-900 outline-none transition"
        />
      </div>
      {open && q && (
        <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-96 overflow-y-auto z-50">
          {results.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No matches</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.symbol}:${r.exchange}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 ${
                  i === active ? 'bg-gray-50 dark:bg-gray-800' : ''
                }`}
              >
                <StockLogo symbol={r.symbol} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                      {r.symbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{r.exchange}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
