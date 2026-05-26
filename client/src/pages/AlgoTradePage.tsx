import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bot, Power, ShieldAlert, Wallet, CircleDollarSign, Activity, Layers,
  Terminal, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import StockLogo from '../components/StockLogo';

// ── Types ────────────────────────────────────────────────────────────────────
type RiskLevel = 'conservative' | 'moderate' | 'aggressive';
interface AiConfig {
  is_enabled: number;
  kill_switch: number;
  allocation_pct: number;
  capital_amount: number | null;
  risk_level: RiskLevel;
  max_positions: number;
  max_daily_loss: number | null;
  max_trades_per_day: number;
  squareoff_time: string;
  session_start: string;
  session_end: string;
  min_confidence: number;
}
interface AiState {
  status: string; wallet_balance: number; active_capital: number; daily_pnl: number;
  open_trades: number; trades_today: number; max_trades_per_day: number; risk_level: string;
}
interface Position {
  id: number; symbol: string; quantity: number; entry_price: number; stop_loss: number;
  target: number; confidence: number; current_price?: number; unrealized_pnl?: number;
}
interface LogRow { id: number; level: string; agent: string | null; message: string; created_at: string; }
interface RiskProfile {
  level: string;
  label: string;
  riskPerTradePct: number;
  atrStopMult: number;
  rewardRisk: number;
  trailAtrMult: number;
  maxPositionPct: number;
  maxConcurrentRiskPct: number;
  maxPositions: number;
  maxTradesPerDay: number;
  minConfidence: number;
  fallbackStopPct: number;
}

const RISK_ORDER: RiskLevel[] = ['conservative', 'moderate', 'aggressive'];

