import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import { ArrowUp, ArrowDown, X, Search, ChevronDown, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type BSResult = { price: number; delta: number; gamma: number; theta: number; vega: number; iv: number };
type OptionData = BSResult & { oi: number; volume: number; bidPrice: number; askPrice: number };
type ChainRow = { strike: number; CE: OptionData; PE: OptionData };

type ChainData = {
  symbol: string;
  spot: number;
  expiry: string;
  expiries: string[];
  atm: number;
  lotSize: number;
  pcr: number;
  maxPain: number;
  chain: ChainRow[];
};

type EligibleStock = { symbol: string; lotSize: number; isIndex: boolean };
type FoPosition = {
  id: number; symbol: string; instrument_type: string; strike_price: number;
  expiry_date: string; lot_size: number; quantity_lots: number; avg_buy_price: number;
  current_price: number; pnl: number; pnl_pct: number; total_quantity: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 2) => n.toFixed(dec);
const fmtCr = (n: number) => {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('en-IN');
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

// OI bar visual: width as % of max OI across all strikes
function OIBar({ value, max, side }: { value: number; max: number; side: 'CE' | 'PE' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="absolute inset-y-0 w-full flex items-center">
      <div
        className={cn(
          'h-[3px] rounded-full opacity-40',
          side === 'CE' ? 'bg-red-400' : 'bg-green-500',
          side === 'CE' ? 'ml-auto' : 'mr-auto'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Trade Modal ────────────────────────────────────────────────────────────
function TradeModal({
  symbol, strike, type, lotSize, price, expiry,
  onClose, onSuccess,
}: {
  symbol: string; strike: number; type: 'CE' | 'PE'; lotSize: number;
  price: number; expiry: string; onClose: () => void; onSuccess: () => void;
}) {
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [lots, setLots] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPremium = price * lotSize * lots;

  const submit = async () => {
    setLoading(true); setError('');
    try {
      await axios.post('/api/fo/orders', {
        symbol,
        instrumentType: type,
        strikePrice: strike,
        expiryDate: expiry,
        lots,
        transactionType: action,
        price,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white dark:bg-groww-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-white">{symbol}</span>
              <span className={cn('px-2 py-0.5 rounded text-xs font-bold', type === 'CE' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400')}>
                {strike} {type}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Expiry: {formatDate(expiry)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Buy / Sell toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {(['BUY', 'SELL'] as const).map(a => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-bold transition',
                  action === a
                    ? a === 'BUY' ? 'bg-groww-primary text-white' : 'bg-red-500 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                )}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Premium & Lot info */}
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

          {/* Lots input */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Lots</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLots(l => Math.max(1, l - 1))}
                className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-bold text-lg"
              >−</button>
              <input
                type="number"
                min={1} max={50}
                value={lots}
                onChange={e => setLots(Math.min(50, Math.max(1, Number(e.target.value))))}
                className="flex-1 text-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-groww-primary"
              />
              <button
                onClick={() => setLots(l => Math.min(50, l + 1))}
                className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-bold text-lg"
              >+</button>
            </div>
          </div>

          {/* Total */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Premium</span>
            <span className="text-base font-bold text-gray-900 dark:text-white">₹{totalPremium.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className={cn(
              'w-full py-3 rounded-xl font-bold text-white transition active:scale-[0.98] disabled:opacity-50',
              action === 'BUY' ? 'bg-groww-primary hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            )}
          >
            {loading ? 'Placing Order…' : `${action} ${lots} Lot${lots > 1 ? 's' : ''}`}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Paper trading only — no real money involved
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Positions Panel ────────────────────────────────────────────────────────
function PositionsPanel({ positions }: { positions: FoPosition[] }) {
  if (!positions.length) return (
    <div className="text-center py-8 text-sm text-gray-400">No open F&O positions</div>
  );

  return (
    <div className="space-y-2">
      {positions.map(pos => (
        <div key={pos.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">{pos.symbol}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                pos.instrument_type === 'CE' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              )}>
                {pos.strike_price} {pos.instrument_type}
              </span>
              <span className="text-[10px] text-gray-400">{formatDate(pos.expiry_date)}</span>
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
  onTrade: (strike: number, type: 'CE' | 'PE', price: number) => void;
}) {
  const isATM = row.strike === atm;
  const ceITM = row.strike < atm;
  const peITM = row.strike > atm;

  return (
    <tr
      className={cn(
        'group border-b border-gray-100 dark:border-gray-800/60 text-xs transition',
        isATM ? 'bg-amber-50/80 dark:bg-amber-900/10' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/30'
      )}
    >
      {/* ── CALL side ── */}
      <td className={cn('px-2 py-2 text-right relative', ceITM ? 'bg-red-50/40 dark:bg-red-900/5' : '')}>
        <OIBar value={row.CE.oi} max={maxCallOI} side="CE" />
        <span className="relative z-10">{fmtCr(row.CE.oi)}</span>
      </td>
      <td className="px-2 py-2 text-right text-gray-500">{fmtCr(row.CE.volume)}</td>
      <td className="px-2 py-2 text-right text-gray-500">{fmt(row.CE.iv * 100, 1)}%</td>
      <td className="px-2 py-2 text-right text-gray-500">{fmt(row.CE.delta, 2)}</td>
      <td
        className={cn(
          'px-3 py-2 text-right font-semibold cursor-pointer transition',
          ceITM ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200',
          'group-hover:text-red-500'
        )}
        onClick={() => onTrade(row.strike, 'CE', row.CE.price)}
      >
        <span className="relative z-10">₹{fmt(row.CE.price)}</span>
      </td>

      {/* ── Strike ── */}
      <td className={cn(
        'px-3 py-2 text-center font-bold sticky left-0 z-10',
        isATM
          ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
          : 'text-gray-800 dark:text-gray-200 bg-white dark:bg-groww-bg'
      )}>
        {isATM && <span className="absolute -top-0 left-1/2 -translate-x-1/2 text-[8px] font-bold text-amber-500 leading-none">ATM</span>}
        {row.strike.toLocaleString('en-IN')}
      </td>

      {/* ── PUT side ── */}
      <td
        className={cn(
          'px-3 py-2 text-left font-semibold cursor-pointer transition',
          peITM ? 'text-groww-primary dark:text-green-400' : 'text-gray-800 dark:text-gray-200',
          'group-hover:text-groww-primary'
        )}
        onClick={() => onTrade(row.strike, 'PE', row.PE.price)}
      >
        ₹{fmt(row.PE.price)}
      </td>
      <td className="px-2 py-2 text-left text-gray-500">{fmt(row.PE.delta, 2)}</td>
      <td className="px-2 py-2 text-left text-gray-500">{fmt(row.PE.iv * 100, 1)}%</td>
      <td className="px-2 py-2 text-left text-gray-500">{fmtCr(row.PE.volume)}</td>
      <td className={cn('px-2 py-2 text-left relative', peITM ? 'bg-green-50/40 dark:bg-green-900/5' : '')}>
        <OIBar value={row.PE.oi} max={maxPutOI} side="PE" />
        <span className="relative z-10">{fmtCr(row.PE.oi)}</span>
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
  const [open, setOpen] = useState(false);

  const filtered = query.length >= 1
    ? eligible.filter(e => e.symbol.includes(query.toUpperCase())).slice(0, 12)
    : eligible.filter(e => e.isIndex).slice(0, 6);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-groww-card text-sm font-bold text-gray-900 dark:text-white hover:border-groww-primary transition min-w-[140px]"
      >
        <span>{value || 'Select Symbol'}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                autoFocus
                className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
                placeholder="Search symbol…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          {query === '' && (
            <div className="px-3 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Indices</p>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filtered.map(e => (
              <button
                key={e.symbol}
                onClick={() => { onChange(e.symbol); setOpen(false); setQuery(''); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span className="font-semibold text-gray-900 dark:text-white">{e.symbol}</span>
                <span className="text-[10px] text-gray-400">Lot: {e.lotSize}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function OptionsPage() {
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const [eligible, setEligible] = useState<EligibleStock[]>([]);
  const [symbol, setSymbol] = useState(routeSymbol?.toUpperCase() || 'NIFTY');
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chain' | 'positions'>('chain');
  const [positions, setPositions] = useState<FoPosition[]>([]);
  const [tradeModal, setTradeModal] = useState<{ strike: number; type: 'CE' | 'PE'; price: number } | null>(null);
  const [strikeFilter, setStrikeFilter] = useState<5 | 10 | 15 | 20>(10);

  useEffect(() => {
    axios.get('/api/fo/eligible').then(r => setEligible(r.data));
  }, []);

  const fetchChain = useCallback(async (sym: string, expiry?: string) => {
    setLoading(true);
    try {
      const params: any = { strikes: strikeFilter };
      if (expiry) params.expiry = expiry;
      const res = await axios.get(`/api/fo/chain/${sym}`, { params });
      setChainData(res.data);
      setSelectedExpiry(res.data.expiry);
    } catch (e: any) {
      console.error('Chain fetch failed', e.message);
    } finally {
      setLoading(false);
    }
  }, [strikeFilter]);

  useEffect(() => {
    fetchChain(symbol);
  }, [symbol, strikeFilter]);

  useEffect(() => {
    axios.get('/api/fo/positions').then(r => setPositions(r.data)).catch(() => {});
  }, []);

  const handleSymbolChange = (s: string) => {
    setSymbol(s);
    setSelectedExpiry('');
    navigate(`/options/${s}`, { replace: true });
  };

  const handleExpiryChange = (e: string) => {
    setSelectedExpiry(e);
    fetchChain(symbol, e);
  };

  const maxCallOI = chainData ? Math.max(...chainData.chain.map(r => r.CE.oi)) : 1;
  const maxPutOI  = chainData ? Math.max(...chainData.chain.map(r => r.PE.oi)) : 1;

  const priceChange = chainData ? chainData.spot - (chainData.spot / 1.005) : 0; // approximate

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark pb-8">
      {/* ── Top bar ── */}
      <div className="bg-white dark:bg-groww-card border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Symbol picker */}
          <SymbolSearch eligible={eligible} value={symbol} onChange={handleSymbolChange} />

          {/* Spot price */}
          {chainData && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                ₹{chainData.spot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className={cn('flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded',
                priceChange >= 0 ? 'text-groww-primary bg-green-50 dark:bg-green-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
              )}>
                {priceChange >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(priceChange).toFixed(2)}
              </span>
            </div>
          )}

          {/* Expiry tabs */}
          {chainData && (
            <div className="flex gap-1 ml-auto flex-wrap">
              {chainData.expiries.map(e => (
                <button
                  key={e}
                  onClick={() => handleExpiryChange(e)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                    selectedExpiry === e
                      ? 'bg-groww-primary text-white'
                      : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary bg-white dark:bg-groww-card'
                  )}
                >
                  {formatDate(e)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-4">
        {/* ── Stats row ── */}
        {chainData && (
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              { label: 'PCR', value: chainData.pcr.toFixed(2), icon: chainData.pcr >= 1 ? <TrendingUp className="w-3 h-3 text-groww-primary" /> : <TrendingDown className="w-3 h-3 text-red-500" />, color: chainData.pcr >= 1 ? 'text-groww-primary' : 'text-red-500' },
              { label: 'Max Pain', value: chainData.maxPain.toLocaleString('en-IN'), icon: <Minus className="w-3 h-3 text-amber-500" />, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'ATM Strike', value: chainData.atm.toLocaleString('en-IN'), icon: <Info className="w-3 h-3 text-blue-500" />, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Lot Size', value: chainData.lotSize.toLocaleString('en-IN'), icon: null, color: 'text-gray-700 dark:text-gray-300' },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-2 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                {stat.icon}
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{stat.label}</span>
                <span className={cn('text-sm font-bold', stat.color)}>{stat.value}</span>
              </div>
            ))}

            {/* Strike count filter */}
            <div className="flex items-center gap-1 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-1.5 ml-auto">
              <span className="text-[10px] text-gray-400 mr-1">Strikes ±</span>
              {([5, 10, 15, 20] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setStrikeFilter(n)}
                  className={cn(
                    'px-2 py-1 rounded-lg text-xs font-semibold transition',
                    strikeFilter === n ? 'bg-groww-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800">
          {(['chain', 'positions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-semibold border-b-2 transition -mb-px',
                activeTab === tab
                  ? 'border-groww-primary text-groww-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {tab === 'chain' ? 'Option Chain' : `Positions ${positions.length > 0 ? `(${positions.length})` : ''}`}
            </button>
          ))}
        </div>

        {activeTab === 'positions' && (
          <PositionsPanel positions={positions} />
        )}

        {activeTab === 'chain' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chainData ? (
              <>
                {/* ── Legend ── */}
                <div className="flex items-center gap-4 mb-2 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1"><span className="w-3 h-1 bg-red-400 rounded inline-block opacity-60" /> Call OI bar</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-1 bg-green-500 rounded inline-block opacity-60" /> Put OI bar</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-3 bg-amber-100 dark:bg-amber-900/20 rounded inline-block border border-amber-200 dark:border-amber-800" /> ATM strike</span>
                  <span className="flex items-center gap-1 ml-auto italic text-gray-400">Click LTP to trade</span>
                </div>

                {/* ── Option Chain Table ── */}
                <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto shadow-sm">
                  <table className="w-full min-w-[700px] text-xs">
                    <colgroup>
                      <col className="w-16" />{/* CE OI */}
                      <col className="w-14" />{/* CE Vol */}
                      <col className="w-12" />{/* CE IV */}
                      <col className="w-12" />{/* CE Δ */}
                      <col className="w-20" />{/* CE LTP */}
                      <col className="w-20" />{/* Strike */}
                      <col className="w-20" />{/* PE LTP */}
                      <col className="w-12" />{/* PE Δ */}
                      <col className="w-12" />{/* PE IV */}
                      <col className="w-14" />{/* PE Vol */}
                      <col className="w-16" />{/* PE OI */}
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                        {/* CALLS header */}
                        <th colSpan={5} className="py-2.5 text-center text-red-500 dark:text-red-400 font-bold text-xs tracking-wider bg-red-50/50 dark:bg-red-900/5">
                          CALLS
                        </th>
                        <th className="py-2.5 text-center bg-gray-50 dark:bg-gray-800/40" />
                        {/* PUTS header */}
                        <th colSpan={5} className="py-2.5 text-center text-groww-primary font-bold text-xs tracking-wider bg-green-50/50 dark:bg-green-900/5">
                          PUTS
                        </th>
                      </tr>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                        <th className="px-2 py-2 text-right font-semibold text-gray-500">OI</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-500">Vol</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-500">IV</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-500">Δ</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">LTP</th>
                        <th className="px-3 py-2 text-center font-bold text-gray-700 dark:text-gray-300">Strike</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">LTP</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-500">Δ</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-500">IV</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-500">Vol</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-500">OI</th>
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
                          onTrade={(strike, type, price) => setTradeModal({ strike, type, price })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Greeks explanation ── */}
                <div className="mt-4 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Option Greeks</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {[
                      { key: 'Delta (Δ)', desc: 'Price change per ₹1 move in underlying' },
                      { key: 'Gamma (Γ)', desc: 'Rate of change of delta' },
                      { key: 'Theta (Θ)', desc: 'Time decay per day (negative for buyers)' },
                      { key: 'Vega (ν)', desc: 'Price change per 1% change in IV' },
                    ].map(g => (
                      <div key={g.key} className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2.5">
                        <p className="font-bold text-gray-800 dark:text-gray-200 mb-0.5">{g.key}</p>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{g.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-400">Select a symbol to view the option chain</div>
            )}
          </>
        )}
      </div>

      {/* ── Trade Modal ── */}
      {tradeModal && chainData && (
        <TradeModal
          symbol={symbol}
          strike={tradeModal.strike}
          type={tradeModal.type}
          lotSize={chainData.lotSize}
          price={tradeModal.price}
          expiry={selectedExpiry}
          onClose={() => setTradeModal(null)}
          onSuccess={() => {
            axios.get('/api/fo/positions').then(r => setPositions(r.data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
