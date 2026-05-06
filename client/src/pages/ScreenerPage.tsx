import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '../lib/utils';

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
  market_cap: number | null; // in Cr
  pe_ratio: number | null;
  high_52w: number | null;
  low_52w: number | null;
  eps: number | null;
  roe: number | null;
  book_value: number | null;
  debt_to_equity: number | null;
  div_yield: number | null;
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
  { key: 'top_gainers',   label: 'Top Gainers',     description: 'Today\u2019s biggest gainers' },
  { key: 'top_losers',    label: 'Top Losers',      description: 'Today\u2019s biggest losers' },
];

type SortKey = 'market_cap' | 'pe_ratio' | 'div_yield' | 'roe' | 'change_percent' | 'price' | 'name';

const COLUMNS: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name',           label: 'Stock',         align: 'left' },
  { key: 'price',          label: 'Price',         align: 'right' },
  { key: 'change_percent', label: '% Chg',         align: 'right' },
  { key: 'market_cap',     label: 'Mkt Cap (Cr)',  align: 'right' },
  { key: 'pe_ratio',       label: 'P/E',           align: 'right' },
  { key: 'roe',            label: 'ROE %',         align: 'right' },
  { key: 'div_yield',      label: 'Div Yield %',   align: 'right' },
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

function buildParams(filters: Filters, preset: string, sortBy: SortKey, sortDir: 'asc' | 'desc', page: number, limit: number) {
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
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [preset, setPreset] = useState<string>('large_cap'); // default view
  const [sortBy, setSortBy] = useState<SortKey>('market_cap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [data, setData] = useState<{
    stocks: ScreenerStock[];
    total: number;
    totalPages: number;
    sectors: string[];
  }>({ stocks: [], total: 0, totalPages: 1, sectors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false); // mobile drawer

  // Build query string for the API
  const params = useMemo(() => buildParams(filters, preset, sortBy, sortDir, page, limit), [filters, preset, sortBy, sortDir, page, limit]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/stocks/screener', { params });
      setData({
        stocks: res.data?.stocks || [],
        total: res.data?.total || 0,
        totalPages: res.data?.totalPages || 1,
        sectors: res.data?.sectors || [],
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load screener');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      sectors: f.sectors.includes(sector) ? f.sectors.filter((s) => s !== sector) : [...f.sectors, sector],
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
    return n;
  }, [filters]);

  return (
    <div className="space-y-6">
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
            Stock Screener
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-11">
            Filter NIFTY 500 stocks by fundamentals, valuation & momentum · Live prices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="lg:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-medium hover:border-indigo-400"
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
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
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

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* Filters panel — sidebar on desktop, drawer on mobile */}
        <aside
          className={cn(
            'lg:block',
            showFilters ? 'block' : 'hidden'
          )}
        >
          <FiltersPanel
            filters={filters}
            sectors={data.sectors}
            updateFilter={updateFilter}
            toggleSector={toggleSector}
            onClose={() => setShowFilters(false)}
          />
        </aside>

        {/* Results */}
        <section className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</span>
              ) : (
                <>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{data.total}</span> matches
                </>
              )}
            </div>
            <div className="text-xs text-gray-400">Sorted by <span className="font-medium text-gray-600 dark:text-gray-300">{sortBy.replace('_', ' ')}</span> · {sortDir.toUpperCase()}</div>
          </div>

          {error && (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          )}

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => handleSort(c.key)}
                      className={cn(
                        'px-4 py-3 font-semibold text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap',
                        c.align === 'right' ? 'text-right' : 'text-left',
                        sortBy === c.key && 'text-indigo-600 dark:text-indigo-400'
                      )}
                    >
                      <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                        {c.label}
                        {sortBy === c.key ? (
                          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && data.stocks.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="px-4 py-4">
                          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.stocks.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      No stocks match these filters. Try widening your criteria or hit reset.
                    </td>
                  </tr>
                ) : (
                  data.stocks.map((s) => (
                    <tr
                      key={`${s.symbol}:${s.exchange}`}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
                    >
                      <td className="px-4 py-3">
                        <Link to={`/stock/${s.symbol}`} className="block group">
                          <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {s.symbol}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 max-w-[260px]">
                            {s.name}
                            {s.sector && <span className="text-gray-400"> · {s.sector}</span>}
                          </div>
                        </Link>
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
                        {fmtNumber(s.div_yield)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Page <span className="font-semibold">{page}</span> of {data.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40 hover:border-indigo-400"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages || loading}
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
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4 lg:sticky lg:top-[80px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filters
        </h3>
        <button onClick={onClose} className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4 max-h-[70vh] lg:max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
        {/* Market Cap (Cr) */}
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

        {/* P/E */}
        <FilterGroup label="P/E Ratio">
          <RangeInputs
            min={filters.peMin}
            max={filters.peMax}
            onMin={(v) => updateFilter('peMin', v)}
            onMax={(v) => updateFilter('peMax', v)}
          />
        </FilterGroup>

        {/* Dividend Yield */}
        <FilterGroup label="Dividend Yield (%)">
          <RangeInputs
            min={filters.divYieldMin}
            max={filters.divYieldMax}
            onMin={(v) => updateFilter('divYieldMin', v)}
            onMax={(v) => updateFilter('divYieldMax', v)}
          />
        </FilterGroup>

        {/* ROE */}
        <FilterGroup label="ROE (%)">
          <RangeInputs
            min={filters.roeMin}
            max={filters.roeMax}
            onMin={(v) => updateFilter('roeMin', v)}
            onMax={(v) => updateFilter('roeMax', v)}
          />
        </FilterGroup>

        {/* Price */}
        <FilterGroup label="Price (₹)">
          <RangeInputs
            min={filters.priceMin}
            max={filters.priceMax}
            onMin={(v) => updateFilter('priceMin', v)}
            onMax={(v) => updateFilter('priceMax', v)}
          />
        </FilterGroup>

        {/* Today's Change */}
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

        {/* 52-week proximity */}
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

        {/* Sectors */}
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
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function RangeInputs({
  min, max, onMin, onMax, placeholderMin = 'Min', placeholderMax = 'Max',
}: {
  min: string; max: string;
  onMin: (v: string) => void; onMax: (v: string) => void;
  placeholderMin?: string; placeholderMax?: string;
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
