// FILE: client/src/pages/ScreenerPage.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  SlidersHorizontal,
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import StockChart from '../components/StockChart';
import CompanyResearchPanel from '../components/CompanyResearchPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ScreenerStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  high_52w: number | null;
  low_52w: number | null;
  eps: number | null;
  roe: number | null;
  book_value: number | null;
  debt_to_equity: number | null;
  div_yield: number | null;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface FundamentalsResponse {
  symbol: string;
  exchange: string;
  profile: {
    longName?: string;
    website?: string;
    industry?: string;
    sector?: string;
    country?: string;
    employees?: number | null;
    address1?: string;
    city?: string;
    summary?: string;
    executives?: { name: string; title: string; age: number | null; totalPay: number | null }[];
  };
  quote: {
    price: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    currency?: string;
    marketCap: number | null;
  };
  keyStats: Record<string, number | null>;
  financials: Record<string, number | string | null>;
  incomeStatement: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  balanceSheet: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  cashFlow: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  earnings: {
    quarterly: { date: string; actual: number | null; estimate: number | null }[];
    financialsQuarterly: { date: string; revenue: number | null; earnings: number | null }[];
    financialsYearly: { date: string; revenue: number | null; earnings: number | null }[];
  };
  holders: {
    pctInsiders: number | null;
    pctInstitutions: number | null;
    pctFloatHeldByInstitutions: number | null;
    institutionsCount: number | null;
    topInstitutions: Record<string, number | string | null>[];
    topFunds: Record<string, number | string | null>[];
    insiders: Record<string, number | string | null>[];
  };
  analysts: {
    recommendationTrend: Record<string, number | string | null>[];
    upgrades: Record<string, number | string | null>[];
  };
  pros: string[];
  cons: string[];
}

interface Filters {
  sectors: string[];
  marketCapMin: string;
  marketCapMax: string;
  peMin: string;
  peMax: string;
  divYieldMin: string;
  divYieldMax: string;
  roeMin: string;
  roeMax: string;
  priceMin: string;
  priceMax: string;
  changePctMin: string;
  changePctMax: string;
  near52wHigh: boolean;
  near52wLow: boolean;
  epsMin: string;
  epsMax: string;
  debtEqMin: string;
  debtEqMax: string;
  bookValueMin: string;
  bookValueMax: string;
}

const EMPTY_FILTERS: Filters = {
  sectors: [],
  marketCapMin: '',
  marketCapMax: '',
  peMin: '',
  peMax: '',
  divYieldMin: '',
  divYieldMax: '',
  roeMin: '',
  roeMax: '',
  priceMin: '',
  priceMax: '',
  changePctMin: '',
  changePctMax: '',
  near52wHigh: false,
  near52wLow: false,
  epsMin: '',
  epsMax: '',
  debtEqMin: '',
  debtEqMax: '',
  bookValueMin: '',
  bookValueMax: '',
};

const PRESETS: { key: string; label: string; description: string }[] = [
  { key: 'large_cap',     label: 'Large Cap',       description: 'Mkt cap ≥ ₹50,000 Cr' },
  { key: 'mid_cap',       label: 'Mid Cap',         description: '₹10,000 – ₹50,000 Cr' },
  { key: 'small_cap',     label: 'Small Cap',       description: 'Mkt cap < ₹10,000 Cr' },
  { key: 'low_pe',        label: 'Low P/E',         description: 'PE under 15' },
  { key: 'high_dividend', label: 'High Dividend',   description: 'Div yield > 3%' },
  { key: 'value',         label: 'Value',           description: 'PE<20 & div>2%' },
  { key: 'quality',       label: 'Quality (ROE)',   description: 'ROE > 15%' },
  { key: '52w_high',      label: 'Near 52w High',   description: 'Within 5% of 52w high' },
  { key: '52w_low',       label: 'Near 52w Low',    description: 'Within 5% of 52w low' },
  { key: 'top_gainers',   label: 'Top Gainers',     description: "Today's biggest gainers" },
  { key: 'top_losers',    label: 'Top Losers',      description: "Today's biggest losers" },
];

type SortKey = 'market_cap' | 'pe_ratio' | 'div_yield' | 'roe' | 'change_percent' | 'price' | 'name' | 'eps' | 'debt_to_equity';

