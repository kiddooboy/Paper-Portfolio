import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, X, ExternalLink, Zap, ShieldAlert, Target } from 'lucide-react';
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
  pubDate: string;
  link: string;
  publisher: string;
}

interface GroupedItem {
  stock: string;
  action: 'BUY' | 'SELL';
  items: ActionItem[];
  topImpact: number;
  avgConfidence: number;
  currentPrice: number | null;
}

interface Props {
  symbols: string[];
}

const API_BASE = import.meta.env.VITE_API_URL || '';

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

function GroupedModal({ group, onClose }: { group: GroupedItem; onClose: () => void }) {
  const isBuy = group.action === 'BUY';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-groww-card rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn('px-5 pt-5 pb-4 flex items-center justify-between shrink-0', isBuy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20')}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-extrabold tracking-tight">{group.stock}</span>
            <span className={cn('flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold', isBuy ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
              {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {group.action}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {group.items.length} signal{group.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 pt-4 pb-2 grid grid-cols-2 gap-2 shrink-0">
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Top Impact</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{group.topImpact}<span className="text-xs font-normal text-gray-400">/100</span></p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Avg Confidence</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{Math.round(group.avgConfidence * 100)}%</p>
          </div>
        </div>

        {/* Scrollable signals */}
        <div className="overflow-y-auto px-5 pb-4 space-y-3 flex-1">
          {group.items.map((item, i) => (
            <div
              key={item.id}
              className={cn('rounded-xl border p-4 space-y-2.5', isBuy ? 'border-green-100 dark:border-green-900/40 bg-green-50/40 dark:bg-green-900/10' : 'border-red-100 dark:border-red-900/40 bg-red-50/40 dark:bg-red-900/10')}
            >
              {/* Bullet + title */}
              <div className="flex gap-2 items-start">
                <span className={cn('mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', isBuy ? 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300' : 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300')}>
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{item.cleanTitle || item.headline}</p>
              </div>

              {/* Summary */}
              {item.summary && (
                <div className="flex gap-2 pl-7">
                  <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{item.summary}</p>
                </div>
              )}

              {/* AI action */}
              <div className="flex gap-2 pl-7">
                <Zap className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', isBuy ? 'text-green-500' : 'text-red-500')} />
                <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">{item.userAction}</p>
              </div>

              {/* Risk */}
              {item.risk && (
                <div className="flex gap-2 pl-7">
                  <ShieldAlert className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">{item.risk}</p>
                </div>
              )}

              {/* Source link */}
              <div className="flex items-center justify-between pl-7 pt-0.5">
                <span className="text-[10px] text-gray-400">{item.publisher} · {formatDate(item.pubDate)}</span>
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-600 font-medium">
                  Read <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-4 pt-1 shrink-0 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[10px] text-gray-400 text-center">For educational purposes only · Not financial advice</p>
        </div>
      </div>
    </div>
  );
}

function groupByStock(items: ActionItem[]): GroupedItem[] {
  const map = new Map<string, ActionItem[]>();
  for (const item of items) {
    const existing = map.get(item.stock) ?? [];
    existing.push(item);
    map.set(item.stock, existing);
  }

  return Array.from(map.entries()).map(([stock, stockItems]) => {
    const buyScore = stockItems.filter(i => i.action === 'BUY').reduce((s, i) => s + i.impactScore, 0);
    const sellScore = stockItems.filter(i => i.action === 'SELL').reduce((s, i) => s + i.impactScore, 0);
    return {
      stock,
      action: (buyScore >= sellScore ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
      items: stockItems.sort((a, b) => b.impactScore - a.impactScore),
      topImpact: Math.max(...stockItems.map(i => i.impactScore)),
      avgConfidence: stockItems.reduce((s, i) => s + i.confidence, 0) / stockItems.length,
      currentPrice: stockItems[0].currentPrice,
    };
  }).sort((a, b) => b.topImpact - a.topImpact);
}

export default function ActionCards({ symbols }: Props) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GroupedItem | null>(null);

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

  const groups = groupByStock(items);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!groups.length) return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-500" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI Trading Signals</h3>
      </div>
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-6 text-center text-xs text-gray-400">
        No signals found for current stocks
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI Trading Signals</h3>
          <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
            {groups.length} stock{groups.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-2">
          {groups.map(group => {
            const isBuy = group.action === 'BUY';
            return (
              <button
                key={group.stock}
                onClick={() => setSelected(group)}
                className={cn(
                  'w-full rounded-2xl border p-3.5 text-left transition-all hover:shadow-md hover:-translate-y-0.5',
                  isBuy
                    ? 'bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800 hover:border-green-400'
                    : 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800 hover:border-red-400'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{group.stock}</span>
                  <div className="flex items-center gap-1.5">
                    {group.items.length > 1 && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                        {group.items.length} signals
                      </span>
                    )}
                    <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold', isBuy ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
                      {isBuy ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {group.action}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug line-clamp-2 mb-2.5">
                  {group.items[0].cleanTitle || group.items[0].headline}
                </p>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <ImpactBar score={group.topImpact} />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{Math.round(group.avgConfidence * 100)}% conf</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <GroupedModal group={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
