import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bot, Zap, Plus, Trash2, Play, Pause,
  TrendingUp, TrendingDown, BarChart3, History,
  ChevronRight, AlertTriangle, Sparkles, RefreshCw,
  CircleDollarSign, ShieldCheck, Gauge,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import StockLogo from '../components/StockLogo';

// ── Types ────────────────────────────────────────────────────────────────────
type RiskLevel = 'conservative' | 'moderate' | 'aggressive';
interface AiConfig {
  user_id: number; is_enabled: number; allocation_pct: number;
  risk_level: RiskLevel; max_positions: number;
}
interface Strategy {
  id: number; name: string; symbol: string; product_type: string;
  entry_conditions: any[]; exit_conditions: any; quantity: number;
  is_active: number; trades_count: number; pnl: number;
  created_at: string; last_triggered_at: string | null;
}
interface AlgoTrade {
  id: number; symbol: string; action: string; quantity: number;
  price: number; pnl: number; source: string; reason: string;
  executed_at: string; strategy_name?: string;
}
interface AiPick {
  symbol: string; price: number; change_percent: number;
  score: number; reasons: string[];
}

const INDICATOR_OPTIONS = ['RSI', 'MACD', 'EMA(9)', 'EMA(21)', 'MA(20)', 'MA(50)', 'BB Upper', 'BB Lower', 'Price', 'Volume'];
const OPERATORS = ['>', '<', '>=', '<=', 'crosses above', 'crosses below'];
const RISK_LABELS: Record<RiskLevel, { label: string; desc: string; color: string }> = {
  conservative: { label: 'Conservative', desc: 'Low risk, focus on stable large-caps', color: 'text-blue-600 dark:text-blue-400' },
  moderate:     { label: 'Moderate',     desc: 'Balanced risk/reward',                color: 'text-amber-600 dark:text-amber-400' },
  aggressive:   { label: 'Aggressive',   desc: 'Higher risk for higher potential',     color: 'text-red-600 dark:text-red-400'    },
};

