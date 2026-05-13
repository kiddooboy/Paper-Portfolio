import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import {
  ArrowUp, ArrowDown, X, Search, ChevronDown,
  TrendingUp, TrendingDown, Minus, Info, RefreshCw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type BSResult = { price: number; delta: number; gamma: number; theta: number; vega: number; iv: number };
type OptionData = BSResult & { oi: number; volume: number; bidPrice: number; askPrice: number };
type ChainRow  = { strike: number; CE: OptionData; PE: OptionData };

type ChainData = {
  symbol: string; spot: number; expiry: string; expiries: string[];
  atm: number; lotSize: number; pcr: number; maxPain: number; chain: ChainRow[];
};

type EligibleStock = { symbol: string; lotSize: number; isIndex: boolean };

type FoPosition = {
  id: number; symbol: string; instrument_type: string; strike_price: number;
  expiry_date: string; lot_size: number; quantity_lots: number; avg_buy_price: number;
  current_price: number; pnl: number; pnl_pct: number; total_quantity: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt   = (n: number, d = 2) => n.toFixed(d);
const fmtCr = (n: number) => {
  if (n >= 1e7)  return (n / 1e7).toFixed(1)  + 'Cr';
  if (n >= 1e5)  return (n / 1e5).toFixed(1)  + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('en-IN');
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

// ── OI background bar ──────────────────────────────────────────────────────
function OIBar({ value, max, side }: { value: number; max: number; side: 'CE' | 'PE' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="absolute inset-0 flex items-center pointer-events-none">
      <div
        className={cn('h-full opacity-[0.07]', side === 'CE' ? 'bg-red-500 ml-auto' : 'bg-green-500')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Trade Modal ────────────────────────────────────────────────────────────
function TradeModal({
  symbol, strike, type, lotSize, price, expiry, initialAction,
  onClose, onSuccess,
}: {
  symbol: string; strike: number; type: 'CE' | 'PE'; lotSize: number;
  price: number; expiry: string; initialAction: 'BUY' | 'SELL';
  onClose: () => void; onSuccess: () => void;
}) {
  const [action, setAction]   = useState<'BUY' | 'SELL'>(initialAction);
  const [lots, setLots]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const totalPremium          = price * lotSize * lots;

  const submit = async () => {
    setLoading(true); setError('');
    try {
      await axios.post('/api/fo/orders', {
        symbol, instrumentType: type, strikePrice: strike,
        expiryDate: expiry, lots, transactionType: action, price,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Order failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white dark:bg-groww-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-white">{symbol}</span>
              <span className={cn('px-2 py-0.5 rounded text-xs font-bold',
                type === 'CE'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              )}>
                {strike.toLocaleString('en-IN')} {type}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Expiry: {fmtDate(expiry)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* B / S toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {(['BUY', 'SELL'] as const).map(a => (
              <button key={a} onClick={() => setAction(a)}
                className={cn('flex-1 py-2.5 text-sm font-bold transition',
                  action === a
                    ? a === 'BUY' ? 'bg-groww-primary text-white' : 'bg-red-500 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                )}>
                {a}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">LTP</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">₹{fmt(price)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Lot Size</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{lotSize}</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Lots</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setLots(l => Math.max(1, l - 1))}
                className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-bold text-lg">−</button>
              <input type="number" min={1} max={50} value={lots}
                onChange={e => setLots(Math.min(50, Math.max(1, Number(e.target.value))))}
                className="flex-1 text-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-groww-primary" />
              <button onClick={() => setLots(l => Math.min(50, l + 1))}
                className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-bold text-lg">+</button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Premium</span>
            <span className="text-base font-bold text-gray-900 dark:text-white">
              ₹{totalPremium.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <button onClick={submit} disabled={loading}
            className={cn('w-full py-3 rounded-xl font-bold text-white transition active:scale-[0.98] disabled:opacity-50',
              action === 'BUY' ? 'bg-groww-primary hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            )}>
            {loading ? 'Placing…' : `${action} ${lots} Lot${lots > 1 ? 's' : ''}`}
          </button>
          <p className="text-[10px] text-gray-400 text-center">Paper trading only — no real money</p>
        </div>
      </div>
    </div>
  );
}

// ── Positions Panel ────────────────────────────────────────────────────────
function PositionsPanel({ positions }: { positions: FoPosition[] }) {
  if (!positions.length) return (
    <div className="text-center py-12 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
      <p className="text-2xl mb-2">📋</p>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No open F&O positions</p>
      <p className="text-xs text-gray-400 mt-1">Buy options from the chain to see them here</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {positions.map(pos => (
        <div key={pos.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">{pos.symbol}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                pos.instrument_type === 'CE'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              )}>
                {pos.strike_price?.toLocaleString('en-IN')} {pos.instrument_type}
              </span>
              <span className="text-[10px] text-gray-400">{fmtDate(pos.expiry_date)}</span>
            </div>
            <span className={cn('text-sm font-bold', pos.pnl >= 0 ? 'text-groww-primary' : 'text-red-500')}>
              {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{pos.quantity_lots} lot{pos.quantity_lots > 1 ? 's' : ''} · Avg ₹{fmt(pos.avg_buy_price)} · LTP ₹{fmt(pos.current_price)}</span>
            <span className={pos.pnl >= 0 ? 'text-groww-primary' : 'text-red-500'}>
              {pos.pnl >= 0 ? '+' : ''}{fmt(pos.pnl_pct)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Chain Row ──────────────────────────────────────────────────────────────
function ChainRowItem({
  row, atm, maxCallOI, maxPutOI, onTrade,
}: {
  row: ChainRow; atm: number; maxCallOI: number; maxPutOI: number;
  onTrade: (strike: number, type: 'CE' | 'PE', price: number, action: 'BUY' | 'SELL') => void;
}) {
  const isATM  = row.strike === atm;
  const ceITM  = row.strike < atm;
  const peITM  = row.strike > atm;

  // Row-level tint: ITM = subtle tint, ATM = amber
  const rowCls = isATM
    ? 'bg-amber-50 dark:bg-amber-950/40'
    : ceITM
    ? 'bg-red-50/30 dark:bg-red-950/10'
    : peITM
    ? 'bg-green-50/30 dark:bg-green-950/10'
    : '';

  return (
    <tr className={cn('group border-b border-gray-100 dark:border-gray-800/50 text-xs transition-colors', rowCls)}>

      {/* ── CALL side ── */}
      {/* OI (with bar) */}
      <td className="px-2 py-2.5 text-right relative">
        <OIBar value={row.CE.oi} max={maxCallOI} side="CE" />
        <span className="relative text-gray-600 dark:text-gray-400">{fmtCr(row.CE.oi)}</span>
      </td>
      {/* Volume */}
      <td className="px-2 py-2.5 text-right text-gray-500 dark:text-gray-500">{fmtCr(row.CE.volume)}</td>
      {/* IV */}
      <td className="px-2 py-2.5 text-right text-gray-500 dark:text-gray-500">{fmt(row.CE.iv * 100, 1)}%</td>
      {/* Delta */}
      <td className="px-2 py-2.5 text-right text-gray-500 dark:text-gray-500">{fmt(row.CE.delta, 2)}</td>
      {/* CE LTP + B/S */}
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* B/S buttons — always visible */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onTrade(row.strike, 'CE', row.CE.price, 'BUY')}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-groww-primary/10 text-groww-primary hover:bg-groww-primary hover:text-white transition"
            >B</button>
            <button
              onClick={() => onTrade(row.strike, 'CE', row.CE.price, 'SELL')}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition"
            >S</button>
          </div>
          <span className={cn('font-semibold tabular-nums', ceITM ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200')}>
            ₹{fmt(row.CE.price)}
          </span>
        </div>
      </td>

      {/* ── Strike ── */}
      <td className={cn(
        'px-3 py-2.5 text-center font-bold text-sm relative',
        isATM
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-gray-700 dark:text-gray-300'
      )}>
        {isATM && (
          <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[8px] font-extrabold text-amber-500 leading-none tracking-wide">
            ATM
          </span>
        )}
        {row.strike.toLocaleString('en-IN')}
      </td>

      {/* ── PUT side ── */}
      {/* PE LTP + B/S */}
      <td className="px-2 py-2.5 text-left">
        <div className="flex items-center gap-1">
          <span className={cn('font-semibold tabular-nums', peITM ? 'text-groww-primary dark:text-green-400' : 'text-gray-800 dark:text-gray-200')}>
            ₹{fmt(row.PE.price)}
          </span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onTrade(row.strike, 'PE', row.PE.price, 'BUY')}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-groww-primary/10 text-groww-primary hover:bg-groww-primary hover:text-white transition"
            >B</button>
            <button
              onClick={() => onTrade(row.strike, 'PE', row.PE.price, 'SELL')}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition"
            >S</button>
          </div>
        </div>
      </td>
      {/* Delta */}
      <td className="px-2 py-2.5 text-left text-gray-500 dark:text-gray-500">{fmt(row.PE.delta, 2)}</td>
      {/* IV */}
      <td className="px-2 py-2.5 text-left text-gray-500 dark:text-gray-500">{fmt(row.PE.iv * 100, 1)}%</td>
      {/* Volume */}
      <td className="px-2 py-2.5 text-left text-gray-500 dark:text-gray-500">{fmtCr(row.PE.volume)}</td>
      {/* OI (with bar) */}
      <td className="px-2 py-2.5 text-left relative">
        <OIBar value={row.PE.oi} max={maxPutOI} side="PE" />
        <span className="relative text-gray-600 dark:text-gray-400">{fmtCr(row.PE.oi)}</span>
      </td>
    </tr>
  );
}

// ── Symbol Search ──────────────────────────────────────────────────────────
function SymbolSearch({
  eligible, value, onChange,
}: {
  eligible: EligibleStock[]; value: string; onChange: (s: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = query.length >= 1
    ? eligible.filter(e => e.symbol.includes(query.toUpperCase())).slice(0, 12)
    : eligible.filter(e => e.isIndex);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-bold text-gray-900 dark:text-white hover:border-groww-primary transition min-w-[150px]"
      >
        <span className="flex-1 text-left">{value || 'Select Symbol'}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
                placeholder="Search NIFTY, RELIANCE…"
              />
            </div>
          </div>
          {!query && (
            <p className="px-4 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">Indices</p>
          )}
          <div className="max-h-64 overflow-y-auto">
            {filtered.map(e => (
              <button key={e.symbol}
                onClick={() => { onChange(e.symbol); setOpen(false); setQuery(''); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span className="font-semibold text-gray-900 dark:text-white">{e.symbol}</span>
                <span className="text-[10px] text-gray-400">Lot {e.lotSize}</span>
              </button>
            ))}
            {!filtered.length && <p className="text-xs text-gray-400 text-center py-4">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
const REFRESH_INTERVAL = 30_000; // 30 s live refresh

export default function OptionsPage() {
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();

  const [eligible, setEligible]       = useState<EligibleStock[]>([]);
  const [symbol, setSymbol]           = useState(routeSymbol?.toUpperCase() || 'NIFTY');
  const [chainData, setChainData]     = useState<ChainData | null>(null);
  const [selectedExpiry, setExpiry]   = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<'chain' | 'positions'>('chain');
  const [positions, setPositions]     = useState<FoPosition[]>([]);
  const [strikeFilter, setStrikeFilter] = useState<5 | 10 | 15 | 20>(10);
  const [tradeModal, setTradeModal]   = useState<{
    strike: number; type: 'CE' | 'PE'; price: number; action: 'BUY' | 'SELL';
  } | null>(null);

  // Refs to avoid stale closures in interval
  const symbolRef  = useRef(symbol);
  const expiryRef  = useRef(selectedExpiry);
  const filterRef  = useRef(strikeFilter);
  symbolRef.current  = symbol;
  expiryRef.current  = selectedExpiry;
  filterRef.current  = strikeFilter;

  useEffect(() => { axios.get('/api/fo/eligible').then(r => setEligible(r.data)); }, []);

  const fetchChain = useCallback(async (sym: string, expiry?: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const params: any = { strikes: filterRef.current };
      if (expiry) params.expiry = expiry;
      const res = await axios.get(`/api/fo/chain/${sym}`, { params });
      setChainData(res.data);
      setExpiry(res.data.expiry);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (!silent) setError(e.response?.data?.error || e.message || 'Failed to load chain');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + symbol / filter change
  useEffect(() => { fetchChain(symbol); }, [symbol, strikeFilter]);

  // 30-second live refresh
  useEffect(() => {
    const id = setInterval(() => {
      fetchChain(symbolRef.current, expiryRef.current || undefined, true);
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchChain]);

  // Positions
  const loadPositions = useCallback(() => {
    axios.get('/api/fo/positions').then(r => setPositions(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadPositions(); }, []);

  const handleSymbolChange = (s: string) => {
    setSymbol(s); setExpiry('');
    navigate(`/options/${s}`, { replace: true });
  };

  const handleExpiryChange = (e: string) => fetchChain(symbol, e);

  const maxCallOI = chainData ? Math.max(...chainData.chain.map(r => r.CE.oi)) : 1;
  const maxPutOI  = chainData ? Math.max(...chainData.chain.map(r => r.PE.oi)) : 1;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark pb-8">

      {/* ── Sticky top bar ── */}
      <div className="bg-white dark:bg-groww-card border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <SymbolSearch eligible={eligible} value={symbol} onChange={handleSymbolChange} />

          {/* Spot price */}
          {chainData && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                ₹{chainData.spot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Expiry tabs */}
          {chainData && (
            <div className="flex gap-1 flex-wrap">
              {chainData.expiries.map(e => (
                <button key={e} onClick={() => handleExpiryChange(e)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                    selectedExpiry === e
                      ? 'bg-groww-primary text-white'
                      : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary bg-white dark:bg-groww-card'
                  )}>
                  {fmtDate(e)}
                </button>
              ))}
            </div>
          )}

          {/* Live refresh indicator */}
          <div className="ml-auto flex items-center gap-2">
            {refreshing && <RefreshCw className="w-3.5 h-3.5 text-groww-primary animate-spin" />}
            {lastUpdated && !refreshing && (
              <span className="text-[10px] text-gray-400">
                Live · {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => fetchChain(symbol, selectedExpiry || undefined, true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-400 hover:text-groww-primary"
              title="Refresh now"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-4">

        {/* ── Stats row ── */}
        {chainData && (
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              { label: 'PCR',        value: chainData.pcr.toFixed(2),                    icon: chainData.pcr >= 1 ? <TrendingUp className="w-3 h-3 text-groww-primary" /> : <TrendingDown className="w-3 h-3 text-red-500" />, color: chainData.pcr >= 1 ? 'text-groww-primary' : 'text-red-500' },
              { label: 'Max Pain',   value: chainData.maxPain.toLocaleString('en-IN'),   icon: <Minus className="w-3 h-3 text-amber-500" />,                                                                                     color: 'text-amber-600 dark:text-amber-400' },
              { label: 'ATM Strike', value: chainData.atm.toLocaleString('en-IN'),       icon: <Info className="w-3 h-3 text-blue-500" />,                                                                                       color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Lot Size',   value: chainData.lotSize.toLocaleString('en-IN'),   icon: null,                                                                                                                              color: 'text-gray-700 dark:text-gray-300' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                {s.icon}
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</span>
                <span className={cn('text-sm font-bold', s.color)}>{s.value}</span>
              </div>
            ))}

            {/* Strikes filter */}
            <div className="flex items-center gap-1 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-1.5 ml-auto">
              <span className="text-[10px] text-gray-400 mr-1">Strikes ±</span>
              {([5, 10, 15, 20] as const).map(n => (
                <button key={n} onClick={() => setStrikeFilter(n)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-semibold transition',
                    strikeFilter === n ? 'bg-groww-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800">
          {(['chain', 'positions'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2 text-sm font-semibold border-b-2 transition -mb-px',
                activeTab === tab
                  ? 'border-groww-primary text-groww-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}>
              {tab === 'chain' ? 'Option Chain' : `Positions${positions.length ? ` (${positions.length})` : ''}`}
            </button>
          ))}
        </div>

        {activeTab === 'positions' && <PositionsPanel positions={positions} />}

        {activeTab === 'chain' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-16 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
                <p className="text-3xl mb-3">⚠️</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1">Could not load option chain</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{error}</p>
                <button onClick={() => fetchChain(symbol, selectedExpiry || undefined)}
                  className="px-4 py-2 bg-groww-primary text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition">
                  Retry
                </button>
              </div>
            ) : chainData ? (
              <>
                {/* Legend */}
                <div className="flex items-center gap-4 mb-2 text-[10px] text-gray-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded bg-red-400/20 border border-red-300 dark:border-red-700" />
                    ITM Calls
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded bg-green-500/20 border border-green-300 dark:border-green-700" />
                    ITM Puts
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded bg-amber-300/40 dark:bg-amber-700/30 border border-amber-400 dark:border-amber-600" />
                    ATM
                  </span>
                  <span className="ml-auto text-gray-400 italic">Hover row → B/S to trade</span>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto shadow-sm">
                  <table className="w-full min-w-[760px] text-xs border-collapse">
                    <thead>
                      <tr>
                        <th colSpan={5} className="py-2.5 text-center text-xs font-bold tracking-wider text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                          CALLS
                        </th>
                        <th className="py-2.5 bg-gray-100 dark:bg-gray-800/60" />
                        <th colSpan={5} className="py-2.5 text-center text-xs font-bold tracking-wider text-groww-primary bg-green-50 dark:bg-green-950/30">
                          PUTS
                        </th>
                      </tr>
                      <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        <th className="px-2 py-2 text-right">OI</th>
                        <th className="px-2 py-2 text-right">Vol</th>
                        <th className="px-2 py-2 text-right">IV</th>
                        <th className="px-2 py-2 text-right">Δ</th>
                        <th className="px-3 py-2 text-right">LTP</th>
                        <th className="px-3 py-2 text-center font-bold text-gray-700 dark:text-gray-200">STRIKE</th>
                        <th className="px-3 py-2 text-left">LTP</th>
                        <th className="px-2 py-2 text-left">Δ</th>
                        <th className="px-2 py-2 text-left">IV</th>
                        <th className="px-2 py-2 text-left">Vol</th>
                        <th className="px-2 py-2 text-left">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainData.chain.map(row => (
                        <ChainRowItem
                          key={row.strike}
                          row={row}
                          atm={chainData.atm}
                          maxCallOI={maxCallOI}
                          maxPutOI={maxPutOI}
                          onTrade={(strike, type, price, action) => setTradeModal({ strike, type, price, action })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Greeks quick reference */}
                <div className="mt-4 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Greeks Reference</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {[
                      { key: 'Delta (Δ)', desc: '₹ change per ₹1 move in underlying' },
                      { key: 'Gamma (Γ)', desc: 'Rate of change of delta' },
                      { key: 'Theta (Θ)', desc: 'Time decay per day (negative for buyers)' },
                      { key: 'Vega (ν)',  desc: 'Price change per 1% change in IV' },
                    ].map(g => (
                      <div key={g.key} className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2.5">
                        <p className="font-bold text-gray-800 dark:text-gray-200 mb-0.5">{g.key}</p>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{g.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Trade Modal */}
      {tradeModal && chainData && (
        <TradeModal
          symbol={symbol}
          strike={tradeModal.strike}
          type={tradeModal.type}
          lotSize={chainData.lotSize}
          price={tradeModal.price}
          expiry={selectedExpiry}
          initialAction={tradeModal.action}
          onClose={() => setTradeModal(null)}
          onSuccess={loadPositions}
        />
      )}
    </div>
  );
}
