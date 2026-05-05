import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, TrendingUp, TrendingDown, Bell, Bookmark, BookmarkCheck, Clock } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import StockLogo from '../components/StockLogo';
import StockChart from '../components/StockChart';
import SellConfirmModal from '../components/SellConfirmModal';

type Exchange = 'NSE' | 'BSE';

export default function TerminalPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const exchange: Exchange = (searchParams.get('exchange') as Exchange) || 'NSE';
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'SL-M'>('MARKET');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [showSellConfirm, setShowSellConfirm] = useState(false);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCond, setAlertCond] = useState<'above' | 'below'>('above');

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  // Check current bookmark status when symbol changes
  useEffect(() => {
    if (!symbol) return;
    let abort = false;
    axios
      .get(`/api/watchlists/contains/${encodeURIComponent(symbol.toUpperCase())}`)
      .then((res) => {
        if (!abort) setBookmarked(!!res.data?.inWatchlist);
      })
      .catch(() => {});
    return () => {
      abort = true;
    };
  }, [symbol]);

  const toggleBookmark = async () => {
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      const res = await axios.post('/api/watchlists/toggle', {
        symbol: symbol.toUpperCase(),
      });
      const inWatchlist = !!res.data?.inWatchlist;
      setBookmarked(inWatchlist);
      toast.success(inWatchlist ? 'Added to watchlist' : 'Removed from watchlist');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update watchlist');
    } finally {
      setBookmarkBusy(false);
    }
  };

  const user = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);

  // Register this symbol in the global polling set
  const addSymbols = useMarketStore((s) => s.addSymbols);
  useEffect(() => {
    if (symbol) addSymbols([symbol.toUpperCase()]);
  }, [symbol, addSymbols]);

  // Get live quote from global store
  const liveQuote = useMarketStore((s) => s.quotes[symbol.toUpperCase()]);

  // Fetch metadata once (name, sector, isin etc.) — live prices come from global store
  useEffect(() => {
    let abort = false;
    const fetchMeta = async () => {
      try {
        const res = await axios.get(`/api/stocks/${encodeURIComponent(symbol.toUpperCase())}`, {
          params: { exchange },
        });
        if (!abort) {
          setMeta(res.data);
          setLoading(false);
        }
      } catch {
        if (!abort) setLoading(false);
      }
    };
    fetchMeta();
    return () => { abort = true; };
  }, [symbol, exchange]);

  // Merge metadata (from initial fetch) with live quote data
  const quote = useMemo(() => {
    if (!meta && !liveQuote) return null;
    if (liveQuote) {
      return { ...(meta || {}), ...liveQuote };
    }
    return meta;
  }, [meta, liveQuote]);

  const isGain = (quote?.change_percent ?? 0) >= 0;
  const executionPrice = useMemo(() => {
    if (orderType === 'MARKET' || orderType === 'SL-M') return quote?.price ?? 0;
    const lp = parseFloat(limitPrice);
    const tp = parseFloat(triggerPrice);
    if (orderType === 'SL') return Number.isFinite(lp) && lp > 0 ? lp : (Number.isFinite(tp) && tp > 0 ? tp : quote?.price ?? 0);
    return Number.isFinite(lp) && lp > 0 ? lp : quote?.price ?? 0;
  }, [orderType, limitPrice, triggerPrice, quote]);
  const qtyNum = parseInt(qty) || 0;
  const totalValue = executionPrice * qtyNum;

  // Market status from the global store
  const marketStatus = useMarketStore((s) => s.status);
  const isMarketClosed = marketStatus ? !marketStatus.isOpen : false;

  const validateOrder = () => {
    if (!quote) return false;
    if (!qty || qtyNum < 1) { toast.error('Enter a valid quantity'); return false; }
    if (orderType === 'LIMIT' && !limitPrice) { toast.error('Enter a limit price'); return false; }
    if ((orderType === 'SL' || orderType === 'SL-M') && !triggerPrice) { toast.error('Enter a trigger price'); return false; }
    return true;
  };

  const handleOrderClick = () => {
    if (!validateOrder()) return;
    if (tab === 'sell') { setShowSellConfirm(true); return; }
    placeOrder();
  };

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const res = await axios.post('/api/orders', {
        symbol: symbol.toUpperCase(),
        exchange,
        type: orderType,
        transactionType: tab.toUpperCase(),
        quantity: qtyNum,
        limitPrice: (orderType === 'LIMIT' || orderType === 'SL') && limitPrice ? parseFloat(limitPrice) : undefined,
        triggerPrice: (orderType === 'SL' || orderType === 'SL-M') && triggerPrice ? parseFloat(triggerPrice) : undefined,
        productType,
      });
      if (res.data.queued) {
        toast.success(res.data.message || `Order queued — will execute at next market open (9:15 AM IST)`, { duration: 5000, icon: '🕐' });
      } else {
        toast.success(`${tab.toUpperCase()} order ${res.data.status === 'FILLED' ? 'filled' : 'placed'} successfully!`);
      }
      setQty('');
      // Refresh balance
      const p = await axios.get('/api/portfolio');
      if (p.data.balance !== undefined) updateBalance(p.data.balance);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  const submitAlert = async () => {
    if (!alertPrice) return;
    try {
      await axios.post(`/api/stocks/${symbol.toUpperCase()}/alert`, {
        targetPrice: parseFloat(alertPrice),
        condition: alertCond,
      });
      toast.success('Price alert set');
      setAlertOpen(false);
      setAlertPrice('');
    } catch {
      toast.error('Failed to set alert');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-500">Loading terminal…</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20">
        <p className="font-semibold">Could not load market data for {symbol}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-groww-primary">
          Go back
        </button>
      </div>
    );
  }

  const price = quote.price ?? 0;
  const margin = totalValue; // no leverage in paper trading
  const affordable = tab === 'buy' ? (user?.balance ?? 0) >= margin : true;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-4 -my-4 sm:-mx-6 sm:-my-6 bg-gray-50 dark:bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white dark:bg-groww-card border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <StockLogo symbol={symbol} size={48} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold truncate">{symbol}</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {exchange}
              </span>
              <button
                onClick={() => {
                  const next = exchange === 'NSE' ? 'BSE' : 'NSE';
                  setSearchParams({ exchange: next });
                }}
                className="text-[10px] text-groww-primary hover:underline"
              >
                Switch to {exchange === 'NSE' ? 'BSE' : 'NSE'}
              </button>
            </div>
            <p className="text-xs text-gray-500 truncate">{quote.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums">{formatCurrency(price)}</p>
            <p
              className={cn(
                'text-xs font-medium flex items-center justify-end gap-1 tabular-nums',
                isGain ? 'text-gain' : 'text-loss'
              )}
            >
              {isGain ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isGain ? '+' : ''}
              {(quote.change ?? 0).toFixed(2)} ({isGain ? '+' : ''}
              {(quote.change_percent ?? 0).toFixed(2)}%)
            </p>
          </div>
          <button
            onClick={toggleBookmark}
            disabled={bookmarkBusy}
            className={cn(
              'p-2 rounded-lg border transition disabled:opacity-50',
              bookmarked
                ? 'border-groww-primary bg-groww-primary/10 text-groww-primary'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
            title={bookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-pressed={bookmarked}
          >
            {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setAlertOpen((v) => !v)}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Set price alert"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Chart area */}
        <div className="flex-1 flex flex-col min-h-[600px] lg:min-h-0">
          <div className="flex-1 bg-white dark:bg-groww-card border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-gray-800 p-3">
            <StockChart symbol={symbol.toUpperCase()} exchange={exchange} />
          </div>
          {/* Key stats strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-3 bg-white dark:bg-groww-card border-t border-gray-100 dark:border-gray-800 text-xs">
            <Stat label="Open" value={formatCurrency(quote.previous_close)} />
            <Stat label="High" value={formatCurrency(quote.day_high)} />
            <Stat label="Low" value={formatCurrency(quote.day_low)} />
            <Stat label="52w High" value={quote.high_52w ? formatCurrency(quote.high_52w) : '—'} />
            <Stat label="52w Low" value={quote.low_52w ? formatCurrency(quote.low_52w) : '—'} />
            <Stat label="Volume" value={(quote.volume || 0).toLocaleString('en-IN')} />
          </div>
        </div>

        {/* Order panel */}
        <aside className="w-full lg:w-[360px] bg-white dark:bg-groww-card flex flex-col">
          {/* Buy/Sell tabs */}
          <div className="grid grid-cols-2 text-sm font-semibold">
            <button
              onClick={() => setTab('buy')}
              className={cn(
                'py-3 border-b-2 transition',
                tab === 'buy'
                  ? 'border-gain text-gain bg-gain/5'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              BUY
            </button>
            <button
              onClick={() => setTab('sell')}
              className={cn(
                'py-3 border-b-2 transition',
                tab === 'sell'
                  ? 'border-loss text-loss bg-loss/5'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              SELL
            </button>
          </div>

          {/* Market closed banner */}
          {isMarketClosed && (
            <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Market Closed</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Orders will be queued and executed at next market open
                  {marketStatus?.nextOpen && (
                    <span className="font-medium"> — {new Date(marketStatus.nextOpen).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Order form */}
          <div className="p-4 space-y-3 flex-1">
            {/* Product type: CNC / MIS */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Product</span>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ml-1">
                {(['CNC', 'MIS'] as const).map(pt => (
                  <button key={pt} onClick={() => setProductType(pt)}
                    className={cn('px-3 py-1 text-xs font-semibold transition',
                      productType === pt ? 'bg-groww-primary text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                    {pt}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-gray-400 ml-1">{productType === 'MIS' ? 'Intraday — auto square-off 3:20 PM' : 'Delivery'}</span>
            </div>

            {/* Order type: 4 buttons */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Order Type</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as const).map(ot => (
                  <button key={ot} onClick={() => setOrderType(ot)}
                    className={cn('py-1.5 text-xs rounded-lg border transition font-medium',
                      orderType === ot
                        ? 'border-groww-primary bg-groww-primary/10 text-groww-primary'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}>
                    {ot}
                  </button>
                ))}
              </div>
              {(orderType === 'SL' || orderType === 'SL-M') && (
                <p className="text-[10px] text-amber-500 mt-1">
                  {orderType === 'SL-M' ? 'Triggers a market order when price hits trigger' : 'Triggers a limit order when price hits trigger'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Quantity</label>
              <input type="number" value={qty}
                onChange={(e) => setQty(e.target.value)}
                onBlur={(e) => { if (e.target.value && parseInt(e.target.value) < 1) setQty('1'); }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm tabular-nums" />
            </div>

            {(orderType === 'SL' || orderType === 'SL-M') && (
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Trigger Price</label>
                <input type="number" step="0.05" value={triggerPrice} placeholder={String(price.toFixed(2))}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm tabular-nums" />
              </div>
            )}

            {(orderType === 'LIMIT' || orderType === 'SL') && (
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Limit Price</label>
                <input type="number" step="0.05" value={limitPrice} placeholder={String(price.toFixed(2))}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm tabular-nums" />
              </div>
            )}

            <div className="space-y-1.5 text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
              <Row label="LTP" value={formatCurrency(price)} />
              <Row label="Execution Price" value={formatCurrency(executionPrice)} />
              <Row label="Quantity" value={String(qtyNum)} />
              <Row
                label={tab === 'buy' ? 'Amount Required' : 'Expected Proceeds'}
                value={formatCurrency(totalValue)}
                highlight
              />
              <Row label="Available Cash" value={formatCurrency(user?.balance ?? 0)} />
            </div>

            {tab === 'buy' && !affordable && (
              <p className="text-xs text-loss">Insufficient balance.</p>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleOrderClick}
              disabled={placing || (tab === 'buy' && !affordable)}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-white transition',
                tab === 'buy' ? 'bg-gain hover:brightness-110' : 'bg-loss hover:brightness-110',
                (placing || (tab === 'buy' && !affordable)) && 'opacity-60 cursor-not-allowed'
              )}
            >
              {placing
                ? 'Placing…'
                : isMarketClosed
                  ? `🕐 Queue ${tab === 'buy' ? 'BUY' : 'SELL'} ${qtyNum} ${symbol}`
                  : `${tab === 'buy' ? 'BUY' : 'SELL'} ${qtyNum} ${symbol}`}
            </button>
            <Link
              to={`/orders`}
              className="block text-center text-xs text-gray-500 hover:text-groww-primary mt-2"
            >
              View orders →
            </Link>
          </div>
        </aside>
      </div>

      {/* Price Alert popover */}
      {alertOpen && (
        <div className="fixed right-4 top-20 z-50 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-72">
          <h3 className="font-semibold text-sm mb-2">Set Price Alert — {symbol}</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAlertCond('above')}
                className={cn(
                  'py-1.5 text-xs rounded-lg border',
                  alertCond === 'above'
                    ? 'border-gain text-gain'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500'
                )}
              >
                Above
              </button>
              <button
                onClick={() => setAlertCond('below')}
                className={cn(
                  'py-1.5 text-xs rounded-lg border',
                  alertCond === 'below'
                    ? 'border-loss text-loss'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500'
                )}
              >
                Below
              </button>
            </div>
            <input
              type="number"
              value={alertPrice}
              placeholder={String(price.toFixed(2))}
              onChange={(e) => setAlertPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAlertOpen(false)}
                className="flex-1 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={submitAlert}
                className="flex-1 py-2 text-xs rounded-lg bg-groww-primary text-white"
              >
                Set Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {showSellConfirm && (
        <SellConfirmModal
          symbol={symbol.toUpperCase()}
          companyName={meta?.name}
          quantity={qtyNum}
          price={executionPrice}
          orderType={orderType}
          onConfirm={() => { setShowSellConfirm(false); placeOrder(); }}
          onCancel={() => setShowSellConfirm(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase text-gray-400">{label}</p>
      <p className="font-medium tabular-nums text-[13px]">{value}</p>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={cn('tabular-nums', highlight ? 'font-semibold' : 'text-gray-700 dark:text-gray-300')}>
        {value}
      </span>
    </div>
  );
}
