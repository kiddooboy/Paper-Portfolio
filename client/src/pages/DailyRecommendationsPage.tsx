import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useMarketStore } from '../store/marketStore';
import { cn } from '../lib/utils';
import {
  Sparkles, TrendingUp, TrendingDown, Minus, Clock, Calendar,
  ChevronDown, ChevronUp, Target, ShieldAlert, BarChart3, Globe,
  Zap, ArrowUpRight, ArrowDownRight, RefreshCw, AlertTriangle,
  Wallet, Info, Flame, Landmark
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type Recommendation = {
  symbol: string;
  name: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entry_price?: number;
  entry_range?: [number, number];
  target: number;
  stop_loss: number;
  risk_reward_ratio?: number;
  capital_allocation_pct?: number;
  reasoning: string;
  timeframe: string;
  technical_signals: {
    rsi?: number;
    macd?: string;
    supertrend?: string;
    ema_trend?: string;
    breakout_signal?: string;
    institutional_activity?: string;
  };
  catalysts?: string[];
};

type GlobalCue = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
};

type DailyData = {
  id: number;
  date: string;
  market_sentiment: string;
  summary: string;
  recommendations: Recommendation[];
  global_cues: GlobalCue[];
  generated_at: string;
  model_used: string;
};

type HistoryItem = {
  date: string;
  market_sentiment: string;
  summary: string;
  recommendations: Recommendation[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDateLong(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatGenTime(iso: string) {
  const d = new Date(iso + 'Z');
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

const sentimentConfig = {
  bullish: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: TrendingUp, label: 'Bullish', gradient: 'from-green-600 via-emerald-600 to-teal-700' },
  bearish: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: TrendingDown, label: 'Bearish', gradient: 'from-red-600 via-rose-600 to-orange-700' },
  neutral: { color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20', icon: Minus, label: 'Neutral', gradient: 'from-gray-600 via-slate-600 to-zinc-700' },
};

const actionConfig = {
  BUY:  { color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/30', label: 'BUY' },
  SELL: { color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30', label: 'SELL' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', label: 'HOLD' },
};

// ── Confidence Ring ─────────────────────────────────────────────────────────
function ConfidenceRing({ value }: { value: number }) {
  const radius = 20;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? 'stroke-green-400' : value >= 50 ? 'stroke-amber-400' : 'stroke-gray-400';

  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="currentColor"
          className="text-gray-200 dark:text-gray-700" strokeWidth={stroke} />
        <circle cx="24" cy="24" r={radius} fill="none"
          className={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-gray-900 dark:text-white">{value}%</span>
      </div>
    </div>
  );
}

// ── Signal Chip ─────────────────────────────────────────────────────────────
function SignalChip({ label, value }: { label: string; value: string | number | undefined }) {
  if (!value && value !== 0) return null;
  const strVal = String(value).toLowerCase();
  const isPositive = ['bullish', 'up', 'positive', 'golden crossover', 'accumulation'].some(x => strVal.includes(x)) || (typeof value === 'number' && value >= 55 && value <= 70);
  const isNegative = ['bearish', 'down', 'negative'].some(x => strVal.includes(x)) || (typeof value === 'number' && (value > 70 || value < 35));

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors',
      isPositive ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : isNegative ? 'bg-red-500/10 text-red-400 border-red-500/20'
        : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    )}>
      {label}: {typeof value === 'number' ? value.toFixed(0) : value}
    </span>
  );
}

// ── Stock Pick Card (Premium design with pre-filled trading panel) ─────────
function StockPickCard({ rec, index }: { rec: Recommendation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showTradePanel, setShowTradePanel] = useState(false);
  const action = actionConfig[rec.action] || actionConfig.HOLD;

  // Retrieve user balance & market status
  const balance = useAuthStore((s) => s.user?.balance || 0);
  const marketStatus = useMarketStore((s) => s.status);
  const isMarketClosed = marketStatus ? !marketStatus.isOpen : false;

  // Determine prefilled entry price
  const initialEntry = rec.entry_price || (rec.entry_range ? (rec.entry_range[0] + rec.entry_range[1]) / 2 : 100);

  // States for interactive prefilled order drawer
  const [productType, setProductType] = useState<'MIS' | 'CNC'>('MIS');
  const [entryPrice, setEntryPrice] = useState<number>(+initialEntry.toFixed(2));
  const [stopLoss, setStopLoss] = useState<number>(rec.stop_loss);
  const [targetPrice, setTargetPrice] = useState<number>(rec.target);
  const [allocationPct, setAllocationPct] = useState<number>(rec.capital_allocation_pct || 10);
  const [isExecuting, setIsExecuting] = useState(false);

  // Compute values dynamically
  const riskReward = entryPrice > stopLoss
    ? ((targetPrice - entryPrice) / (entryPrice - stopLoss)).toFixed(2)
    : '0.0';

  // Intraday (MIS) is 5x leverage -> 20% margin. Delivery (CNC) is 100% margin.
  const marginMultiplier = productType === 'MIS' ? 0.20 : 1.0;
  const allocatedCapital = balance * (allocationPct / 100);
  
  // Suggested quantity calculation
  const suggestedQty = entryPrice > 0
    ? Math.floor(allocatedCapital / (entryPrice * marginMultiplier))
    : 0;

  const [quantity, setQuantity] = useState<number>(suggestedQty || 1);

  // Update quantity whenever allocation or entry price shifts
  useEffect(() => {
    if (suggestedQty > 0) {
      setQuantity(suggestedQty);
    } else {
      setQuantity(1);
    }
  }, [allocationPct, entryPrice, productType, suggestedQty]);

  const requiredMargin = entryPrice * quantity * marginMultiplier;

  const handleQuickExecute = async () => {
    if (quantity < 1) {
      toast.error('Suggested quantity must be at least 1');
      return;
    }
    if (requiredMargin > balance) {
      toast.error('Insufficient balance to execute this trade.');
      return;
    }

    setIsExecuting(true);
    try {
      const res = await axios.post('/api/orders', {
        symbol: rec.symbol,
        type: 'LIMIT',
        transactionType: 'BUY',
        quantity: quantity,
        limitPrice: entryPrice,
        targetPrice: targetPrice,
        triggerPrice: stopLoss, // Triggers SL-M sell child leg when filled
        productType: productType,
        is_amo: isMarketClosed,
      });

      if (res.data.queued) {
        toast.success(`Bracket Order Queued (AMO) for ${rec.symbol}!`, { duration: 5000, icon: '🕐' });
      } else {
        toast.success(`Bracket Order Executed successfully for ${rec.symbol}!`, { duration: 5000, icon: '🚀' });
      }

      // Re-fetch user detail to sync the global cash balance seamlessly
      const userRes = await axios.get('/api/auth/me');
      if (userRes.data?.user) {
        useAuthStore.getState().login(userRes.data.user);
      }
      setShowTradePanel(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Execution failed. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className={cn(
        'group bg-white dark:bg-groww-card rounded-2xl border overflow-hidden transition-all duration-300',
        'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700',
        'hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 flex flex-col justify-between'
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="p-4 sm:p-5">
        {/* Top row: symbol + action badge + confidence */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
              <Flame className="w-5 h-5 text-green-500 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{rec.symbol}</h3>
                <span className={cn(
                  'px-2 py-0.5 rounded-md text-[10px] font-black uppercase border tracking-wider',
                  action.bg, action.color
                )}>
                  {action.label}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{rec.name}</p>
            </div>
          </div>
          <ConfidenceRing value={rec.confidence} />
        </div>

        {/* Pricing levels summary */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2 border border-gray-100/50 dark:border-gray-800/50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Entry</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
              ₹{entryPrice.toLocaleString()}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg px-3 py-2 border border-green-100/20 dark:border-green-900/20">
            <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
              <Target className="w-2.5 h-2.5" /> Target
            </p>
            <p className="text-xs font-bold text-green-700 dark:text-green-400 tabular-nums">
              ₹{targetPrice.toLocaleString()}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/10 rounded-lg px-3 py-2 border border-red-100/20 dark:border-red-900/20">
            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
              <ShieldAlert className="w-2.5 h-2.5" /> Stop Loss
            </p>
            <p className="text-xs font-bold text-red-700 dark:text-red-400 tabular-nums">
              ₹{stopLoss.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Pre-calculated stats and signals */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
            <Clock className="w-2.5 h-2.5" /> {rec.timeframe}
          </span>
          <span className={cn(
            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
            +riskReward >= 1.5 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
          )}>
            R:R {riskReward}
          </span>
          <SignalChip label="RSI" value={rec.technical_signals?.rsi} />
          <SignalChip label="MACD" value={rec.technical_signals?.macd} />
          <SignalChip label="ST" value={rec.technical_signals?.supertrend} />
          {rec.technical_signals?.breakout_signal && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold">
              Breakout: {rec.technical_signals.breakout_signal}
            </span>
          )}
        </div>

        {/* Catalysts */}
        {rec.catalysts && rec.catalysts.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {rec.catalysts.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                <Zap className="w-2.5 h-2.5" /> {c}
              </span>
            ))}
          </div>
        )}

        {/* Expand reasoning */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-xs font-semibold text-groww-primary hover:text-green-600 transition-colors mt-1"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide Analysis' : 'View AI Analysis'}
        </button>

        {expanded && (
          <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50">
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
              {rec.reasoning}
            </p>
          </div>
        )}
      </div>

      {/* Trade execution actions drawer */}
      <div className="border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/20 p-4">
        {!showTradePanel ? (
          <button
            onClick={() => setShowTradePanel(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-xs transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Quick Setup Trade
          </button>
        ) : (
          <div className="space-y-4 animate-fadeIn">
            {/* Drawer Header */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">Quick Trade Bracket Setup</span>
              <button
                onClick={() => setShowTradePanel(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
              >
                Cancel
              </button>
            </div>

            {/* CNC/MIS toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200/40 dark:border-gray-800/40">
              <button
                onClick={() => setProductType('MIS')}
                className={cn(
                  'flex-1 py-1 text-[10px] font-bold rounded-md transition-all',
                  productType === 'MIS'
                    ? 'bg-white dark:bg-gray-700 text-green-500 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                Intraday (MIS 5x)
              </button>
              <button
                onClick={() => setProductType('CNC')}
                className={cn(
                  'flex-1 py-1 text-[10px] font-bold rounded-md transition-all',
                  productType === 'CNC'
                    ? 'bg-white dark:bg-gray-700 text-green-500 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                Delivery (CNC 1x)
              </button>
            </div>

            {/* Dynamic details editing */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Limit Entry Price</label>
                <input
                  type="number"
                  step="0.05"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(+e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Suggested Qty</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Take Profit Target</label>
                <input
                  type="number"
                  step="0.05"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(+e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Stop Loss Leg</label>
                <input
                  type="number"
                  step="0.05"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(+e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-bold tabular-nums"
                />
              </div>
            </div>

            {/* Capital allocation slider */}
            <div className="space-y-1.5 bg-white dark:bg-groww-dark/30 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/60">
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold text-gray-400 uppercase tracking-wide">Capital Allocation</span>
                <span className="font-black text-green-500 tabular-nums">{allocationPct}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={allocationPct}
                onChange={(e) => setAllocationPct(parseInt(e.target.value))}
                className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-400 tabular-nums">
                <span>Allocated Cash: ₹{allocatedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="flex items-center gap-0.5"><Wallet className="w-2.5 h-2.5 text-gray-500" /> Bal: ₹{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1 text-[11px] text-gray-500 dark:text-gray-400 pt-1">
              <div className="flex justify-between">
                <span>Total Trade Value</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">₹{(entryPrice * quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">Blocked Margin {productType === 'MIS' && <span className="cursor-help" title="5x Intraday Leverage applied"><Info className="w-3 h-3 text-gray-400 shrink-0" /></span>}</span>
                <span className="font-extrabold text-green-500">₹{requiredMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleQuickExecute}
              disabled={isExecuting}
              className={cn(
                'w-full py-2.5 rounded-xl font-bold text-xs text-white transition flex items-center justify-center gap-1.5 shadow-md',
                isExecuting ? 'opacity-65 cursor-not-allowed' : '',
                isMarketClosed ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'
              )}
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Executing Order...
                </>
              ) : isMarketClosed ? (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  Queue Bracket Order (AMO)
                </>
              ) : (
                <>
                  <Landmark className="w-3.5 h-3.5" />
                  Quick Execute Bracket Order
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Global Cue Card ─────────────────────────────────────────────────────────
function GlobalCueCard({ cue }: { cue: GlobalCue }) {
  const isUp = cue.change_percent >= 0;
  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 min-w-[140px] shrink-0 hover:border-gray-200 dark:hover:border-gray-700 transition">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{cue.name}</p>
      <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums mt-0.5">
        {cue.price > 0 ? cue.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
      </p>
      {cue.price > 0 && (
        <div className={cn('flex items-center gap-0.5 text-[11px] font-semibold mt-0.5', isUp ? 'text-green-500' : 'text-red-500')}>
          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          <span>{isUp ? '+' : ''}{cue.change_percent?.toFixed(2)}%</span>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      <div className="h-48 rounded-2xl bg-gray-200 dark:bg-gray-800" />
      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 w-36 rounded-xl bg-gray-200 dark:bg-gray-800 shrink-0" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-64 rounded-2xl bg-gray-200 dark:bg-gray-800" />)}
      </div>
    </div>
  );
}

// ── History Mini Card ───────────────────────────────────────────────────────
function HistoryCard({ item, onClick }: { item: HistoryItem; onClick: () => void }) {
  const s = sentimentConfig[item.market_sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;
  const Icon = s.icon;
  const d = new Date(item.date + 'T00:00:00+05:30');

  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition p-3 text-left min-w-[180px] shrink-0"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('w-3.5 h-3.5', s.color)} />
        <span className={cn('text-[10px] font-bold uppercase', s.color)}>{s.label}</span>
      </div>
      <p className="text-xs font-bold text-gray-900 dark:text-white">
        {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
        {item.recommendations.length} picks · {item.summary.slice(0, 60)}…
      </p>
    </button>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function DailyRecommendationsPage() {
  const [data, setData] = useState<DailyData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [todayRes, historyRes] = await Promise.all([
        axios.get('/api/recommendations/today'),
        axios.get('/api/recommendations/history', { params: { days: 14 } }),
      ]);
      setData(todayRes.data);
      setHistory(historyRes.data || []);
      
      // Sync global user available cash balance
      const userRes = await axios.get('/api/auth/me');
      if (userRes.data?.user) {
        useAuthStore.getState().login(userRes.data.user);
      }
      toast.success('Picks refreshed successfully!');
    } catch {
      toast.error('Failed to refresh picks');
    } finally {
      setRefreshing(false);
    }
  };

  // Retrieve user available balance to render in header summary
  const balance = useAuthStore((s) => s.user?.balance || 0);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const [todayRes, historyRes] = await Promise.all([
          axios.get('/api/recommendations/today'),
          axios.get('/api/recommendations/history', { params: { days: 14 } }),
        ]);
        setData(todayRes.data);
        setHistory(historyRes.data || []);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await axios.post('/api/recommendations/generate');
      if (res.data?.data) {
        setData(res.data.data);
      }
      const todayRes = await axios.get('/api/recommendations/today');
      setData(todayRes.data);
      toast.success('Generated recommendations successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to trigger recommendation generation');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <PageSkeleton />;

  const sentiment = data
    ? sentimentConfig[data.market_sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral
    : sentimentConfig.neutral;
  const SentIcon = sentiment.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark">
      <div className="max-w-5xl mx-auto px-4 py-6">
        
        {/* ── Hero / Market Pulse ── */}
        <div className="relative mb-6 rounded-2xl overflow-hidden shadow-lg border border-white/10">
          <div className={cn('absolute inset-0 bg-gradient-to-br transition-all duration-300', data ? sentiment.gradient : 'from-gray-600 to-gray-700')} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.08),transparent_60%)]" />
          
          {/* Live pulse indicator — hidden on mobile to avoid overlapping the title */}
          <div className="hidden sm:flex absolute top-4 right-4 items-center gap-2 bg-black/15 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[9px] text-white font-bold uppercase tracking-wider">AI RECOMMENDATIONS ENGINE</span>
          </div>

          <div className="relative px-4 py-6 sm:px-8 sm:py-10">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/20 shrink-0">
                <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
                  Daily Picks
                  <span className="px-2 py-0.5 rounded-full bg-green-500 text-[9px] font-black uppercase tracking-widest">Momentum Playbook</span>
                </h1>
                {data ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2">
                      <div className={cn('flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black border uppercase backdrop-blur-sm', sentiment.bg)}>
                        <SentIcon className={cn('w-3.5 h-3.5', sentiment.color)} />
                        <span className={sentiment.color}>{sentiment.label} Pulse</span>
                      </div>
                      <span className="text-[11px] text-white/70 font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-white/60" /> {formatDateLong(data.date)}
                      </span>
                      <span className="text-[11px] text-white/50">·</span>
                      <span className="text-[11px] text-white/70 font-semibold flex items-center gap-1">
                        <Wallet className="w-3 h-3 text-white/60" /> Cash: ₹{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <p className="text-sm text-green-50/90 mt-3 leading-relaxed max-w-xl font-medium">
                      {data.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-4 text-[10px] text-white/60 font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Updated {formatGenTime(data.generated_at)}</span>
                      <span>·</span>
                      <span>{data.recommendations.length} momentum picks</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Claude AI Engine</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-white/60 mt-2">
                    No recommendations available yet. Check back before market open!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Global Cues ── */}
        {data && data.global_cues && data.global_cues.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-gray-500" />
              Global Cues
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
              {data.global_cues.map(cue => (
                <GlobalCueCard key={cue.symbol} cue={cue} />
              ))}
            </div>
          </div>
        )}

        {/* ── Stock Picks ── */}
        {data && data.recommendations.length > 0 ? (
          <div className="mb-6 animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-green-500" />
                Breakout Recommendations ({data.recommendations.length})
              </h2>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-groww-card hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-[10px] uppercase border border-gray-100 dark:border-gray-800/80 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3 h-3 text-green-500', refreshing && 'animate-spin')} />
                {refreshing ? 'Refreshing…' : 'Refresh Picks'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.recommendations.map((rec, i) => (
                <StockPickCard key={rec.symbol} rec={rec} index={i} />
              ))}
            </div>
          </div>
        ) : !data ? (
          <div className="text-center py-16 bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 mb-6">
            <div className="text-5xl mb-3">⚡</div>
            <p className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
              No Recommendations Yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
              AI-powered stock picks are generated daily by 9:00 AM IST before market open. Check back soon!
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-groww-primary text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', generating && 'animate-spin')} />
              {generating ? 'Generating…' : 'Generate Now'}
            </button>
          </div>
        ) : null}

        {/* ── Historical Picks ── */}
        {history.length > 1 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              Past Recommendations
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
              {history.slice(1).map(item => (
                <HistoryCard
                  key={item.date}
                  item={item}
                  onClick={() => {
                    axios.get(`/api/recommendations/${item.date}`).then(res => {
                      if (res.data) setData(res.data);
                    });
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Disclaimer ── */}
        <div className="px-4 py-3 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100/60 dark:border-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Paper Trading Mode Only — Simulated Trades
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5 leading-relaxed">
                These AI-generated recommendations are for educational paper trading purposes on Paper Portfolio.
                Trades are simulated without financial risk. Do not trade real money based on these recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
