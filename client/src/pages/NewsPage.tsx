import { useState, useEffect, useRef, useMemo } from 'react';
import { Newspaper, Search, X } from 'lucide-react';
import NewsFeed from '../components/NewsFeed';
import ActionCards from '../components/ActionCards';
import { cn } from '../lib/utils';

const QUICK_TOPICS = [
  { label: 'Nifty 50', q: 'Nifty50' },
  { label: 'Sensex', q: 'Sensex' },
  { label: 'Banking', q: 'Bank+Nifty+India' },
  { label: 'IT Sector', q: 'IT+sector+India+stocks' },
  { label: 'IPO', q: 'IPO+India+2025' },
  { label: 'RBI', q: 'RBI+India+monetary+policy' },
];

// Uppercase ticker-like pattern — treat as stock symbol for action cards
const STOCK_RE = /^[A-Z]{2,10}$/;

// Default popular stocks to analyze when no specific symbol is searched
const DEFAULT_SYMBOLS = ['BSE', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'];

export default function NewsPage() {
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveQuery(inputValue.trim());
    }, 600);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleClear = () => {
    setInputValue('');
    setActiveQuery('');
    inputRef.current?.focus();
  };

  // Derive symbols for action cards: searched stock symbol OR default list
  const actionSymbols = useMemo(() => {
    const q = activeQuery.toUpperCase().replace(/[^A-Z]/g, '');
    return STOCK_RE.test(q) ? [q] : DEFAULT_SYMBOLS;
  }, [activeQuery]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#00B386)' }}
          >
            <Newspaper className="w-5 h-5 text-white" />
          </span>
          Market News
        </h1>
        <p className="text-sm text-gray-400 mt-1 ml-11">
          Real-time Indian market headlines · AI trading signals · Auto-refreshes every 5 min
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search stock or topic… e.g. RELIANCE, Infosys, RBI"
          className={cn(
            'w-full pl-9 pr-9 py-3 rounded-xl border bg-white dark:bg-groww-card text-sm font-medium',
            'border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400',
            'dark:text-gray-100 dark:placeholder-gray-500 transition'
          )}
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick topic chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_TOPICS.map((t) => (
          <button
            key={t.q}
            onClick={() => setInputValue(t.label)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
              inputValue === t.label
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-groww-card border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* AI Trading Signals */}
      <ActionCards symbols={actionSymbols} />

      {/* News feed */}
      <NewsFeed query={activeQuery} />
    </div>
  );
}