// ── Create Strategy Modal ────────────────────────────────────────────────────
function CreateStrategyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Strategy) => void }) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('1');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [entryConditions, setEntryConditions] = useState([{ indicator: 'RSI', operator: '<', value: '30' }]);
  const [exitTp, setExitTp] = useState('5');
  const [exitSl, setExitSl] = useState('2');
  const [saving, setSaving] = useState(false);

  const addCondition = () => setEntryConditions(c => [...c, { indicator: 'Price', operator: '>', value: '' }]);
  const removeCondition = (i: number) => setEntryConditions(c => c.filter((_, j) => j !== i));
  const updateCond = (i: number, field: string, val: string) =>
    setEntryConditions(c => c.map((row, j) => j === i ? { ...row, [field]: val } : row));

  const save = async () => {
    if (!name.trim() || !symbol.trim()) { toast.error('Name and symbol are required'); return; }
    setSaving(true);
    try {
      const res = await axios.post('/api/algo/strategies', {
        name, symbol, product_type: productType,
        quantity: parseInt(qty) || 1,
        entry_conditions: entryConditions,
        exit_conditions: { take_profit_pct: parseFloat(exitTp) || 5, stop_loss_pct: parseFloat(exitSl) || 2 },
      });
      toast.success('Strategy created');
      onCreated(res.data);
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to create strategy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-base flex items-center gap-2"><Zap className="w-4 h-4 text-groww-primary" />New Strategy</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Strategy Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RSI Oversold"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Symbol</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. RELIANCE"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Quantity</label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Product Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                {(['CNC', 'MIS'] as const).map(pt => (
                  <button key={pt} onClick={() => setProductType(pt)}
                    className={cn('flex-1 py-2 transition', productType === pt ? 'bg-groww-primary text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                    {pt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Entry Conditions (all must be true)</label>
              <button onClick={addCondition} className="text-[11px] text-groww-primary hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" />Add</button>
            </div>
            <div className="space-y-2">
              {entryConditions.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={c.indicator} onChange={e => updateCond(i, 'indicator', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none">
                    {INDICATOR_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCond(i, 'operator', e.target.value)}
                    className="w-32 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none">
                    {OPERATORS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <input value={c.value} onChange={e => updateCond(i, 'value', e.target.value)} placeholder="Value"
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:outline-none" />
                  {entryConditions.length > 1 && (
                    <button onClick={() => removeCondition(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Take Profit (%)</label>
              <input type="number" value={exitTp} onChange={e => setExitTp(e.target.value)} min="0" step="0.5"
                className="w-full px-3 py-2 rounded-lg border border-green-300 dark:border-green-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Stop Loss (%)</label>
              <input type="number" value={exitSl} onChange={e => setExitSl(e.target.value)} min="0" step="0.5"
                className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-groww-primary text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60">
            {saving ? 'Creating…' : 'Create Strategy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AlgoTradePage() {
  const [tab, setTab] = useState<'overview' | 'strategies' | 'ai' | 'log'>('overview');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [trades, setTrades] = useState<AlgoTrade[]>([]);
  const [aiPicks, setAiPicks] = useState<AiPick[]>([]);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, cRes, tRes] = await Promise.all([
          axios.get('/api/algo/strategies'),
          axios.get('/api/algo/ai-config'),
          axios.get('/api/algo/trades?limit=20'),
        ]);
        setStrategies(sRes.data);
        setAiConfig(cRes.data);
        setTrades(tRes.data);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const toggleStrategy = async (id: number) => {
    try {
      const res = await axios.post(`/api/algo/strategies/${id}/toggle`);
      setStrategies(prev => prev.map(s => s.id === id ? { ...s, is_active: res.data.is_active } : s));
    } catch { toast.error('Failed to toggle strategy'); }
  };

  const deleteStrategy = async (id: number) => {
    try {
      await axios.delete(`/api/algo/strategies/${id}`);
      setStrategies(prev => prev.filter(s => s.id !== id));
      toast.success('Strategy deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const updateAiConfig = async (patch: Partial<AiConfig>) => {
    try {
      const res = await axios.put('/api/algo/ai-config', patch);
      setAiConfig(res.data);
    } catch { toast.error('Failed to save config'); }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await axios.post('/api/algo/ai-scan');
      setAiPicks(res.data.picks ?? []);
      toast.success(`AI scan complete — ${res.data.picks.length} picks found`);
    } catch { toast.error('AI scan failed'); }
    finally { setScanning(false); }
  };

  const executeAll = async () => {
    if (!aiPicks.length) { toast.error('Run a scan first'); return; }
    setExecuting(true);
    try {
      const res = await axios.post('/api/algo/ai-execute', { picks: aiPicks });
      toast.success(`AI executed ${res.data.count} orders`);
      setAiPicks([]);
      const tRes = await axios.get('/api/algo/trades?limit=20');
      setTrades(tRes.data);
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Execution failed'); }
    finally { setExecuting(false); }
  };

  const activeCount = strategies.filter(s => s.is_active).length;
  const totalPnl    = trades.reduce((s, t) => s + t.pnl, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-groww-primary" /> Algo Trade
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Build strategies · Let AI trade for you · Track everything</p>
        </div>
        {tab === 'strategies' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-groww-primary text-white text-sm font-semibold hover:brightness-110 transition">
            <Plus className="w-4 h-4" /> New Strategy
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-xl w-fit flex-wrap">
        {([
          { id: 'overview',    label: 'Overview',    Icon: BarChart3  },
          { id: 'strategies',  label: 'Strategies',  Icon: Zap        },
          { id: 'ai',          label: 'AI Trader',   Icon: Bot        },
          { id: 'log',         label: 'Trade Log',   Icon: History    },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition',
              tab === id ? 'bg-white dark:bg-groww-card shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Active Strategies', value: String(activeCount), Icon: Zap, color: 'text-groww-primary bg-green-50 dark:bg-green-900/20' },
              { label: 'Total Strategies',  value: String(strategies.length), Icon: BarChart3, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
              { label: 'AI Trades',         value: String(trades.filter(t => t.source === 'ai').length), Icon: Bot, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
              { label: 'Total P&L',         value: (totalPnl >= 0 ? '+' : '') + formatCurrency(totalPnl), Icon: CircleDollarSign, color: totalPnl >= 0 ? 'text-gain bg-green-50 dark:bg-green-900/20' : 'text-loss bg-red-50 dark:bg-red-900/20' },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color.split(' ').slice(1).join(' '))}>
                    <Icon className={cn('w-4 h-4', color.split(' ')[0])} />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{label}</span>
                </div>
                <p className={cn('text-xl font-bold', color.split(' ')[0])}>{value}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => setTab('strategies')}
              className="group bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5 text-left hover:border-groww-primary/40 transition">
              <Zap className="w-6 h-6 text-groww-primary mb-3" />
              <p className="font-semibold">Build a Strategy</p>
              <p className="text-sm text-gray-500 mt-0.5">Define entry/exit rules based on technical indicators</p>
              <div className="flex items-center gap-1 mt-3 text-groww-primary text-xs font-semibold">Create <ChevronRight className="w-3.5 h-3.5" /></div>
            </button>
            <button onClick={() => { setTab('ai'); }}
              className="group bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5 text-left hover:border-purple-400/40 transition">
              <Bot className="w-6 h-6 text-purple-500 mb-3" />
              <p className="font-semibold">Enable AI Trader</p>
              <p className="text-sm text-gray-500 mt-0.5">Let our AI scan and trade top-performing NIFTY50 stocks</p>
              <div className={cn('flex items-center gap-1 mt-3 text-xs font-semibold', aiConfig?.is_enabled ? 'text-gain' : 'text-gray-400')}>
                {aiConfig?.is_enabled ? 'Active' : 'Set up'} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>
            <button onClick={() => setTab('log')}
              className="group bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-5 text-left hover:border-blue-400/40 transition">
              <History className="w-6 h-6 text-blue-500 mb-3" />
              <p className="font-semibold">Trade Log</p>
              <p className="text-sm text-gray-500 mt-0.5">Review all AI and strategy-driven trades</p>
              <div className="flex items-center gap-1 mt-3 text-blue-500 text-xs font-semibold">{trades.length} trades <ChevronRight className="w-3.5 h-3.5" /></div>
            </button>
          </div>

          {/* How it works */}
          <div className="bg-gradient-to-br from-groww-primary/5 to-purple-500/5 rounded-2xl border border-groww-primary/20 p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-groww-primary" />How Algo Trade Works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {[
                { step: '1', title: 'Define Rules', desc: 'Set entry/exit conditions using RSI, MACD, moving averages, and price levels.' },
                { step: '2', title: 'AI Scans Market', desc: 'Our AI scores stocks based on momentum, volume, and proximity to key levels.' },
                { step: '3', title: 'Auto Execute',   desc: 'Once you approve, the AI places orders using your allocated wallet balance.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-groww-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</span>
                  <div><p className="font-semibold">{title}</p><p className="text-gray-500 text-xs mt-0.5">{desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STRATEGIES ── */}
      {tab === 'strategies' && (
        <div className="space-y-3">
          {strategies.length === 0 ? (
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center py-16 gap-3">
              <Zap className="w-10 h-10 text-gray-200 dark:text-gray-700" />
              <p className="font-semibold text-gray-500">No strategies yet</p>
              <p className="text-sm text-gray-400">Click "New Strategy" to build your first algo strategy</p>
              <button onClick={() => setShowCreate(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-groww-primary text-white text-sm font-semibold">
                + Create Strategy
              </button>
            </div>
          ) : (
            strategies.map(s => (
              <div key={s.id} className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <StockLogo symbol={s.symbol} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{s.name}</p>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                          s.is_active ? 'bg-green-100 dark:bg-green-900/30 text-gain' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                          {s.is_active ? 'Active' : 'Paused'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{s.product_type}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.symbol} · {s.quantity} shares · {s.entry_conditions.length} condition{s.entry_conditions.length !== 1 ? 's' : ''}
                      </p>
                      {s.entry_conditions.length > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1 font-mono">
                          {s.entry_conditions.map(c => `${c.indicator} ${c.operator} ${c.value}`).join(' AND ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className={cn('text-xs font-semibold', s.pnl >= 0 ? 'text-gain' : 'text-loss')}>
                        {s.pnl >= 0 ? '+' : ''}{formatCurrency(s.pnl)}
                      </p>
                      <p className="text-[10px] text-gray-400">{s.trades_count} trades</p>
                    </div>
                    <button onClick={() => toggleStrategy(s.id)} title={s.is_active ? 'Pause' : 'Activate'}
                      className={cn('p-2 rounded-lg transition', s.is_active ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100' : 'text-groww-primary bg-green-50 dark:bg-green-900/20 hover:bg-green-100')}>
                      {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <Link to={`/terminal/${s.symbol}?fullscreen=1`} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg text-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 transition">
                      <TrendingUp className="w-4 h-4" />
                    </Link>
                    <button onClick={() => deleteStrategy(s.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {s.exit_conditions && (
                  <div className="mt-3 flex gap-3 text-[11px]">
                    <span className="text-gain flex items-center gap-1"><TrendingUp className="w-3 h-3" />TP: +{s.exit_conditions.take_profit_pct}%</span>
                    <span className="text-loss flex items-center gap-1"><TrendingDown className="w-3 h-3" />SL: -{s.exit_conditions.stop_loss_pct}%</span>
                    {s.last_triggered_at && <span className="text-gray-400">Last: {new Date(s.last_triggered_at).toLocaleDateString('en-IN')}</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── AI TRADER ── */}
      {tab === 'ai' && aiConfig && (
        <div className="space-y-4">
          {/* Master toggle */}
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold flex items-center gap-2"><Bot className="w-5 h-5 text-purple-500" />AI Auto-Trader</h3>
                <p className="text-sm text-gray-500 mt-0.5">Autonomously scans NIFTY50 and places orders using your wallet</p>
              </div>
              <button
                onClick={() => updateAiConfig({ is_enabled: aiConfig.is_enabled ? 0 : 1 })}
                className={cn('relative w-14 h-7 rounded-full transition-colors', aiConfig.is_enabled ? 'bg-groww-primary' : 'bg-gray-200 dark:bg-gray-700')}
              >
                <div className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all', aiConfig.is_enabled ? 'left-7' : 'left-0.5')} />
              </button>
            </div>

            <div className={cn('rounded-xl px-4 py-3 mb-4 flex items-start gap-2 text-sm',
              aiConfig.is_enabled ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700')}>
              <Sparkles className={cn('w-4 h-4 shrink-0 mt-0.5', aiConfig.is_enabled ? 'text-gain' : 'text-gray-400')} />
              <span className={aiConfig.is_enabled ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}>
                {aiConfig.is_enabled ? 'AI Trader is active. It will scan and execute trades on demand.' : 'AI Trader is paused. Enable to allow autonomous trading.'}
              </span>
            </div>

            {/* Config grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Allocation */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 block flex items-center gap-1">
                  <CircleDollarSign className="w-3 h-3" />Allocation (% of balance)
                </label>
                <input type="range" min="1" max="50" step="1"
                  value={aiConfig.allocation_pct}
                  onChange={e => updateAiConfig({ allocation_pct: parseFloat(e.target.value) })}
                  className="w-full accent-groww-primary" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1%</span>
                  <span className="font-bold text-groww-primary">{aiConfig.allocation_pct}%</span>
                  <span>50%</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  ≈ {formatCurrency((user?.balance ?? 0) * aiConfig.allocation_pct / 100)} of {formatCurrency(user?.balance ?? 0)}
                </p>
              </div>

              {/* Max positions */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 block flex items-center gap-1">
                  <Gauge className="w-3 h-3" />Max Positions
                </label>
                <input type="range" min="1" max="10" step="1"
                  value={aiConfig.max_positions}
                  onChange={e => updateAiConfig({ max_positions: parseInt(e.target.value) })}
                  className="w-full accent-groww-primary" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span className="font-bold text-groww-primary">{aiConfig.max_positions} stocks</span>
                  <span>10</span>
                </div>
              </div>

              {/* Risk level */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 block flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />Risk Level
                </label>
                <div className="space-y-1.5">
                  {(['conservative', 'moderate', 'aggressive'] as const).map(r => {
                    const info = RISK_LABELS[r];
                    return (
                      <button key={r} onClick={() => updateAiConfig({ risk_level: r })}
                        className={cn('w-full text-left px-3 py-2 rounded-lg border transition text-xs',
                          aiConfig.risk_level === r ? 'border-groww-primary bg-groww-primary/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300')}>
                        <span className={cn('font-semibold', info.color)}>{info.label}</span>
                        <span className="text-gray-400 ml-2">{info.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* AI Scanner */}
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" />AI Market Scanner</h3>
                <p className="text-sm text-gray-500">Scans NIFTY50 for momentum opportunities right now</p>
              </div>
              <button onClick={runScan} disabled={scanning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition disabled:opacity-60">
                <RefreshCw className={cn('w-4 h-4', scanning && 'animate-spin')} />
                {scanning ? 'Scanning…' : 'Run Scan'}
              </button>
            </div>

            {aiPicks.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
                <Bot className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Click "Run Scan" to let the AI analyse the market</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <span>Stock</span><span className="text-right">Score</span><span className="text-right">Change</span><span />
                </div>
                {aiPicks.map(p => (
                  <div key={p.symbol} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center bg-gray-50 dark:bg-gray-800/40 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <StockLogo symbol={p.symbol} size={28} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{p.symbol}</p>
                        <p className="text-[10px] text-gray-400 truncate">{p.reasons[0]}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5 justify-end">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className={cn('w-2 h-4 rounded-sm', i < p.score ? 'bg-groww-primary' : 'bg-gray-200 dark:bg-gray-700')} />
                      ))}
                    </div>
                    <span className={cn('text-xs font-semibold tabular-nums', p.change_percent >= 0 ? 'text-gain' : 'text-loss')}>
                      {p.change_percent >= 0 ? '+' : ''}{p.change_percent.toFixed(2)}%
                    </span>
                    <Link to={`/terminal/${p.symbol}?fullscreen=1`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-groww-primary hover:underline font-semibold whitespace-nowrap">
                      View →
                    </Link>
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button onClick={executeAll} disabled={executing || !aiConfig.is_enabled}
                    className={cn('flex-1 py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2',
                      aiConfig.is_enabled ? 'bg-groww-primary text-white hover:brightness-110' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed')}>
                    {executing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {executing ? 'Executing…' : aiConfig.is_enabled ? `Execute All (${aiPicks.length} stocks)` : 'Enable AI Trader to execute'}
                  </button>
                </div>
                {!aiConfig.is_enabled && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Enable AI Trader above to execute these picks automatically
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-xl px-4 py-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span>This is a paper trading simulation. AI scoring is based on momentum signals and is not financial advice. All trades use virtual money only.</span>
          </div>
        </div>
      )}

      {/* ── TRADE LOG ── */}
      {tab === 'log' && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          {trades.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <History className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 font-semibold">No algo trades yet</p>
              <p className="text-sm text-gray-400">Run the AI scanner or activate a strategy to start</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                    {['Time', 'Source', 'Symbol', 'Action', 'Qty', 'Price', 'Reason'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(t.executed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          t.source === 'ai' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400')}>
                          {t.source === 'ai' ? '🤖 AI' : '⚡ Algo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StockLogo symbol={t.symbol} size={24} />
                          <Link to={`/terminal/${t.symbol}?fullscreen=1`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-groww-primary">{t.symbol}</Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded',
                          t.action === 'BUY' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss')}>
                          {t.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{t.quantity}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(t.price)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate" title={t.reason ?? undefined}>{t.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateStrategyModal
          onClose={() => setShowCreate(false)}
          onCreated={s => setStrategies(prev => [s, ...prev])}
        />
      )}
    </div>
  );
}
