import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { useMarketStore } from '../store/marketStore';
import StockLogo from '../components/StockLogo';
import DatePicker from '../components/DatePicker';
import { TrendingUp, TrendingDown, ArrowUpRight, Search } from 'lucide-react';

type SortKey = 'symbol' | 'qty' | 'avg' | 'current' | 'pnl' | 'pnl_pct' | 'day_change';
type SortDir = 'asc' | 'desc';

export default function PositionsPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('pnl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const allQuotes = useMarketStore((s) => s.quotes);

  useEffect(() => {
    async function fetchPositions() {
      try {
        const res = await axios.get('/api/portfolio');
        setHoldings(res.data.holdings || []);
      } catch (error) {
        console.error('Error fetching positions:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPositions();
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Positions</h1>
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
        <div className="flex gap-2">
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
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No positions found
                  </td>
                </tr>
              ) : (
                filteredPositions.map((position: any) => (
                  <tr key={position.symbol} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3">
                      <Link to={`/terminal/${position.symbol}`} className="flex items-center gap-3">
                        <StockLogo symbol={position.symbol} size={40} />
                        <div>
                          <p className="font-medium text-sm">{position.name || position.symbol}</p>
                          <p className="text-xs text-gray-500">{position.symbol}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{position.quantity}</td>
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
    </div>
  );
}
