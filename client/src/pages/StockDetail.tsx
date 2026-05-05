import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { TrendingUp, TrendingDown, Clock, Building2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import StockLogo from '../components/StockLogo';
import StockChart from '../components/StockChart';
import SellConfirmModal from '../components/SellConfirmModal';
import { useMarketStore } from '../store/marketStore';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [searchParams] = useSearchParams();
  const exchange = (searchParams.get('exchange') || 'NSE') as 'NSE' | 'BSE';

  const [stock, setStock] = useState<any>(null);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [showSellConfirm, setShowSellConfirm] = useState(false);
  const [alertCond, setAlertCond] = useState<'above' | 'below'>('above');
  const balance = useAuthStore((s) => s.user?.balance || 0);
  const marketStatus = useMarketStore((s) => s.status);
  const isMarketClosed = marketStatus ? !marketStatus.isOpen : false;

  useEffect(() => {
    if (!symbol) return;
    const fetch = () => axios.get(`/api/stocks/${symbol}`, { params: { exchange } }).then((res) => setStock(res.data));
    fetch();
    const id = setInterval(fetch, 15_000);
    return () => clearInterval(id);
  }, [symbol, exchange]);

  const handleOrderClick = () => {
    if (!qty || qtyNum < 1) { toast.error('Enter a valid quantity'); return; }
    if (tab === 'sell') { setShowSellConfirm(true); return; }
    handleOrder();
  };

  const handleOrder = async () => {
    try {
      const res = await axios.post('/api/orders', {
        symbol,
        type: orderType,
        transactionType: tab,
        quantity: qtyNum,
        limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
      });
      if (res.data.queued) {
        toast.success(res.data.message || 'Order queued for next market open', { duration: 5000, icon: '🕐' });
      } else {
        toast.success(`${tab} order ${res.data.status === 'FILLED' ? 'filled' : 'placed'} successfully!`);
      }
      setQty('');
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
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl w-56" />
        <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const isGain = stock.change_percent >= 0;
  const qtyNum = parseInt(qty) || 0;
  const total = stock.price * qtyNum;
  const mcapCr = stock.market_cap ? (stock.market_cap / 1e7).toFixed(0) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <StockLogo symbol={stock.symbol} size={52} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{stock.symbol}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{exchange}</span>
              {stock.sector && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-groww-primary/10 text-groww-primary">
                  <Building2 className="w-3 h-3 inline mr-1" />{stock.sector}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{stock.name}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(stock.price)}</p>
          <p className={cn('text-sm font-semibold flex items-center justify-end gap-1 mt-0.5', isGain ? 'text-gain' : 'text-loss')}>
            {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isGain ? '+' : ''}{stock.change?.toFixed(2)} ({isGain ? '+' : ''}{stock.change_percent?.toFixed(2)}%)
          </p>
        </div>
      </div>

      {/* Chart */}
      {symbol && <StockChart symbol={symbol} exchange={exchange} />}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Day High', value: formatCurrency(stock.day_high), color: 'text-gain' },
          { label: 'Day Low',  value: formatCurrency(stock.day_low),  color: 'text-loss' },
          { label: '52W High', value: formatCurrency(stock.high_52w) },
          { label: '52W Low',  value: formatCurrency(stock.low_52w) },
          { label: 'P/E Ratio', value: stock.pe_ratio ? stock.pe_ratio.toFixed(1) : '—' },
          { label: 'Market Cap', value: mcapCr ? `₹${Number(mcapCr).toLocaleString('en-IN')} Cr` : '—' },
          { label: 'Volume', value: stock.volume ? stock.volume.toLocaleString('en-IN') : '—' },
          { label: 'EPS', value: stock.eps ? stock.eps.toFixed(2) : '—' },
          { label: 'Div Yield', value: stock.div_yield ? `${stock.div_yield.toFixed(2)}%` : '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-groww-card rounded-xl p-3 border border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={cn('text-sm font-bold tabular-nums', stat.color || '')}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Order panel + price alert side by side on large screens */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Order */}
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('buy')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold transition', tab === 'buy' ? 'bg-groww-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400')}>Buy</button>
            <button onClick={() => setTab('sell')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold transition', tab === 'sell' ? 'bg-groww-loss text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400')}>Sell</button>
          </div>

          {isMarketClosed && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Market Closed</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Orders queued and executed at next open
                  {marketStatus?.nextOpen && (
                    <span className="font-medium"> — {new Date(marketStatus.nextOpen).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex gap-2">
              {(['MARKET', 'LIMIT'] as const).map((t) => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={cn('px-4 py-1.5 rounded-lg text-xs font-semibold transition', orderType === t ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                  {t}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Quantity</label>
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={(e) => { if (e.target.value && parseInt(e.target.value) < 1) setQty('1'); }}
                className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium" />
            </div>
            {orderType === 'LIMIT' && (
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Limit Price</label>
                <input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium" />
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-1">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-base tabular-nums">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>Available balance</span>
              <span className="font-semibold text-gray-600 dark:text-gray-300">{formatCurrency(balance)}</span>
            </div>
            <button onClick={handleOrderClick}
              className={cn('w-full py-3 rounded-xl text-white font-bold text-sm transition', tab === 'buy' ? 'bg-groww-primary hover:bg-green-600' : 'bg-groww-loss hover:bg-red-600')}>
              {isMarketClosed ? `🕐 Queue ${tab === 'buy' ? 'Buy' : 'Sell'} ${qtyNum}` : tab === 'buy' ? `Buy ${qtyNum} ${symbol}` : `Sell ${qtyNum} ${symbol}`}
            </button>
          </div>
        </div>

        {/* Price alert */}
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm">Price Alert</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Get notified when {symbol} reaches your target price.</p>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Target Price</label>
            <input type="number" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)}
              placeholder={`Current: ${stock.price?.toFixed(2)}`}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Condition</label>
            <select value={alertCond} onChange={(e) => setAlertCond(e.target.value as any)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium">
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
            </select>
          </div>
          <button onClick={setAlert}
            className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm transition hover:opacity-90">
            Set Alert
          </button>
        </div>
      </div>

      {/* About */}
      {stock.about && (
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-bold text-sm mb-2">About {stock.name}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{stock.about}</p>
        </div>
      )}

      {showSellConfirm && (
        <SellConfirmModal
          symbol={stock.symbol}
          companyName={stock.name}
          quantity={qtyNum}
          price={stock.price}
          orderType={orderType}
          onConfirm={() => { setShowSellConfirm(false); handleOrder(); }}
          onCancel={() => setShowSellConfirm(false)}
        />
      )}
    </div>
  );
}
