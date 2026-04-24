import { useEffect, useState } from 'react';
import axios from 'axios';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { TrendingUp, Activity, ArrowUpRight, ArrowDownRight, CheckCircle } from 'lucide-react';
import DatePicker from './DatePicker';

export default function DailyInsights() {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    async function fetchInsights() {
      try {
        console.log('[DailyInsights] Fetching insights...');
        const dateStr = selectedDate.toISOString().split('T')[0];
        const res = await axios.get('/api/insights/daily', { params: { date: dateStr } });
        console.log('[DailyInsights] Response:', res.data);
        setInsights(res.data);
      } catch (error: any) {
        console.error('[DailyInsights] Error fetching daily insights:', error.response?.data || error.message);
      } finally {
        setLoading(false);
      }
    }
    fetchInsights();
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <p className="text-gray-500">No insights available</p>
      </div>
    );
  }

  const { portfolio, activity, pnl, recentTransactions, recentOrders } = insights;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Daily Insights</h2>
          <p className="text-sm text-gray-500">{new Date(insights.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} maxDate={new Date()} />
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-gray-500">Portfolio Value</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(portfolio.currentValue)}</p>
          <div className={cn('flex items-center gap-1 text-sm mt-1', portfolio.dailyChange >= 0 ? 'text-green-600' : 'text-red-500')}>
            {portfolio.dailyChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {portfolio.dailyChange >= 0 ? '+' : ''}{formatCurrency(portfolio.dailyChange)} ({formatPercent(portfolio.dailyChangePercent)})
          </div>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-500">Active Positions</span>
          </div>
          <p className="text-2xl font-bold">{portfolio.activePositions}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-gray-500">Realized P&L</span>
          </div>
          <p className={cn('text-2xl font-bold', pnl.realized >= 0 ? 'text-green-600' : 'text-red-500')}>
            {pnl.realized >= 0 ? '+' : ''}{formatCurrency(pnl.realized)}
          </p>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Today's Activity
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{activity.buyCount}</p>
            <p className="text-sm text-gray-500">Buy Orders</p>
            <p className="text-xs text-gray-400">{formatCurrency(activity.buyVolume)}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-red-500">{activity.sellCount}</p>
            <p className="text-sm text-gray-500">Sell Orders</p>
            <p className="text-xs text-gray-400">{formatCurrency(activity.sellVolume)}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{activity.totalTransactions}</p>
            <p className="text-sm text-gray-500">Transactions</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{activity.pendingOrders}</p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
          <div className="space-y-3">
            {recentTransactions.map((txn: any) => (
              <div key={txn.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-bold px-2 py-1 rounded-full', txn.type === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
                    {txn.type}
                  </span>
                  <div>
                    <p className="font-medium">{txn.symbol}</p>
                    <p className="text-xs text-gray-500">{txn.quantity} shares @ {formatCurrency(txn.price)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(txn.total_amount)}</p>
                  <p className="text-xs text-gray-400">{new Date(txn.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      {recentOrders.length > 0 && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-bold px-2 py-1 rounded-full', order.transaction_type === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
                    {order.transaction_type}
                  </span>
                  <div>
                    <p className="font-medium">{order.symbol}</p>
                    <p className="text-xs text-gray-500">{order.quantity} shares @ {formatCurrency(order.price)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', order.status === 'FILLED' ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : order.status === 'PENDING' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20' : 'bg-gray-100 text-gray-600 dark:bg-gray-800')}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
