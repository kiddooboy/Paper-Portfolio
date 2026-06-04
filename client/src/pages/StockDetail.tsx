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
import NewsFeed from '../components/NewsFeed';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [searchParams] = useSearchParams();
  const exchange = (searchParams.get('exchange') || 'NSE') as 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';
  const isUS = exchange === 'NASDAQ' || exchange === 'NYSE';

  const ccyPref = useAuthStore((s) => s.user?.currency_display || 'INR');
  const [fxRate, setFxRate] = useState<number>(0);

  // For US stocks, pull current USD/INR so we can render the dual price
  // and pass productType=DAY in the order payload.
  useEffect(() => {
    if (!isUS) return;
    let alive = true;
    axios.get('/api/fx/usdinr').then((res) => {
      if (alive) setFxRate(Number(res.data?.rate) || 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [isUS]);

  const [stock, setStock] = useState<any>(null);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [showSellConfirm, setShowSellConfirm] = useState(false);
  const [alertCond, setAlertCond] = useState<'above' | 'below'>('above');
  const [researchTab, setResearchTab] = useState<'financials' | 'analyst' | 'shareholding' | 'peers' | null>(null);
  const [researchData, setResearchData] = useState<Record<string, any>>({});
  const [researchLoading, setResearchLoading] = useState<string | null>(null);
  const balance = useAuthStore((s) => s.user?.balance || 0);
  const marketStatus = useMarketStore((s) => s.status);
  const isMarketClosed = marketStatus ? !marketStatus.isOpen : false;

  useEffect(() => {
    if (!symbol) return;
    const fetch = () => axios.get(`/api/stocks/${symbol}`, { params: { exchange } }).then((res) => setStock(res.data));
    fetch();
    const id = setInterval(fetch, 8_000);
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
        exchange,
        type: orderType,
        transactionType: tab,
        quantity: qtyNum,
        limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
        productType: isUS ? 'DAY' : 'CNC',
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

  const loadResearch = async (tab: string) => {
    if (researchData[tab] !== undefined) return;
    setResearchLoading(tab);
    try {
      const res = await axios.get(`/api/research/${symbol}/${tab}`);
      setResearchData(r => ({ ...r, [tab]: res.data }));
    } catch {
      setResearchData(r => ({ ...r, [tab]: null }));
    } finally {
      setResearchLoading(null);
    }
  };

  const handleResearchTab = (t: typeof researchTab) => {
    setResearchTab(t);
    if (t) loadResearch(t);
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
    <div className="space-y-3">
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
          {isUS ? (
            <>
              <p className="text-3xl font-bold tabular-nums">
                {ccyPref === 'USD' || !fxRate
                  ? formatCurrency(stock.price, { currency: 'USD' })
                  : formatCurrency(stock.price * fxRate, { currency: 'INR' })}
              </p>
              {fxRate > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {ccyPref === 'USD'
                    ? `≈ ${formatCurrency(stock.price * fxRate, { currency: 'INR' })}`
                    : `≈ ${formatCurrency(stock.price, { currency: 'USD' })}`}
                  <span className="ml-1 text-[10px]">@ ₹{fxRate.toFixed(2)}/$</span>
                </p>
              )}
              <p className={cn('text-sm font-semibold flex items-center justify-end gap-1 mt-0.5', isGain ? 'text-gain' : 'text-loss')}>
                {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isGain ? '+' : ''}{stock.change?.toFixed(2)} ({isGain ? '+' : ''}{stock.change_percent?.toFixed(2)}%)
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tabular-nums">{formatCurrency(stock.price)}</p>
              <p className={cn('text-sm font-semibold flex items-center justify-end gap-1 mt-0.5', isGain ? 'text-gain' : 'text-loss')}>
                {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isGain ? '+' : ''}{stock.change?.toFixed(2)} ({isGain ? '+' : ''}{stock.change_percent?.toFixed(2)}%)
              </p>
            </>
          )}
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
              <span className="font-bold text-base tabular-nums">
                {isUS
                  ? formatCurrency(total, { currency: 'USD' })
                  : formatCurrency(total)}
              </span>
            </div>
            {isUS && fxRate > 0 && qtyNum > 0 && (
              <div className="flex justify-between items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-md px-2 py-1.5">
                <span>₹ debit @ ₹{fxRate.toFixed(2)}/$ <span className="text-gray-500 dark:text-gray-400">(locks at submit)</span></span>
                <span className="font-bold tabular-nums">{formatCurrency(total * fxRate, { currency: 'INR' })}</span>
              </div>
            )}
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

      {/* Research Tabs */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['financials', 'analyst', 'shareholding', 'peers'] as const).map(t => (
            <button
              key={t}
              onClick={() => handleResearchTab(t)}
              className={cn(
                'flex-1 py-3 text-sm font-medium capitalize transition border-b-2',
                researchTab === t
                  ? 'border-groww-primary text-groww-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {t === 'shareholding' ? 'Holding' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {researchTab && (
          <div className="p-5">
            {researchLoading === researchTab ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : researchData[researchTab] === null ? (
              <p className="text-center text-gray-400 py-8 text-sm">Data not available for this stock.</p>
            ) : researchData[researchTab] === undefined ? null
            : researchTab === 'financials' ? <FinancialsTab data={researchData.financials} />
            : researchTab === 'analyst' ? <AnalystTab data={researchData.analyst} />
            : researchTab === 'shareholding' ? <ShareholdingTab data={researchData.shareholding} />
            : <PeersTab data={researchData.peers} />}
          </div>
        )}
      </div>

      {/* News Feed */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <NewsFeed query={symbol || ''} />
      </div>

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

function FinancialsTab({ data }: { data: any }) {
  const fmt = (v: number | null | undefined) => v != null ? `₹${(v / 1e7).toFixed(0)} Cr` : '—';
  const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
  return (
    <div className="space-y-5">
      {data?.income_statements?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Income Statement</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1.5 pr-3">Metric</th>
                  {data.income_statements.map((s: any) => <th key={s.date} className="text-right py-1.5 px-2">{s.date}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {[{ label: 'Revenue', key: 'revenue' }, { label: 'Gross Profit', key: 'gross_profit' }, { label: 'EBIT', key: 'ebit' }, { label: 'Net Income', key: 'net_income' }].map(row => (
                  <tr key={row.key}>
                    <td className="py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">{row.label}</td>
                    {data.income_statements.map((s: any) => <td key={s.date} className="text-right py-2 px-2 tabular-nums font-medium">{fmt(s[row.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data?.financial_data && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Key Ratios</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Revenue Growth', value: pct(data.financial_data.revenue_growth) },
              { label: 'Gross Margin', value: pct(data.financial_data.gross_margins) },
              { label: 'Op. Margin', value: pct(data.financial_data.operating_margins) },
              { label: 'Net Margin', value: pct(data.financial_data.profit_margins) },
              { label: 'ROE', value: pct(data.financial_data.roe) },
              { label: 'ROA', value: pct(data.financial_data.roa) },
              { label: 'D/E Ratio', value: data.financial_data.debt_to_equity?.toFixed(2) ?? '—' },
              { label: 'Current Ratio', value: data.financial_data.current_ratio?.toFixed(2) ?? '—' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 mb-0.5">{item.label}</p>
                <p className="font-bold text-sm">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalystTab({ data }: { data: any }) {
  const recColor = (r: string) => {
    if (!r) return '';
    if (r === 'buy' || r === 'strongBuy' || r === 'strong_buy') return 'text-gain';
    if (r === 'sell' || r === 'strongSell' || r === 'strong_sell') return 'text-loss';
    return 'text-amber-500';
  };
  const total = data?.trend ? (data.trend.strong_buy + data.trend.buy + data.trend.hold + data.trend.sell + data.trend.strong_sell) : 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[130px] bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Consensus</p>
          <p className={cn('text-xl font-bold uppercase', recColor(data?.recommendation))}>{data?.recommendation || '—'}</p>
          {data?.number_of_analysts && <p className="text-xs text-gray-400 mt-1">{data.number_of_analysts} analysts</p>}
        </div>
        <div className="flex-1 min-w-[130px] bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Target (Mean)</p>
          <p className="text-xl font-bold">{data?.target_mean_price ? formatCurrency(data.target_mean_price) : '—'}</p>
          {data?.target_low_price && <p className="text-xs text-gray-400 mt-1">{formatCurrency(data.target_low_price)} – {formatCurrency(data.target_high_price)}</p>}
        </div>
        <div className="flex-1 min-w-[130px] bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Forward P/E</p>
          <p className="text-xl font-bold">{data?.forward_pe?.toFixed(1) ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-1">PEG: {data?.peg_ratio?.toFixed(2) ?? '—'}</p>
        </div>
      </div>
      {data?.trend && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Analyst Breakdown</h4>
          <div className="space-y-2">
            {[
              { label: 'Strong Buy', val: data.trend.strong_buy, color: 'bg-gain' },
              { label: 'Buy', val: data.trend.buy, color: 'bg-green-400' },
              { label: 'Hold', val: data.trend.hold, color: 'bg-amber-400' },
              { label: 'Sell', val: data.trend.sell, color: 'bg-orange-400' },
              { label: 'Strong Sell', val: data.trend.strong_sell, color: 'bg-loss' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs w-20 text-gray-500">{item.label}</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', item.color)} style={{ width: total > 0 ? `${Math.round((item.val / total) * 100)}%` : '0%' }} />
                </div>
                <span className="text-xs font-medium w-4 text-right">{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShareholdingTab({ data }: { data: any }) {
  const cats = [
    { label: 'Promoter/Insider', value: data?.promoter_percent, color: 'bg-groww-primary' },
    { label: 'Institutions', value: data?.institutions_percent, color: 'bg-indigo-500' },
    { label: 'Public', value: data?.public_percent, color: 'bg-amber-400' },
  ].filter(c => c.value != null);
  return (
    <div className="space-y-5">
      {cats.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Shareholding Pattern</h4>
          <div className="flex h-3 rounded-full overflow-hidden mb-4">
            {cats.map(c => <div key={c.label} className={cn('transition-all', c.color)} style={{ width: `${c.value}%` }} />)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {cats.map(c => (
              <div key={c.label} className="text-center">
                <div className={cn('w-3 h-3 rounded-full mx-auto mb-1', c.color)} />
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="font-bold text-sm">{(c.value as number).toFixed(2)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.top_institutions?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Top Institutional Holders</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2">Institution</th>
                <th className="text-right py-2">Holding %</th>
                <th className="text-right py-2">Shares</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.top_institutions.map((inst: any) => (
                <tr key={inst.name}>
                  <td className="py-2 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[160px]">{inst.name}</td>
                  <td className="py-2 text-right tabular-nums">{inst.percent?.toFixed(2) ?? '—'}%</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{inst.shares?.toLocaleString('en-IN') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cats.length === 0 && !data?.top_institutions?.length && (
        <p className="text-center text-gray-400 py-8 text-sm">Shareholding data not available.</p>
      )}
    </div>
  );
}

function PeersTab({ data }: { data: any }) {
  return (
    <div>
      {data?.sector && <p className="text-xs text-gray-400 mb-3">Sector: <span className="font-medium text-gray-600 dark:text-gray-300">{data.sector}</span></p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-800 text-xs uppercase tracking-wide">
              <th className="text-left py-2">Company</th>
              <th className="text-right py-2 px-2">Price</th>
              <th className="text-right py-2 px-2">Chg%</th>
              <th className="text-right py-2 px-2">Mkt Cap</th>
              <th className="text-right py-2">P/E</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {data?.peers?.map((p: any) => (
              <tr key={p.symbol} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/30', p.is_selected && 'bg-groww-primary/5')}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    {p.is_selected && <span className="w-1 h-4 rounded bg-groww-primary shrink-0" />}
                    <div>
                      <p className={cn('font-semibold text-xs', p.is_selected && 'text-groww-primary')}>{p.symbol}</p>
                      <p className="text-[10px] text-gray-400 truncate max-w-[100px]">{p.name}</p>
                    </div>
                  </div>
                </td>
                <td className="text-right py-2.5 px-2 tabular-nums text-xs font-medium">{formatCurrency(p.price)}</td>
                <td className={cn('text-right py-2.5 px-2 tabular-nums text-xs font-semibold', p.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                  {p.change_percent >= 0 ? '+' : ''}{p.change_percent?.toFixed(2)}%
                </td>
                <td className="text-right py-2.5 px-2 tabular-nums text-xs text-gray-500">
                  {p.market_cap ? `₹${(p.market_cap / 1e7).toFixed(0)} Cr` : '—'}
                </td>
                <td className="text-right py-2.5 tabular-nums text-xs">{p.pe_ratio?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