// Console log colours — readable in both light and dark themes.
const LEVEL_STYLE: Record<string, string> = {
  info:   'text-gray-500 dark:text-gray-400',
  signal: 'text-sky-600 dark:text-sky-400',
  trade:  'text-groww-primary',
  agent:  'text-blue-600 dark:text-blue-400',
  warn:   'text-amber-600 dark:text-amber-400',
  error:  'text-loss',
};

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AlgoTradePage() {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [state, setState] = useState<AiState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, RiskProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLogId = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([
          axios.get('/api/algo/ai-config'),
          axios.get('/api/algo/ai/risk-profiles'),
        ]);
        setCfg(c.data);
        setProfiles(p.data);
      } catch {}
      setLoading(false);
    })();
  }, []);

  // ── Live polling: state, positions, console ──
  const refresh = useCallback(async () => {
    try {
      const [s, pos, log] = await Promise.all([
        axios.get('/api/algo/ai/state'),
        axios.get('/api/algo/ai/positions?status=open'),
        axios.get(`/api/algo/ai/console?since=${lastLogId.current}`),
      ]);
      setState(s.data);
      setPositions(pos.data);
      if (log.data.length) {
        lastLogId.current = log.data[log.data.length - 1].id;
        setLogs(prev => [...prev, ...log.data].slice(-300));
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Auto-scroll console to bottom on new logs
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // ── Config mutations ──
  const patch = async (p: Partial<AiConfig>) => {
    try {
      const r = await axios.put('/api/algo/ai-config', p);
      setCfg(r.data);
    } catch { toast.error('Failed to save'); }
  };

  const toggleAi = async () => {
    if (!cfg) return;
    if (!cfg.is_enabled) toast.success('AI Trade activated — the agent council is now live');
    else toast('AI Trade paused', { icon: '⏸️' });
    await patch({ is_enabled: cfg.is_enabled ? 0 : 1 } as any);
  };

  const killSwitch = async () => {
    try {
      await axios.post('/api/algo/ai/kill');
      toast.success('Kill switch engaged — all AI positions closed');
      const r = await axios.get('/api/algo/ai-config'); setCfg(r.data);
      refresh();
    } catch { toast.error('Kill switch failed'); }
  };

  if (loading || !cfg) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const enabled = !!cfg.is_enabled;
  const halted = !!cfg.kill_switch;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-4 pb-12">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm',
              enabled ? 'bg-groww-primary shadow-groww-primary/20 scale-105' : 'bg-gray-100 dark:bg-gray-800')}>
              <Bot className={cn('w-6.5 h-6.5 transition-transform duration-500', enabled ? 'text-white rotate-12' : 'text-groww-primary')} />
            </div>
            {enabled && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-gain animate-pulse ring-2 ring-white dark:ring-groww-dark" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight text-gray-900 dark:text-white">
              AI Command Center
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-groww-primary/10 text-groww-primary border border-groww-primary/20">
                Fully Autonomous
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Autonomous intraday trading bot driven by a multi-agent Claude council</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={killSwitch}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-loss/10 text-loss border border-loss/20 text-sm font-semibold hover:bg-loss/20 active:scale-95 transition-all duration-200">
            <ShieldAlert className="w-4.5 h-4.5" /> Force Kill Switch
          </button>
          <button onClick={toggleAi}
            className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all duration-200 text-white shadow-sm hover:brightness-105',
              enabled ? 'bg-gain shadow-gain/20' : 'bg-groww-primary shadow-groww-primary/20')}>
            <Power className="w-4.5 h-4.5" /> {enabled ? 'Deactivate Bot' : 'Activate Trading Bot'}
          </button>
        </div>
      </div>

      {halted && (
        <div className="flex items-center gap-2.5 text-sm bg-loss/10 border border-loss/20 text-loss rounded-xl px-4 py-3 animate-fade-in">
          <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
          <span className="font-medium">Kill switch has been engaged manually. Re-activate AI to resume autonomous trading.</span>
        </div>
      )}

      {/* ── Top stat bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={Wallet} label="Wallet Balance" value={formatCurrency(state?.wallet_balance ?? 0)} tone="default" />
        <StatCard icon={CircleDollarSign} label="Active Capital" value={formatCurrency(state?.active_capital ?? 0)} tone="primary" />
        <StatCard icon={Activity} label="Daily P&L"
          value={`${(state?.daily_pnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(state?.daily_pnl ?? 0)}`}
          tone={(state?.daily_pnl ?? 0) >= 0 ? 'gain' : 'loss'} />
        <StatCard icon={Layers} label="Open Positions" value={String(state?.open_trades ?? 0)}
          sub={`${state?.trades_today ?? 0}/${state?.max_trades_per_day ?? 0} trades today`} tone="default" />
        <AgentStatusCard status={state?.status ?? 'Off'} enabled={enabled} />
      </div>

      {/* ── Section 1: Autonomous Control Center (Full Width) ── */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5 lg:p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-gray-800 pb-3">
          <Bot className="w-5 h-5 text-groww-primary" />
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Autonomous Settings & Limits</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Col 1: Capital & Risk Selection */}
          <div className="space-y-5">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold flex items-center gap-1.5 mb-1.5">
                <CircleDollarSign className="w-3.5 h-3.5 text-groww-primary" /> Capital Allocation Limit (₹)
              </label>
              <input type="number" min={0} step={1000}
                value={cfg.capital_amount ?? ''}
                placeholder={`${Math.round((state?.wallet_balance ?? 0) * cfg.allocation_pct / 100)}`}
                onChange={e => setCfg({ ...cfg, capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
                onBlur={e => patch({ capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-3.5 py-2.5 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 transition-all duration-200 font-medium" />
              <p className="text-[10px] text-gray-500 dark:text-gray-450 mt-1.5 leading-relaxed">
                Enter flat cash cap. Leave blank to default to {cfg.allocation_pct}% of wallet. Available: {formatCurrency(state?.wallet_balance ?? 0)}
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold flex items-center gap-1.5 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-groww-primary" /> Risk Profile Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                {RISK_ORDER.map(r => {
                  const pr = profiles?.[r];
                  const active = cfg.risk_level === r;
                  return (
                    <button key={r} onClick={() => patch({ risk_level: r })}
                      className={cn('text-center rounded-xl border py-3 px-2 transition-all duration-300 flex flex-col items-center justify-center gap-1.5',
                        active
                          ? 'border-groww-primary bg-groww-primary/5 text-groww-primary shadow-sm shadow-groww-primary/5 font-bold scale-[1.02]'
                          : 'border-gray-250 dark:border-gray-800 text-gray-500 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 font-medium'
                      )}>
                      <span className="text-xs uppercase tracking-wider">{pr?.label.split(' ')[0] ?? r}</span>
                      <span className="text-[9px] opacity-80 leading-none">{pr?.minConfidence ? `Min Conf ${pr.minConfidence}%` : ''}</span>
                    </button>
                  );
                })}
              </div>
              
              {/* Profile Details Sub-Card */}
              {profiles?.[cfg.risk_level] && (
                <div className="mt-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 p-3 space-y-2 text-[11px]">
                  <div className="flex justify-between items-center text-gray-500 dark:text-gray-450">
                    <span className="font-semibold text-gray-700 dark:text-gray-350">{profiles[cfg.risk_level].label} Active Metrics</span>
                    <span className="text-[9px] uppercase font-bold text-groww-primary">Live Rules</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1.5 border-t border-gray-100 dark:border-gray-800/60 text-gray-600 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span className="opacity-80">Risk / Trade:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{profiles[cfg.risk_level].riskPerTradePct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-80">Stop Distance:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{profiles[cfg.risk_level].atrStopMult}× ATR</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-80">Reward Ratio:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{profiles[cfg.risk_level].rewardRisk}:1 RR</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-80">Trailing Stop:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{profiles[cfg.risk_level].trailAtrMult}× ATR</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="opacity-80">Max Slots & Day Limit:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{profiles[cfg.risk_level].maxPositions} open slots · {profiles[cfg.risk_level].maxTradesPerDay} max/day</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Advanced Guardrails */}
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold mb-1.5 block">Min Confidence (%)</label>
                <input type="number" min={40} max={95} step={1}
                  value={cfg.min_confidence ?? ''}
                  onChange={e => setCfg({ ...cfg, min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                  onBlur={e => patch({ min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                  className="w-full px-3.5 py-2.5 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold mb-1.5 block">Max Trades / Day</label>
                <input type="number" min={1} max={50} step={1}
                  value={cfg.max_trades_per_day ?? ''}
                  onChange={e => setCfg({ ...cfg, max_trades_per_day: e.target.value ? parseInt(e.target.value) : 10 })}
                  onBlur={e => patch({ max_trades_per_day: e.target.value ? parseInt(e.target.value) : 10 })}
                  className="w-full px-3.5 py-2.5 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold flex items-center gap-1 mb-1.5">
                Daily Realized Loss Limit (₹)
              </label>
              <input type="number" min={0} step={500}
                value={cfg.max_daily_loss ?? ''}
                placeholder="No hard limit"
                onChange={e => setCfg({ ...cfg, max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                onBlur={e => patch({ max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-3.5 py-2.5 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              <p className="text-[10px] text-gray-500 dark:text-gray-450 mt-1.5">
                Stops active bot scanner immediately if net realized losses exceed this threshold today.
              </p>
            </div>
            
            <div className="flex items-start gap-2.5 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/20 border border-gray-100 dark:border-gray-800/60 rounded-xl px-4 py-3 leading-relaxed">
              <Bot className="w-4 h-4 shrink-0 mt-0.5 text-groww-primary" />
              <span>
                Bot monitors live technical signals, evaluates them in the LLM Council, sizes trades by capital limit, and exits on target/SL rules autonomously.
              </span>
            </div>
          </div>

          {/* Col 3: Trading Sessions & Auto Square-off */}
          <div className="space-y-4">
            <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold">Intraday Trading Window</span>
                <span className="text-[10px] bg-groww-primary/10 text-groww-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">IST Time</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 dark:border-gray-850">
                <div>
                  <label className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold">Start Scanning</label>
                  <input type="time"
                    value={cfg.session_start}
                    onChange={e => setCfg({ ...cfg, session_start: e.target.value })}
                    onBlur={e => patch({ session_start: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer font-medium" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold">Stop Scanning</label>
                  <input type="time"
                    value={cfg.session_end}
                    onChange={e => setCfg({ ...cfg, session_end: e.target.value })}
                    onBlur={e => patch({ session_end: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer font-medium" />
                </div>
              </div>
            </div>

            <div className="border border-gray-150 dark:border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center gap-3">
                <div className="space-y-0.5">
                  <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-bold flex items-center gap-1">
                    Auto Square-Off Time
                  </label>
                  <p className="text-[9px] text-gray-500 leading-normal">Exit all active open positions at market price.</p>
                </div>
                <input type="time"
                  value={cfg.squareoff_time}
                  onChange={e => setCfg({ ...cfg, squareoff_time: e.target.value })}
                  onBlur={e => patch({ squareoff_time: e.target.value })}
                  className="w-28 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer font-semibold" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Active Positions (Full Width) ── */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5 lg:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-groww-primary" />
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
              Active Positions <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{positions.length}</span>
            </h2>
          </div>
          {positions.length > 0 && (
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider animate-pulse flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-groww-primary" /> Auto-monitoring target / stop levels
            </span>
          )}
        </div>

        {positions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-groww-dark/30">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No active autonomous positions</p>
            <p className="text-xs text-gray-455 dark:text-gray-500 mt-1 max-w-sm text-center">
              The AI trade bot scans the market every tick and will execute dynamic positions as qualifying setups emerge.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {positions.map(p => {
              const pnl = p.unrealized_pnl ?? 0;
              const isProfit = pnl >= 0;
              const pctPnl = p.entry_price > 0 ? (pnl / (p.entry_price * p.quantity)) * 100 : 0;
              
              return (
                <div key={p.id} 
                  className={cn(
                    'group relative rounded-2xl border p-4 transition-all duration-300 hover:shadow-md flex flex-col justify-between gap-4',
                    isProfit 
                      ? 'border-gain/10 bg-gain/[0.01] hover:border-gain/35 dark:hover:bg-gain/[0.02]' 
                      : 'border-loss/10 bg-loss/[0.01] hover:border-loss/35 dark:hover:bg-loss/[0.02]'
                  )}>
                  
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <StockLogo symbol={p.symbol} size={36} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{p.symbol}</p>
                        <span className="text-[9px] font-bold text-groww-primary bg-groww-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Confidence {p.confidence}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">Live LTP</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                        ₹{(p.current_price ?? p.entry_price).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Pricing Matrix */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-3 border-t border-gray-150 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
                    <div className="flex justify-between pr-1.5 border-r border-gray-150 dark:border-gray-800">
                      <span>Shares:</span>
                      <strong className="text-gray-800 dark:text-gray-200 tabular-nums">{p.quantity}</strong>
                    </div>
                    <div className="flex justify-between pl-1.5">
                      <span>Avg Buy:</span>
                      <strong className="text-gray-800 dark:text-gray-200 tabular-nums font-semibold text-gray-900 dark:text-white">₹{p.entry_price.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between pr-1.5 border-r border-gray-150 dark:border-gray-800">
                      <span>Stop Loss:</span>
                      <strong className="text-loss tabular-nums font-semibold">₹{p.stop_loss.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between pl-1.5">
                      <span>Target:</span>
                      <strong className="text-gain tabular-nums font-semibold">₹{p.target.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Unrealized P&L block */}
                  <div className={cn(
                    'mt-2 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-bold transition-all duration-300',
                    isProfit 
                      ? 'bg-gain/10 text-gain' 
                      : 'bg-loss/10 text-loss'
                  )}>
                    <span>Unrealized P&L</span>
                    <div className="text-right tabular-nums">
                      <span>{isProfit ? '+' : ''}{formatCurrency(pnl)}</span>
                      <span className="block text-[10px] font-medium opacity-85 mt-0.5">({isProfit ? '+' : ''}{pctPnl.toFixed(2)}%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: Live Agent Deliberation Terminal (Full Width) ── */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-groww-card/50">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-groww-primary animate-pulse" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-155 uppercase tracking-wider">
              Agent Deliberation Terminal
            </h3>
          </div>
          <span className={cn('flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border tracking-wider',
            enabled 
              ? 'text-groww-primary border-groww-primary/20 bg-groww-primary/5' 
              : 'text-gray-400 border-gray-100 dark:border-gray-800/80 bg-gray-50/20 dark:bg-groww-dark/20')}>
            <span className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-gain animate-pulse' : 'bg-gray-400')} />
            {enabled ? 'LIVE MONITORING' : 'OFFLINE / IDLE'}
          </span>
        </div>
        
        {/* Logger console */}
        <div ref={consoleRef} 
          className="h-[500px] overflow-y-auto px-5 py-4 font-mono text-xs space-y-2 bg-[#090D16] dark:bg-[#070A11] border-t border-gray-950 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-20 font-sans">
              <Terminal className="w-8 h-8 text-gray-650 dark:text-gray-800 mb-2" />
              <p className="font-semibold text-gray-450 dark:text-gray-600">Waiting for next market scan tick…</p>
              <p className="text-xs text-gray-500 dark:text-gray-700 mt-1 max-w-sm">
                {enabled 
                  ? 'Council is starting up. Real-time reasoning and agent trades will stream here momentarily.' 
                  : 'Activate AI to launch the multi-agent council. Their full debate and technical reasons will render here live.'}
              </p>
            </div>
          ) : (
            logs.map(l => {
              // Extract agent styling details
              const agentStyles: Record<string, string> = {
                'Market Analysis': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                'Momentum': 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
                'Risk Management': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                'Strategy': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                'Sentiment': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                'Council': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
                'Execution': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                'Monitoring': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
              };
              
              const isTrade = l.level === 'trade';
              const isWarn = l.level === 'warn';
              const isError = l.level === 'error';
              
              return (
                <div key={l.id} 
                  className={cn(
                    'flex items-start gap-2.5 py-1 px-1.5 rounded transition-all duration-150 hover:bg-white/[0.02]',
                    isTrade && 'bg-emerald-500/[0.03] border-l-2 border-emerald-500 pl-1',
                    isWarn && 'bg-amber-550/[0.03] border-l-2 border-amber-500 pl-1',
                    isError && 'bg-rose-550/[0.03] border-l-2 border-rose-500 pl-1'
                  )}>
                  
                  {/* Timestamp */}
                  <span className="text-gray-600 dark:text-gray-650 shrink-0 select-none mt-0.5">
                    {new Date(l.created_at + 'Z').toLocaleTimeString('en-IN', { hour12: false })}
                  </span>
                  
                  {/* Agent Tag */}
                  {l.agent && (
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border shrink-0',
                      agentStyles[l.agent] ?? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    )}>
                      {l.agent}
                    </span>
                  )}
                  
                  {/* Log Message */}
                  <span className={cn('leading-relaxed break-words font-mono', 
                    LEVEL_STYLE[l.level] ?? 'text-gray-300'
                  )}>
                    {l.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 text-xs text-gray-500 dark:text-gray-450 bg-gray-50 dark:bg-gray-800/10 border border-gray-150 dark:border-gray-850 rounded-2xl px-4.5 py-3.5 shadow-inner">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <span className="leading-relaxed">
          <strong>Paper-Trading Autonomous Simulator:</strong> This workspace operates as a virtual risk environment on Indian Equities (NSE). The multi-agent Claude Council makes decisions in real time using automated technical indicators and volatility filters. No actual funds are at risk; real-broker APIs can be registered via standard interfaces but remain disabled in simulation.
        </span>
      </div>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string; sub?: string;
  tone: 'default' | 'gain' | 'loss' | 'primary';
}) {
  const toneCls = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : tone === 'primary' ? 'text-groww-primary' : 'text-gray-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-3.5">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1.5"><Icon className="w-3.5 h-3.5" /><span className="text-[11px] font-medium">{label}</span></div>
      <p className={cn('text-lg font-bold tabular-nums', toneCls)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AgentStatusCard({ status, enabled }: { status: string; enabled: boolean }) {
  const map: Record<string, string> = {
    Active: 'text-groww-primary border-groww-primary/30 bg-groww-primary/5',
    Off: 'text-gray-400 border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card',
    Halted: 'text-loss border-loss/30 bg-loss/5',
    Idle: 'text-gray-400 border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card',
  };
  return (
    <div className={cn('rounded-2xl border p-3.5', map[status] ?? map.Off)}>
      <div className="flex items-center gap-1.5 text-gray-400 mb-1.5"><Bot className="w-3.5 h-3.5" /><span className="text-[11px] font-medium">Agent Status</span></div>
      <p className="text-lg font-bold flex items-center gap-2">
        {enabled && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />} {status}
      </p>
    </div>
  );
}