const COLUMNS: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name',           label: 'Stock',        align: 'left' },
  { key: 'price',          label: 'Price',        align: 'right' },
  { key: 'change_percent', label: '% Chg',        align: 'right' },
  { key: 'market_cap',     label: 'Mkt Cap (Cr)', align: 'right' },
  { key: 'pe_ratio',       label: 'P/E',          align: 'right' },
  { key: 'roe',            label: 'ROE %',        align: 'right' },
  { key: 'eps',            label: 'EPS',          align: 'right' },
  { key: 'debt_to_equity', label: 'D/E',          align: 'right' },
  { key: 'div_yield',      label: 'Div Yield %',  align: 'right' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtNumber(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtCrore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L Cr`;
  if (n >= 1000)   return `${(n / 1000).toFixed(2)}K Cr`;
  return `${n.toFixed(0)} Cr`;
}

function buildParams(
  filters: Filters,
  preset: string,
  sortBy: SortKey,
  sortDir: 'asc' | 'desc',
  page: number,
  limit: number
): Record<string, string> {
  const p: Record<string, string> = {
    sortBy,
    sortDir,
    page: String(page),
    limit: String(limit),
  };
  if (preset) p.preset = preset;
  if (filters.sectors.length) p.sectors = filters.sectors.join(',');
  if (filters.marketCapMin) p.marketCapMin = filters.marketCapMin;
  if (filters.marketCapMax) p.marketCapMax = filters.marketCapMax;
  if (filters.peMin) p.peMin = filters.peMin;
  if (filters.peMax) p.peMax = filters.peMax;
  if (filters.divYieldMin) p.divYieldMin = filters.divYieldMin;
  if (filters.divYieldMax) p.divYieldMax = filters.divYieldMax;
  if (filters.roeMin) p.roeMin = filters.roeMin;
  if (filters.roeMax) p.roeMax = filters.roeMax;
  if (filters.priceMin) p.priceMin = filters.priceMin;
  if (filters.priceMax) p.priceMax = filters.priceMax;
  if (filters.changePctMin) p.changePctMin = filters.changePctMin;
  if (filters.changePctMax) p.changePctMax = filters.changePctMax;
  if (filters.near52wHigh) p.near52wHigh = '1';
  if (filters.near52wLow) p.near52wLow = '1';
  if (filters.epsMin) p.epsMin = filters.epsMin;
  if (filters.epsMax) p.epsMax = filters.epsMax;
  if (filters.debtEqMin) p.debtEqMin = filters.debtEqMin;
  if (filters.debtEqMax) p.debtEqMax = filters.debtEqMax;
  if (filters.bookValueMin) p.bookValueMin = filters.bookValueMin;
  if (filters.bookValueMax) p.bookValueMax = filters.bookValueMax;
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Bar
// ─────────────────────────────────────────────────────────────────────────────
function StockSearchBar({ onSelect }: { onSelect: (symbol: string, exchange: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      axios
        .get('/api/stocks/search', { params: { q: query.trim() } })
        .then((res) => {
          setResults(res.data || []);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (r: SearchResult) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(r.symbol, r.exchange);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search stocks by name or symbol (e.g. RELIANCE, TCS)…"
          className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
          {results.slice(0, 10).map((r) => (
            <button
              key={`${r.symbol}:${r.exchange}`}
              onMouseDown={() => handleSelect(r)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition"
            >
              <div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{r.symbol}</span>
                <span className="ml-2 text-sm text-gray-500">{r.name}</span>
              </div>
              <span className="text-xs text-gray-400 shrink-0 ml-3 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                {r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Research View
// ─────────────────────────────────────────────────────────────────────────────
function ResearchView({
  symbol,
  exchange,
  onBack,
}: {
  symbol: string;
  exchange: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<FundamentalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    axios
      .get(`/api/stocks/${encodeURIComponent(symbol.toUpperCase())}/fundamentals`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          setError(e?.response?.data?.error || e?.message || 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading research…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center">
        <p className="text-red-500 font-semibold mb-2">Failed to load fundamentals</p>
        <p className="text-sm text-gray-500 mb-4">{error || 'Unknown error'}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Screener
        </button>
      </div>
    );
  }

  const { profile, quote, pros, cons } = data;
  const isUp = (quote.changePercent ?? 0) > 0;
  const isDown = (quote.changePercent ?? 0) < 0;

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 mb-2 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Screener
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {profile.longName || symbol}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {exchange} : {symbol}
              </span>
              {profile.sector && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                  {profile.sector}
                </span>
              )}
              {profile.industry && profile.industry !== profile.sector && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {profile.industry}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {quote.price != null ? `₹${fmtNumber(quote.price)}` : '–'}
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-1 mt-1 text-sm font-semibold tabular-nums',
                isUp && 'text-groww-primary',
                isDown && 'text-red-500',
                !isUp && !isDown && 'text-gray-500'
              )}
            >
              {isUp ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : null}
              {(quote.change ?? 0) > 0 ? '+' : ''}
              {fmtNumber(quote.change)} ({fmtNumber(quote.changePercent)}%)
            </div>
          </div>
        </div>
      </div>

      {/* Pros & Cons */}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold text-groww-primary mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> PROS
            </h3>
            {pros.length === 0 ? (
              <p className="text-sm text-gray-500">No notable strengths detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {pros.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-groww-primary mt-1">●</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold text-red-500 mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> CONS
            </h3>
            {cons.length === 0 ? (
              <p className="text-sm text-gray-500">No major weaknesses detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {cons.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">●</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="font-bold mb-3 text-gray-900 dark:text-gray-100">Price Chart</h3>
        <StockChart symbol={symbol} exchange={exchange as 'NSE' | 'BSE'} />
      </div>

      {/* Research panel */}
      <CompanyResearchPanel data={data} symbol={symbol} exchange={exchange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters Panel
// ─────────────────────────────────────────────────────────────────────────────
interface FiltersPanelProps {
  filters: Filters;
  sectors: string[];
  updateFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  toggleSector: (sector: string) => void;
  onClose: () => void;
}

function FiltersPanel({ filters, sectors, updateFilter, toggleSector, onClose }: FiltersPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-groww-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

      <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1">
        <FilterGroup label="Market Cap (₹ Cr)">
          <RangeInputs
            min={filters.marketCapMin}
            max={filters.marketCapMax}
            onMin={(v) => updateFilter('marketCapMin', v)}
            onMax={(v) => updateFilter('marketCapMax', v)}
            placeholderMin="0"
            placeholderMax="∞"
          />
        </FilterGroup>

        <FilterGroup label="P/E Ratio">
          <RangeInputs
            min={filters.peMin}
            max={filters.peMax}
            onMin={(v) => updateFilter('peMin', v)}
            onMax={(v) => updateFilter('peMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="EPS">
          <RangeInputs
            min={filters.epsMin}
            max={filters.epsMax}
            onMin={(v) => updateFilter('epsMin', v)}
            onMax={(v) => updateFilter('epsMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="Debt / Equity">
          <RangeInputs
            min={filters.debtEqMin}
            max={filters.debtEqMax}
            onMin={(v) => updateFilter('debtEqMin', v)}
            onMax={(v) => updateFilter('debtEqMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="Book Value (₹)">
          <RangeInputs
            min={filters.bookValueMin}
            max={filters.bookValueMax}
            onMin={(v) => updateFilter('bookValueMin', v)}
            onMax={(v) => updateFilter('bookValueMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="Dividend Yield (%)">
          <RangeInputs
            min={filters.divYieldMin}
            max={filters.divYieldMax}
            onMin={(v) => updateFilter('divYieldMin', v)}
            onMax={(v) => updateFilter('divYieldMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="ROE (%)">
          <RangeInputs
            min={filters.roeMin}
            max={filters.roeMax}
            onMin={(v) => updateFilter('roeMin', v)}
            onMax={(v) => updateFilter('roeMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="Price (₹)">
          <RangeInputs
            min={filters.priceMin}
            max={filters.priceMax}
            onMin={(v) => updateFilter('priceMin', v)}
            onMax={(v) => updateFilter('priceMax', v)}
          />
        </FilterGroup>

        <FilterGroup label="Today's Change (%)">
          <RangeInputs
            min={filters.changePctMin}
            max={filters.changePctMax}
            onMin={(v) => updateFilter('changePctMin', v)}
            onMax={(v) => updateFilter('changePctMax', v)}
            placeholderMin="-100"
            placeholderMax="100"
          />
        </FilterGroup>

        <FilterGroup label="52-week Proximity">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.near52wHigh}
              onChange={(e) => updateFilter('near52wHigh', e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            Within 5% of 52w high
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer mt-1.5">
            <input
              type="checkbox"
              checked={filters.near52wLow}
              onChange={(e) => updateFilter('near52wLow', e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            Within 5% of 52w low
          </label>
        </FilterGroup>

        {sectors.length > 0 && (
          <FilterGroup label={`Sector ${filters.sectors.length ? `(${filters.sectors.length})` : ''}`}>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {sectors.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.sectors.includes(s)}
                    onChange={() => toggleSector(s)}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span className="line-clamp-1">{s}</span>
                </label>
              ))}
            </div>
          </FilterGroup>
        )}
      </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function RangeInputs({
  min,
  max,
  onMin,
  onMax,
  placeholderMin = 'Min',
  placeholderMax = 'Max',
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={min}
        onChange={(e) => onMin(e.target.value)}
        placeholder={placeholderMin}
        className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-dark text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/40"
      />
      <input
        type="number"
        inputMode="decimal"
        value={max}
        onChange={(e) => onMax(e.target.value)}
        placeholder={placeholderMax}
        className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-dark text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/40"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screener Table
// ─────────────────────────────────────────────────────────────────────────────
interface ScreenerTableSectionProps {
  filters: Filters;
  preset: string;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  page: number;
  limit: number;
  screenerData: { stocks: ScreenerStock[]; total: number; totalPages: number; sectors: string[] };
  loading: boolean;
  error: string | null;
  showFilters: boolean;
  activeFilterCount: number;
  onSort: (key: SortKey) => void;
  onPreset: (key: string) => void;
  onReset: () => void;
  onSetShowFilters: (v: boolean) => void;
  onSetPage: (p: number) => void;
  updateFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  toggleSector: (sector: string) => void;
  onSelectStock: (symbol: string, exchange: string) => void;
}

function ScreenerTableSection({
  filters,
  preset,
  sortBy,
  sortDir,
  page,
  screenerData,
  loading,
  error,
  showFilters,
  activeFilterCount,
  onSort,
  onPreset,
  onReset,
  onSetShowFilters,
  onSetPage,
  updateFilter,
  toggleSector,
  onSelectStock,
}: ScreenerTableSectionProps) {
  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            title={p.description}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
              preset === p.key
                ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                : 'bg-white dark:bg-groww-card border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filter popup */}
      {showFilters && (
        <FiltersPanel
          filters={filters}
          sectors={screenerData.sectors}
          updateFilter={updateFilter}
          toggleSector={toggleSector}
          onClose={() => onSetShowFilters(false)}
        />
      )}

      {/* Results */}
      <div>
        <section className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…
                </span>
              ) : (
                <>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {screenerData.total}
                  </span>{' '}
                  matches
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSetShowFilters(!showFilters)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-medium hover:border-indigo-400 dark:text-gray-300"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                onClick={onReset}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>

          {error && <div className="p-8 text-center text-sm text-red-500">{error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      className={cn(
                        'px-4 py-3 font-semibold text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap',
                        c.align === 'right' ? 'text-right' : 'text-left',
                        sortBy === c.key && 'text-indigo-600 dark:text-indigo-400'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          c.align === 'right' && 'flex-row-reverse'
                        )}
                      >
                        {c.label}
                        {sortBy === c.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && screenerData.stocks.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="px-4 py-4">
                          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : screenerData.stocks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      No stocks match these filters. Try widening your criteria or hit reset.
                    </td>
                  </tr>
                ) : (
                  screenerData.stocks.map((s) => (
                    <tr
                      key={`${s.symbol}:${s.exchange}`}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition cursor-pointer"
                      onClick={() => onSelectStock(s.symbol, s.exchange)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                          {s.symbol}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 max-w-[260px]">
                          {s.name}
                          {s.sector && (
                            <span className="text-gray-400"> · {s.sector}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        ₹{fmtNumber(s.price)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right tabular-nums font-semibold',
                          s.change_percent > 0
                            ? 'text-groww-primary'
                            : s.change_percent < 0
                            ? 'text-red-500'
                            : 'text-gray-500'
                        )}
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          {s.change_percent > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : s.change_percent < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : null}
                          {s.change_percent > 0 ? '+' : ''}
                          {fmtNumber(s.change_percent)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtCrore(s.market_cap)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtNumber(s.pe_ratio)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtNumber(s.roe)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtNumber(s.eps)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtNumber(s.debt_to_equity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {fmtNumber(s.div_yield)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {screenerData.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Page <span className="font-semibold">{page}</span> of {screenerData.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSetPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40 hover:border-indigo-400"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => onSetPage(Math.min(screenerData.totalPages, page + 1))}
                  disabled={page >= screenerData.totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40 hover:border-indigo-400"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  // Screener state (preserved across research mode)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [preset, setPreset] = useState<string>('large_cap');
  const [sortBy, setSortBy] = useState<SortKey>('market_cap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [screenerData, setScreenerData] = useState<{
    stocks: ScreenerStock[];
    total: number;
    totalPages: number;
    sectors: string[];
  }>({ stocks: [], total: 0, totalPages: 1, sectors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Research mode state
  const [selectedStock, setSelectedStock] = useState<{ symbol: string; exchange: string } | null>(null);

  const params = useMemo(
    () => buildParams(filters, preset, sortBy, sortDir, page, limit),
    [filters, preset, sortBy, sortDir, page]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/stocks/screener', { params });
      setScreenerData({
        stocks: res.data?.stocks || [],
        total: res.data?.total || 0,
        totalPages: res.data?.totalPages || 1,
        sectors: res.data?.sectors || [],
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e?.response?.data?.error || e?.message || 'Failed to load screener');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handlePreset = (key: string) => {
    setPreset((curr) => (curr === key ? '' : key));
    setPage(1);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setPreset('');
    setSortBy('market_cap');
    setSortDir('desc');
    setPage(1);
  };

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const toggleSector = (sector: string) => {
    setFilters((f) => ({
      ...f,
      sectors: f.sectors.includes(sector)
        ? f.sectors.filter((s) => s !== sector)
        : [...f.sectors, sector],
    }));
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.sectors.length) n++;
    if (filters.marketCapMin || filters.marketCapMax) n++;
    if (filters.peMin || filters.peMax) n++;
    if (filters.divYieldMin || filters.divYieldMax) n++;
    if (filters.roeMin || filters.roeMax) n++;
    if (filters.priceMin || filters.priceMax) n++;
    if (filters.changePctMin || filters.changePctMax) n++;
    if (filters.near52wHigh) n++;
    if (filters.near52wLow) n++;
    if (filters.epsMin || filters.epsMax) n++;
    if (filters.debtEqMin || filters.debtEqMax) n++;
    if (filters.bookValueMin || filters.bookValueMax) n++;
    return n;
  }, [filters]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366f1,#00B386)' }}
            >
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </span>
            {selectedStock ? 'Stock Research' : 'Stock Screener'}
          </h1>
          {!selectedStock && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-11">
              Filter NIFTY 500 stocks by fundamentals, valuation &amp; momentum · Live prices
            </p>
          )}
        </div>
      </div>

      {/* Search bar — always visible */}
      <StockSearchBar
        onSelect={(sym, exch) => setSelectedStock({ symbol: sym, exchange: exch })}
      />

      {/* Research mode */}
      {selectedStock ? (
        <ResearchView
          symbol={selectedStock.symbol}
          exchange={selectedStock.exchange}
          onBack={() => setSelectedStock(null)}
        />
      ) : (
        /* Screener mode */
        <ScreenerTableSection
          filters={filters}
          preset={preset}
          sortBy={sortBy}
          sortDir={sortDir}
          page={page}
          limit={limit}
          screenerData={screenerData}
          loading={loading}
          error={error}
          showFilters={showFilters}
          activeFilterCount={activeFilterCount}
          onSort={handleSort}
          onPreset={handlePreset}
          onReset={handleReset}
          onSetShowFilters={setShowFilters}
          onSetPage={setPage}
          updateFilter={updateFilter}
          toggleSector={toggleSector}
          onSelectStock={(sym, exch) => setSelectedStock({ symbol: sym, exchange: exch })}
        />
      )}
    </div>
  );
}
