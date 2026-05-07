import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, X, ExternalLink, Zap, ShieldAlert, Target, IndianRupee } from 'lucide-react';
import { cn } from '../lib/utils';

interface ActionItem {
  id: string;
  stock: string;
  action: 'BUY' | 'SELL';
  headline: string;
  cleanTitle: string;
  summary: string;
  risk: string;
  userAction: string;
  sentiment: string;
  confidence: number;
  impactScore: number;
  currentPrice: number | null;
  suggestedQty: number | null;
  suggestedAmount: number;
  pubDate: string;
  link: string;
  publisher: string;
}

interface Props {
  symbols: string[];
}

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatPrice(p: number | null) {
  if (p == null) return '—';
  return `₹${p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ImpactBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-orange-500' : score >= 40 ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums w-6 text-right">{score}</span>
    </div>
  );
}

function ActionModal({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const isBuy = item.action === 'BUY';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-groww-card rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn('px-5 pt-5 pb-4 flex items-start justify-between', isBuy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20')}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-extrabold tracking-tight">{item.stock}</span>
              <span className={cn('flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold', isBuy ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
                {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {item.action}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 leading-snug line-clamp-2">{item.cleanTitle}</p>
          </div>
          <button onClick={onClose} className="ml-3 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Quantity card */}
          <div className={cn('rounded-xl p-4 flex items-center gap-4 border', isBuy ? 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10')}>
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', isBuy ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40')}>
              <span className={cn('text-2xl font-black', isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                {item.suggestedQty ?? '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className={cn('text-sm font-bold', isBuy ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
                {isBuy ? 'Shares to Buy' : 'Shares to Sell'}
              </p>
              {item.currentPrice && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.suggestedQty ? `${item.suggestedQty} × ${formatPrice(item.currentPrice)} = ` : ''}<span className="font-semibold text-gray-700 dark:text-gray-200">₹{item.suggestedAmount.toLocaleString('en-IN')}</span> suggested
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-0.5">Based on ₹10,000 × {item.impactScore}% impact × {Math.round(item.confidence * 100)}% confidence</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Impact</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{item.impactScore}</p>
              <p className="text-[10px] text-gray-400">/ 100</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Confidence</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{Math.round(item.confidence * 100)}%</p>
              <p className="text-[10px] text-gray-400">AI score</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Price</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{formatPrice(item.currentPrice)}</p>
              <p className="text-[10px] text-gray-400">current</p>
            </div>
          </div>

          {/* Summary */}
          {item.summary && (
            <div className="flex gap-2.5">
              <Target className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Summary</p>
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{item.summary}</p>
              </div>
            </div>
          )}

          {/* AI Action */}
          <div className="flex gap-2.5">
            <Zap className={cn('w-4 h-4 shrink-0 mt-0.5', isBuy ? 'text-green-500' : 'text-red-500')} />
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">AI Recommendation</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{item.userAction}</p>
            </div>
          </div>

          {/* Risk */}
          {item.risk && (
            <div className="flex gap-2.5">
              <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Risk</p>
                <p className="text-sm text-orange-700 dark:text-orange-300 leading-relaxed">{item.risk}</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[11px] text-gray-400">{item.publisher} · {formatDate(item.pubDate)}</span>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Read article <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            For educational purposes only · Not financial advice
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ActionCards({ symbols }: Props) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActionItem | null>(null);

  const fetchActions = useCallback(async () => {
    if (!symbols.length) { setLoading(false); return; }
    setLoading(true);
    try {
      const url = `${API_BASE}/api/news/actions?symbols=${symbols.map(encodeURIComponent).join(',')}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(await res.json());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [symbols.join(',')]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="shrink-0 w-52 h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI Trading Signals</h3>
          <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
            {items.length} signal{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {items.map(item => {
            const isBuy = item.action === 'BUY';
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={cn(
                  'shrink-0 w-52 rounded-2xl border p-3.5 text-left transition-all hover:shadow-md hover:-translate-y-0.5',
                  isBuy
                    ? 'bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800 hover:border-green-400'
                    : 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800 hover:border-red-400'
                )}
              >
                {/* Stock + action badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{item.stock}</span>
                  <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold', isBuy ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
                    {isBuy ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {item.action}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug line-clamp-2 mb-2.5">
                  {item.cleanTitle || item.headline}
                </p>

                {/* Impact bar */}
                <ImpactBar score={item.impactScore} />

                {/* Qty hint */}
                <div className={cn('mt-2 flex items-center gap-1 text-[11px] font-semibold', isBuy ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
                  <IndianRupee className="w-3 h-3" />
                  {item.suggestedQty != null
                    ? `${item.suggestedQty} share${item.suggestedQty !== 1 ? 's' : ''}`
                    : `₹${item.suggestedAmount.toLocaleString('en-IN')}`}
                  <span className="text-gray-400 font-normal ml-auto">{Math.round(item.confidence * 100)}% conf</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <ActionModal item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
