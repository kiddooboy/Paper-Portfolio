import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bot, Power, ShieldAlert, Wallet, CircleDollarSign, Activity, Layers,
  Terminal, ShieldCheck, AlertTriangle, TrendingUp, Clock,
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

// Console log colours
const LEVEL_STYLE: Record<string, string> = {
  info:   'text-gray-400',
  signal: 'text-sky-400',
  trade:  'text-emerald-400',
  agent:  'text-blue-400',
  warn:   'text-amber-400',
  error:  'text-rose-400',
};

// Agent tag pill colours
const AGENT_STYLES: Record<string, string> = {
  'Market Analysis': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'Momentum': 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25',
  'Risk Management': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Risk Monitor': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Risk': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Strategy': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  'Sentiment': 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'Council': 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  'Execution': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'Engine': 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  'Scanner': 'bg-teal-500/15 text-teal-400 border-teal-500/25',
  'Signal Engine': 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  'Capital': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  'Guardrail': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
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
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  // Auto-scroll console to top on new logs
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = 0;
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
  const profile = profiles?.[cfg.risk_level];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* ── Header Bar ── */}
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300',
              enabled ? 'bg-groww-primary shadow-lg shadow-groww-primary/25' : 'bg-gray-100 dark:bg-gray-800')}>
              <Bot className={cn('w-5 h-5', enabled ? 'text-white' : 'text-groww-primary')} />
            </div>
            {enabled && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gain animate-pulse ring-2 ring-white dark:ring-groww-dark" />}
          </div>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              AI Command Center
              <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                enabled
                  ? 'bg-gain/10 text-gain border-gain/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700'
              )}>
                {enabled ? '● Live' : 'Offline'}
              </span>
            </h1>
            <p className="text-[11px] text-gray-500 -mt-0.5">Autonomous intraday trading · Multi-agent council</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats Pills */}
          <div className="hidden lg:flex items-center gap-3 mr-3 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500">
              <Wallet className="w-3.5 h-3.5" />
              <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(state?.wallet_balance ?? 0)}</span>
            </div>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <span className={cn('font-bold tabular-nums', (state?.daily_pnl ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                {(state?.daily_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(state?.daily_pnl ?? 0)}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5 text-gray-500">
              <Layers className="w-3.5 h-3.5" />
              <span className="font-semibold text-gray-700 dark:text-gray-300">{state?.open_trades ?? 0} open</span>
            </div>
          </div>

          <button onClick={killSwitch}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-loss/10 text-loss border border-loss/20 text-xs font-semibold hover:bg-loss/20 active:scale-95 transition-all">
            <ShieldAlert className="w-3.5 h-3.5" /> Kill
          </button>
          <button onClick={toggleAi}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all text-white shadow-sm',
              enabled ? 'bg-gain shadow-gain/20 hover:brightness-110' : 'bg-groww-primary shadow-groww-primary/20 hover:brightness-110')}>
            <Power className="w-3.5 h-3.5" /> {enabled ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {halted && (
        <div className="shrink-0 flex items-center gap-2 text-xs bg-loss/10 border-b border-loss/20 text-loss px-5 py-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="font-medium">Kill switch engaged. Re-activate to resume autonomous trading.</span>
        </div>
      )}

      {/* ── Left / Right Split ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ── LEFT PANEL: Controls + Positions ── */}
        <div className="w-full h-[50%] lg:h-full lg:w-[420px] xl:w-[480px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-gray-800 overflow-y-auto bg-white dark:bg-groww-card">
          <div className="p-4 space-y-4">

            {/* Stats Grid (Mobile) */}
            <div className="grid grid-cols-2 gap-2.5 lg:hidden">
              <MiniStat icon={Wallet} label="Balance" value={formatCurrency(state?.wallet_balance ?? 0)} />
              <MiniStat icon={Activity} label="Day P&L"
                value={`${(state?.daily_pnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(state?.daily_pnl ?? 0)}`}
                tone={(state?.daily_pnl ?? 0) >= 0 ? 'gain' : 'loss'} />
              <MiniStat icon={Layers} label="Open" value={String(state?.open_trades ?? 0)} />
              <MiniStat icon={TrendingUp} label="Today" value={`${state?.trades_today ?? 0} trades`} />
            </div>

            {/* Capital Allocation */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">
                <CircleDollarSign className="w-3 h-3 text-groww-primary" /> Capital Amount (₹)
              </label>
              <input type="number" min={0} step={1000}
                value={cfg.capital_amount ?? ''}
                placeholder={`Default: ${Math.round((state?.wallet_balance ?? 0) * cfg.allocation_pct / 100)}`}
                onChange={e => setCfg({ ...cfg, capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
                onBlur={e => patch({ capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-3 py-2 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
            </div>

            {/* Risk Profile */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-groww-primary" /> Risk Profile
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {RISK_ORDER.map(r => {
                  const pr = profiles?.[r];
                  const active = cfg.risk_level === r;
                  return (
                    <button key={r} onClick={() => patch({ risk_level: r })}
                      className={cn('text-center rounded-xl border py-2.5 px-1.5 transition-all duration-200 text-xs font-semibold',
                        active
                          ? 'border-groww-primary bg-groww-primary/10 text-groww-primary shadow-sm'
                          : 'border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300 dark:hover:border-gray-700'
                      )}>
                      <div className="uppercase tracking-wider text-[10px]">{pr?.label.split(' ')[0] ?? r}</div>
                      <div className="text-[8px] opacity-70 mt-0.5">≥{pr?.minConfidence ?? 60}% conf</div>
                    </button>
                  );
                })}
              </div>

              {/* Profile Detail Card */}
              {profile && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 p-3 text-[10px] grid grid-cols-2 gap-2">
                  <div className="flex justify-between"><span className="text-gray-500">Risk/Trade:</span><strong className="text-gray-800 dark:text-gray-200">{profile.riskPerTradePct}%</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Stop:</span><strong className="text-gray-800 dark:text-gray-200">{profile.atrStopMult}× ATR</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">R:R:</span><strong className="text-gray-800 dark:text-gray-200">{profile.rewardRisk}:1</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Trail:</span><strong className="text-gray-800 dark:text-gray-200">{profile.trailAtrMult}× ATR</strong></div>
                  <div className="flex justify-between col-span-2"><span className="text-gray-500">Max Slots:</span><strong className="text-gray-800 dark:text-gray-200">{profile.maxPositions} open positions</strong></div>
                </div>
              )}
            </div>

            {/* Guardrails Row */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 block">Min Confidence</label>
                <input type="number" min={40} max={95} step={1}
                  value={cfg.min_confidence ?? ''}
                  onChange={e => setCfg({ ...cfg, min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                  onBlur={e => patch({ min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                  className="w-full px-3 py-2 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 block">Daily Loss Limit (₹)</label>
                <input type="number" min={0} step={500}
                  value={cfg.max_daily_loss ?? ''}
                  placeholder="No limit"
                  onChange={e => setCfg({ ...cfg, max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                  onBlur={e => patch({ max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full px-3 py-2 text-sm tabular-nums rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
            </div>

            {/* Session Times */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Start</label>
                <input type="time" value={cfg.session_start}
                  onChange={e => setCfg({ ...cfg, session_start: e.target.value })}
                  onBlur={e => patch({ session_start: e.target.value })}
                  className="w-full px-2 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />End</label>
                <input type="time" value={cfg.session_end}
                  onChange={e => setCfg({ ...cfg, session_end: e.target.value })}
                  onBlur={e => patch({ session_end: e.target.value })}
                  className="w-full px-2 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 flex items-center gap-1"><ShieldAlert className="w-2.5 h-2.5" />Sq Off</label>
                <input type="time" value={cfg.squareoff_time}
                  onChange={e => setCfg({ ...cfg, squareoff_time: e.target.value })}
                  onBlur={e => patch({ squareoff_time: e.target.value })}
                  className="w-full px-2 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 font-medium" />
              </div>
            </div>

            {/* ── Active Positions ── */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-groww-primary" />
                  <h3 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                    Active Positions
                  </h3>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                    {positions.length}
                  </span>
                </div>
                {positions.length > 0 && (
                  <span className="text-[9px] font-bold text-groww-primary animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-groww-primary" /> Monitoring
                  </span>
                )}
              </div>

              {positions.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center border border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-groww-dark/20">
                  <Bot className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-600 text-center max-w-[200px]">
                    {enabled ? 'Scanning for setups. Trades appear here when the council approves entries.' : 'Activate the bot to start autonomous trading.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {positions.map(p => {
                    const pnl = p.unrealized_pnl ?? 0;
                    const isProfit = pnl >= 0;
                    const pctPnl = p.entry_price > 0 ? (pnl / (p.entry_price * p.quantity)) * 100 : 0;
                    return (
                      <div key={p.id} className={cn(
                        'rounded-xl border p-3 transition-all duration-200',
                        isProfit ? 'border-gain/15 bg-gain/[0.02]' : 'border-loss/15 bg-loss/[0.02]'
                      )}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <StockLogo symbol={p.symbol} size={28} />
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{p.symbol}</p>
                              <span className="text-[8px] font-bold text-groww-primary">{p.confidence}% conf</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">₹{(p.current_price ?? p.entry_price).toFixed(2)}</p>
                            <p className={cn('text-[10px] font-bold tabular-nums', isProfit ? 'text-gain' : 'text-loss')}>
                              {isProfit ? '+' : ''}{formatCurrency(pnl)} ({isProfit ? '+' : ''}{pctPnl.toFixed(2)}%)
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[9px] text-gray-500">
                          <div><span className="block text-gray-400">Qty</span><strong className="text-gray-700 dark:text-gray-300">{p.quantity}</strong></div>
                          <div><span className="block text-gray-400">Entry</span><strong className="text-gray-700 dark:text-gray-300">₹{p.entry_price.toFixed(2)}</strong></div>
                          <div><span className="block text-gray-400">SL</span><strong className="text-loss">₹{p.stop_loss.toFixed(2)}</strong></div>
                          <div><span className="block text-gray-400">TGT</span><strong className="text-gain">₹{p.target.toFixed(2)}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 text-[10px] text-gray-500 bg-gray-50 dark:bg-gray-800/20 border border-gray-150 dark:border-gray-800 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>Paper-trading simulator. No real funds at risk. The AI council makes autonomous decisions using live technical data.</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Live Agent Terminal ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0e1a] min-w-0">
          {/* Terminal Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-800/80 bg-[#0d1220]">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-groww-primary" />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Agent Terminal</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border',
                enabled
                  ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                  : 'text-gray-500 border-gray-700 bg-gray-800/50')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600')} />
                {enabled ? 'LIVE' : 'IDLE'}
              </span>
              <span className="text-[10px] text-gray-600 tabular-nums">{logs.length} events</span>
            </div>
          </div>

          {/* Terminal Body */}
          <div ref={consoleRef}
            className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed space-y-0.5 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 font-sans">
                <Terminal className="w-10 h-10 text-gray-800 mb-3" />
                <p className="font-semibold text-gray-500 text-sm">Waiting for agent activity…</p>
                <p className="text-xs text-gray-700 mt-1.5 max-w-xs leading-relaxed">
                  {enabled
                    ? 'The AI council is scanning the market. Signals, deliberations, and trade executions will stream here in real time.'
                    : 'Activate the bot to launch the autonomous multi-agent council. Their reasoning and trade decisions will appear here.'}
                </p>
              </div>
            ) : (
              [...logs].reverse().map(l => {
                const isTrade = l.level === 'trade';
                const isWarn = l.level === 'warn';
                const isError = l.level === 'error';

                return (
                  <div key={l.id}
                    className={cn(
                      'flex items-start gap-2 py-[3px] px-1.5 rounded transition-colors',
                      isTrade && 'bg-emerald-500/[0.06] border-l-2 border-emerald-500',
                      isWarn && 'bg-amber-500/[0.04] border-l-2 border-amber-500',
                      isError && 'bg-rose-500/[0.04] border-l-2 border-rose-500',
                      !isTrade && !isWarn && !isError && 'hover:bg-white/[0.02]'
                    )}>
                    {/* Timestamp */}
                    <span className="text-gray-600 shrink-0 select-none tabular-nums text-[10px]">
                      {new Date(l.created_at + 'Z').toLocaleTimeString('en-IN', { hour12: false })}
                    </span>

                    {/* Agent Tag */}
                    {l.agent && (
                      <span className={cn(
                        'text-[8px] px-1.5 py-[1px] rounded font-bold uppercase tracking-wider border shrink-0 whitespace-nowrap',
                        AGENT_STYLES[l.agent] ?? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                      )}>
                        {l.agent}
                      </span>
                    )}

                    {/* Message */}
                    <span className={cn('break-words min-w-0', LEVEL_STYLE[l.level] ?? 'text-gray-300')}>
                      {l.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
function MiniStat({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: string; tone?: 'gain' | 'loss';
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2.5 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5"><Icon className="w-3 h-3" /><span className="text-[9px] font-medium">{label}</span></div>
      <p className={cn('text-sm font-bold tabular-nums', tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-gray-900 dark:text-white')}>{value}</p>
    </div>
  );
}
