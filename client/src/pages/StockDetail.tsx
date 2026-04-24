import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import StockLogo from '../components/StockLogo';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [stock, setStock] = useState<any>(null);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCond, setAlertCond] = useState<'above' | 'below'>('above');
  useAuthStore((s) => s.user?.balance || 0);

  useEffect(() => {
    if (!symbol) return;
    axios.get(`/api/stocks/${symbol}`).then((res) => setStock(res.data));
    const interval = setInterval(() => {
      axios.get(`/api/stocks/${symbol}`).then((res) => setStock(res.data));
    }, 15000);
    return () => clearInterval(interval);
  }, [symbol]);

  const history = useMemo(() => {
    if (!stock?.history) return [];
    return stock.history.map((h: any) => ({ price: h.price, time: h.timestamp })).reverse();
  }, [stock]);

  const handleOrder = async () => {
    try {
      await axios.post('/api/orders', {
        symbol,
        type: orderType,
        transactionType: tab,
        quantity: Number(qty),
        limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
      });
      toast.success(`${tab} order placed successfully!`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Order failed');
    }
  };

  const setAlert = async () => {
    try {
      await axios.post(`/api/stocks/${symbol}/alert`, { targetPrice: Number(alertPrice), condition: alertCond });
      toast.success('Price alert set!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to set alert');
    }
  };

  if (!stock) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48" />
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    );
  }

  const isGain = stock.change_percent >= 0;
  const total = stock.price * qty;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StockLogo symbol={stock.symbol} size={56} />
          <div>
            <h1 className="text-2xl font-bold">{stock.symbol}</h1>
            <p className="text-sm text-gray-500">{stock.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{formatCurrency(stock.price)}</p>
          <p className={cn('text-sm font-medium flex items-center justify-end gap-1', isGain ? 'text-gain' : 'text-loss')}>
            {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isGain ? '+' : ''}{stock.change.toFixed(2)} ({isGain ? '+' : ''}{stock.change_percent.toFixed(2)}%)
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <h3 className="font-semibold mb-3">Price History</h3>
        <div className="h-64 flex items-end gap-1">
          {history.slice(-30).map((h: any, i: number) => {
            const min = Math.min(...history.slice(-30).map((x: any) => x.price));
            const max = Math.max(...history.slice(-30).map((x: any) => x.price));
            const pct = max === min ? 50 : ((h.price - min) / (max - min)) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className={cn('w-full rounded-t-sm transition-all', i === history.slice(-30).length - 1 ? 'bg-groww-primary' : 'bg-gray-300 dark:bg-gray-700 group-hover:bg-gray-400 dark:group-hover:bg-gray-600')}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">Market Cap</p>
          <p className="font-semibold">{(stock.market_cap / 1e5).toFixed(2)} L Cr</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">P/E Ratio</p>
          <p className="font-semibold">{stock.pe_ratio?.toFixed(1) || '-'}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">52W High</p>
          <p className="font-semibold">{formatCurrency(stock.high_52w)}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">52W Low</p>
          <p className="font-semibold">{formatCurrency(stock.low_52w)}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">Volume</p>
          <p className="font-semibold">{stock.volume?.toLocaleString() || '-'}</p>
        </div>
        <div className="bg-white dark:bg-groww-card rounded-lg p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-gray-500 text-xs">EPS</p>
          <p className="font-semibold">{stock.eps?.toFixed(1) || '-'}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('buy')} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'buy' ? 'bg-groww-primary text-white' : 'bg-gray-100 dark:bg-gray-800')}>Buy</button>
          <button onClick={() => setTab('sell')} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold', tab === 'sell' ? 'bg-groww-loss text-white' : 'bg-gray-100 dark:bg-gray-800')}>Sell</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setOrderType('MARKET')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', orderType === 'MARKET' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800')}>Market</button>
            <button onClick={() => setOrderType('LIMIT')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', orderType === 'LIMIT' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800')}>Limit</button>
          </div>
          <div>
            <label className="text-xs text-gray-500">Quantity</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
          </div>
          {orderType === 'LIMIT' && (
            <div>
              <label className="text-xs text-gray-500">Limit Price</label>
              <input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>
          <button onClick={handleOrder} className={cn('w-full py-2.5 rounded-lg text-white font-semibold', tab === 'buy' ? 'bg-groww-primary hover:bg-green-600' : 'bg-groww-loss hover:bg-red-600')}>
            {tab === 'buy' ? 'Buy' : 'Sell'} {symbol}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <h3 className="font-semibold mb-3">Set Price Alert</h3>
        <div className="flex gap-2">
          <input type="number" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} placeholder="Target price" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
          <select value={alertCond} onChange={(e) => setAlertCond(e.target.value as any)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <button onClick={setAlert} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm">Set</button>
        </div>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <h3 className="font-semibold mb-2">About</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{stock.about}</p>
      </div>
    </div>
  );
}
