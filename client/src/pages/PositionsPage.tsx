import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';
import StockLogo from '../components/StockLogo';
import DatePicker from '../components/DatePicker';
import { TrendingUp, TrendingDown, ArrowUpRight, Search, ArrowDownUp } from 'lucide-react';

type SortKey = 'symbol' | 'qty' | 'invested' | 'avg' | 'current' | 'pnl' | 'pnl_pct' | 'day_change';
type SortDir = 'asc' | 'desc';

type MisShort = {
  id: number;
  symbol: string;
  quantity: number;
  avg_entry_price: number;
  margin_blocked: number;
  opened_at: string;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
};

type DayPosition = {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'CLOSED';
  status: 'OPEN' | 'CLOSED';
  quantity: number;
  avg_entry_price: number;
  avg_exit_price?: number;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
  realized_pnl?: number;
  realized_pnl_pct?: number;
  product_type: 'CNC' | 'MIS';
  opened_at: string;
  closed_at?: string;
};

export default function PositionsPage() {
  const [activeTab, setActiveTab] = useState<'holdings' | 'day'>('holdings');
  const [holdings, setHoldings] = useState<any[]>([]);
  const [misShorts, setMisShorts] = useState<MisShort[]>([]);
  const [dayPositions, setDayPositions] = useState<DayPosition[]>([]);
  const [dayDate, setDayDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('pnl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const allQuotes = useMarketStore((s) => s.quotes);

  useEffect(() => {
    let cancelled = false;
    async function fetchPositions() {
      try {
        const [portfolioRes, shortsRes, dayRes] = await Promise.all([
          axios.get('/api/portfolio'),
          axios.get('/api/orders/mis-shorts'),
          axios.get('/api/orders/day-positions'),
        ]);
        if (cancelled) return;
        setHoldings(portfolioRes.data.holdings || []);
        setMisShorts(shortsRes.data || []);
        setDayPositions(dayRes.data?.positions || []);
        setDayDate(dayRes.data?.date || '');
      } catch (error) {
        console.error('Error fetching positions:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPositions();
    // Refresh day positions every 15s so new buys / live P&L appear without
    // a manual reload.
    const id = setInterval(async () => {
      try {
        const [dayRes, shortsRes] = await Promise.all([
          axios.get('/api/orders/day-positions'),
          axios.get('/api/orders/mis-shorts'),
        ]);
        if (cancelled) return;
        setDayPositions(dayRes.data?.positions || []);
        setMisShorts(shortsRes.data || []);
        setDayDate(dayRes.data?.date || '');
      } catch {}
    }, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Enrich holdings with live market data
  const enrichedPositions = useMemo(() => {
    return holdings.map((h: any) => {
      const liveQ = allQuotes[h.symbol];
      const quantity = Number(h.quantity) || 0;
      const avgPrice = Number(h.avg_buy_price) || 0;
      const currentPrice = Number(liveQ?.price) || Number(h.current_price) || 0;
      const dayChange = Number(liveQ?.change_percent) || 0;
      const invested = quantity * avgPrice;
      const currentValue = quantity * currentPrice;
      const pnl = currentValue - invested;
      const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

      return {
        ...h,
        currentPrice,
        dayChange,
        invested,
        currentValue,
        pnl,
        pnlPercent,
      };
    });
  }, [holdings, allQuotes]);

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let filtered = enrichedPositions;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((p: any) =>
        p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply P&L filter
    if (filter === 'profit') {
      filtered = filtered.filter((p: any) => p.pnl > 0);
    } else if (filter === 'loss') {
      filtered = filtered.filter((p: any) => p.pnl < 0);
    }

    // Sort
    filtered.sort((a: any, b: any) => {
      let valA, valB;
      switch (sortKey) {
        case 'symbol':
          valA = a.symbol;
          valB = b.symbol;
          break;
        case 'qty':
          valA = a.quantity;
          valB = b.quantity;
          break;
        case 'invested':
          valA = a.invested;
          valB = b.invested;
          break;
        case 'avg':
          valA = a.average_price;
          valB = b.average_price;
          break;
        case 'current':
          valA = a.currentPrice;
          valB = b.currentPrice;
          break;
        case 'pnl':
          valA = a.pnl;
          valB = b.pnl;
          break;
        case 'pnl_pct':
          valA = a.pnlPercent;
          valB = b.pnlPercent;
          break;
        case 'day_change':
          valA = a.dayChange;
          valB = b.dayChange;
          break;
        default:
          valA = a.pnl;
          valB = b.pnl;
      }
      if (sortDir === 'asc') {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });

    return filtered;
  }, [enrichedPositions, searchQuery, filter, sortKey, sortDir]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredPositions.reduce(
      (acc, p: any) => ({
        invested: acc.invested + (Number(p.invested) || 0),
        currentValue: acc.currentValue + (Number(p.currentValue) || 0),
        pnl: acc.pnl + (Number(p.pnl) || 0),
      }),
      { invested: 0, currentValue: 0, pnl: 0 }
    );
  }, [filteredPositions]);

  const totalPnlPercent = totals.invested > 0 ? (totals.pnl / totals.invested) * 100 : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading positions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('holdings')}
          className={cn(
            'px-4 py-1.5 text-sm font-semibold rounded-lg transition',
            activeTab === 'holdings'
              ? 'bg-white dark:bg-groww-card shadow text-gray-900 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          Holdings
        </button>
        <button
          onClick={() => setActiveTab('day')}
          className={cn(
            'px-4 py-1.5 text-sm font-semibold rounded-lg transition flex items-center gap-1.5',
            activeTab === 'day'
              ? 'bg-white dark:bg-groww-card shadow text-gray-900 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
          Day Positions
          {misShorts.length > 0 && (
            <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full">
              {misShorts.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'day' ? (
        <DayPositionsPanel
          dayPositions={dayPositions}
          misShorts={misShorts}
          dayDate={dayDate}
          liveQuotes={allQuotes}
        />
      ) : (
      <>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Holdings</h1>
          <p className="text-sm text-gray-500">Track your current holdings</p>
        </div>
        <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} maxDate={new Date()} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium text-gray-500">Invested</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.invested)}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <ArrowUpRight className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-sm font-medium text-gray-500">Current Value</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.currentValue)}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('p-2 rounded-lg', totals.pnl >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30')}>
              {totals.pnl >= 0 ? <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />}
            </div>
            <span className="text-sm font-medium text-gray-500">Total P&L</span>
          </div>
          <p className={cn('text-2xl font-bold', totals.pnl >= 0 ? 'text-green-600' : 'text-red-500')}>
            {totals.pnl >= 0 ? '+' : ''}{formatCurrency(totals.pnl)}
          </p>
          <p className={cn('text-sm', totals.pnl >= 0 ? 'text-green-600' : 'text-red-500')}>
            ({totalPnlPercent >= 0 ? '+' : ''}{formatPercent(totalPnlPercent)})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={cn('px-4 py-2 rounded-lg font-medium transition', filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')}
          >
            All
          </button>
          <button
            onClick={() => setFilter('profit')}
            className={cn('px-4 py-2 rounded-lg font-medium transition', filter === 'profit' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')}
          >
            Profit
          </button>
          <button
            onClick={() => setFilter('loss')}
            className={cn('px-4 py-2 rounded-lg font-medium transition', filter === 'loss' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')}
          >
            Loss
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('qty')}>
                  Qty {sortKey === 'qty' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('invested')}>
                  Invested {sortKey === 'invested' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('current')}>
                  Current {sortKey === 'current' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('pnl')}>
                  P&L {sortKey === 'pnl' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('pnl_pct')}>
                  P&L % {sortKey === 'pnl_pct' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('day_change')}>
                  Day % {sortKey === 'day_change' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No positions found
                  </td>
                </tr>
              ) : (
                filteredPositions.map((position: any) => (
                  <tr key={position.symbol} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <Link to={`/terminal/${position.symbol}?fullscreen=1`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                        <StockLogo symbol={position.symbol} size={40} />
                        <div>
                          <p className="font-medium text-sm">{position.name || position.symbol}</p>
                          <p className="text-xs text-gray-500">{position.symbol}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{position.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(position.invested)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(position.currentPrice)}</td>
                    <td className={cn('px-4 py-3 text-right font-medium', position.pnl >= 0 ? 'text-green-600' : 'text-red-500')}>
                      {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-medium', position.pnlPercent >= 0 ? 'text-green-600' : 'text-red-500')}>
                      {position.pnlPercent >= 0 ? '+' : ''}{formatPercent(position.pnlPercent)}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-medium', position.dayChange >= 0 ? 'text-green-600' : 'text-red-500')}>
                      {position.dayChange >= 0 ? '+' : ''}{formatPercent(position.dayChange)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── Day Positions — everything traded today, resets daily ── */

function DayPositionsPanel({
  dayPositions, misShorts, dayDate, liveQuotes,
}: {
  dayPositions: DayPosition[];
  misShorts: MisShort[];
  dayDate: string;
  liveQuotes: Record<string, any>;
}) {
  // Recompute live P&L from current quote so the table updates in real time
  const enriched = dayPositions.map((p) => {
    if (p.status !== 'OPEN') return p;
    const live = liveQuotes[p.symbol];
    const ltp = live?.price && live.price > 0 ? live.price : (p.current_price ?? 0);
    if (!ltp) return p;
    const dir = p.side === 'LONG' ? 1 : -1;
    const pnl = (ltp - p.avg_entry_price) * p.quantity * dir;
    const pct = p.avg_entry_price > 0 ? ((ltp - p.avg_entry_price) / p.avg_entry_price) * 100 * dir : 0;
    return { ...p, current_price: ltp, unrealized_pnl: pnl, unrealized_pnl_pct: pct };
  });

  const opens   = enriched.filter((p) => p.status === 'OPEN');
  const closed  = enriched.filter((p) => p.status === 'CLOSED');
  const openLongs  = opens.filter((p) => p.side === 'LONG');
  const openShorts = opens.filter((p) => p.side === 'SHORT');

  const unrealised = opens.reduce((acc, p) => acc + (p.unrealized_pnl ?? 0), 0)
                   + misShorts.reduce((acc, s) => acc + (s.unrealized_pnl ?? 0), 0);
  const realised   = closed.reduce((acc, p) => acc + (p.realized_pnl ?? 0), 0);
  const dayPnl     = unrealised + realised;
  const totalMargin = misShorts.reduce((acc, s) => acc + s.margin_blocked, 0);

  if (enriched.length === 0 && misShorts.length === 0) {
    return (
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center py-16 gap-3">
        <ArrowDownUp className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        <p className="font-semibold text-gray-500">No trades today</p>
        <p className="text-sm text-gray-400">Stocks you buy or sell today will appear here.</p>
        {dayDate && <p className="text-[11px] text-gray-400">Date: {dayDate}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Day Positions</h1>
        <p className="text-xs text-gray-500">
          {dayDate ? `Today · ${dayDate}` : 'Today'} · resets daily
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Open Today</p>
          <p className="text-xl font-bold">{opens.length + misShorts.length}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {openLongs.length} long · {openShorts.length + misShorts.length} short
          </p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Closed Today</p>
          <p className="text-xl font-bold">{closed.length}</p>
          <p className={cn('text-[10px] mt-0.5 font-medium', realised >= 0 ? 'text-gain' : 'text-loss')}>
            Realised {realised >= 0 ? '+' : ''}{formatCurrency(realised)}
          </p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 mb-1">MIS Margin Blocked</p>
          <p className="text-xl font-bold">{formatCurrency(totalMargin)}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Day P&L</p>
          <p className={cn('text-xl font-bold', dayPnl >= 0 ? 'text-gain' : 'text-loss')}>
            {dayPnl >= 0 ? '+' : ''}{formatCurrency(dayPnl)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Unrealised {unrealised >= 0 ? '+' : ''}{formatCurrency(unrealised)}</p>
        </div>
      </div>

      {/* Open positions from today's trades */}
      {opens.length > 0 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-sm font-semibold">Open positions opened today</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold">
              {opens.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Entry</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">LTP</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">P&L</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {opens.map((p) => (
                  <tr key={`${p.symbol}-${p.product_type}-${p.side}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StockLogo symbol={p.symbol} size={36} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm">{p.symbol}</p>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-bold',
                              p.side === 'LONG'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
                            )}>
                              {p.side === 'LONG' ? 'BUY' : 'SELL'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold">
                              {p.product_type}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            {p.product_type === 'MIS' ? 'MIS · Auto sq-off 3:20 PM' : 'CNC delivery'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{p.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(p.avg_entry_price)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {p.current_price != null ? formatCurrency(p.current_price) : '—'}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', (p.unrealized_pnl ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl ?? 0)}
                      <span className="block text-[10px] font-normal opacity-70">
                        {(p.unrealized_pnl_pct ?? 0) >= 0 ? '+' : ''}{(p.unrealized_pnl_pct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/terminal/${p.symbol}?fullscreen=1${p.product_type === 'MIS' ? '&productType=MIS' : ''}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-gold-600 dark:text-gold-400 hover:underline"
                      >
                        {p.side === 'LONG' ? 'Exit (Sell)' : 'Exit (Cover)'} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing MIS short positions */}
      {misShorts.length > 0 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-sm font-semibold">MIS short positions</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold">
              {misShorts.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Sold</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">LTP</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">P&L</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {misShorts.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StockLogo symbol={s.symbol} size={36} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm">{s.symbol}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold">SHORT</span>
                          </div>
                          <p className="text-[10px] text-gray-400">MIS · Auto sq-off 3:20 PM</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{s.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(s.avg_entry_price)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {s.current_price != null ? formatCurrency(s.current_price) : '—'}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', (s.unrealized_pnl ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(s.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(s.unrealized_pnl ?? 0)}
                      <span className="block text-[10px] font-normal opacity-70">
                        {(s.unrealized_pnl_pct ?? 0) >= 0 ? '+' : ''}{(s.unrealized_pnl_pct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/terminal/${s.symbol}?tab=buy&productType=MIS&fullscreen=1`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-gold-600 dark:text-gold-400 hover:underline"
                      >
                        Cover →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed round-trips today */}
      {closed.length > 0 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-sm font-semibold">Closed today (round-trips)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold">
              {closed.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Buy</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Sell</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Realised P&L</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={`closed-${p.symbol}-${p.product_type}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StockLogo symbol={p.symbol} size={36} />
                        <div>
                          <p className="font-medium text-sm">{p.symbol}</p>
                          <p className="text-[10px] text-gray-400">{p.product_type} · closed</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{p.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(p.avg_entry_price)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{p.avg_exit_price != null ? formatCurrency(p.avg_exit_price) : '—'}</td>
                    <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', (p.realized_pnl ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {(p.realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.realized_pnl ?? 0)}
                      <span className="block text-[10px] font-normal opacity-70">
                        {(p.realized_pnl_pct ?? 0) >= 0 ? '+' : ''}{(p.realized_pnl_pct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {misShorts.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
          MIS positions auto-square-off at 3:20 PM IST. Exit before then to avoid forced closure.
        </p>
      )}
    </div>
  );
}
