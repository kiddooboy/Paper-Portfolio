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
    <div className="space-y-4 max-w-6xl mx-auto pb-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center',
              enabled ? 'bg-groww-primary' : 'bg-gray-100 dark:bg-gray-800')}>
              <Bot className={cn('w-6 h-6', enabled ? 'text-white' : 'text-groww-primary')} />
            </div>
            {enabled && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gain animate-pulse ring-2 ring-white dark:ring-groww-dark" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">AI Trade
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-groww-primary/10 text-groww-primary border border-groww-primary/30">Autonomous</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Multi-agent council finds, trades & manages intraday positions on its own</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={killSwitch}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-loss/10 text-loss border border-loss/30 text-sm font-semibold hover:bg-loss/20 transition">
            <ShieldAlert className="w-4 h-4" /> Kill Switch
          </button>
          <button onClick={toggleAi}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition text-white hover:brightness-110',
              enabled ? 'bg-gain' : 'bg-groww-primary')}>
            <Power className="w-4 h-4" /> {enabled ? 'AI Active' : 'Activate AI'}
          </button>
        </div>
      </div>

      {halted && (
        <div className="flex items-center gap-2 text-sm bg-loss/10 border border-loss/30 text-loss rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Kill switch is engaged. Re-activate AI to resume autonomous trading.
        </div>
      )}

      {/* ── Top stat bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Wallet} label="Wallet Balance" value={formatCurrency(state?.wallet_balance ?? 0)} tone="default" />
        <StatCard icon={CircleDollarSign} label="Active Capital" value={formatCurrency(state?.active_capital ?? 0)} tone="primary" />
        <StatCard icon={Activity} label="Daily P&L"
          value={`${(state?.daily_pnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(state?.daily_pnl ?? 0)}`}
          tone={(state?.daily_pnl ?? 0) >= 0 ? 'gain' : 'loss'} />
        <StatCard icon={Layers} label="Open Trades" value={String(state?.open_trades ?? 0)}
          sub={`${state?.trades_today ?? 0}/${state?.max_trades_per_day ?? 0} today`} tone="default" />
        <AgentStatusCard status={state?.status ?? 'Off'} enabled={enabled} />
      </div>

      {/* ── Main split ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4">
        {/* LEFT — Capital + Risk only */}
        <div className="space-y-4">
          <Panel title="Capital Allocation" icon={CircleDollarSign}>
            <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Capital to deploy (₹)</label>
            <input type="number" min={0} step={1000}
              value={cfg.capital_amount ?? ''}
              placeholder={`${Math.round((state?.wallet_balance ?? 0) * cfg.allocation_pct / 100)}`}
              onChange={e => setCfg({ ...cfg, capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
              onBlur={e => patch({ capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
              className="w-full mt-1 px-3 py-2 text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Leave blank to use {cfg.allocation_pct}% of wallet. Available: {formatCurrency(state?.wallet_balance ?? 0)}
            </p>
          </Panel>

          <Panel title="Risk Category" icon={ShieldCheck}>
            <div className="space-y-2">
              {RISK_ORDER.map(r => {
                const pr = profiles?.[r];
                const active = cfg.risk_level === r;
                return (
                  <button key={r} onClick={() => patch({ risk_level: r })}
                    className={cn('w-full text-left rounded-xl border p-3 transition',
                      active ? 'border-groww-primary bg-groww-primary/5' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('font-bold text-sm', active ? 'text-groww-primary' : 'text-gray-700 dark:text-gray-200')}>{pr?.label ?? r}</span>
                      {active && <span className="text-[10px] font-bold text-groww-primary">SELECTED</span>}
                    </div>
                    {pr && (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-[10px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800/60 pt-2">
                        <span className="flex items-center gap-1">💰 Risk/Trade: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.riskPerTradePct}%</strong></span>
                        <span className="flex items-center gap-1">🛡 Stop: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.atrStopMult}× ATR</strong></span>
                        <span className="flex items-center gap-1">🎯 R:R Ratio: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.rewardRisk}:1</strong></span>
                        <span className="flex items-center gap-1">📉 Trailing: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.trailAtrMult}× ATR</strong></span>
                        <span className="flex items-center gap-1">📦 Max Slots: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.maxPositions}</strong></span>
                        <span className="flex items-center gap-1">⚡ Max/Day: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.maxTradesPerDay}</strong></span>
                        <span className="flex items-center gap-1">📊 Min Conf: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.minConfidence}%</strong></span>
                        <span className="flex items-center gap-1">🔒 Position Cap: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{pr.maxPositionPct}%</strong></span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Advanced Autonomy Settings" icon={Bot}>
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Min Confidence (%)</label>
                  <input type="number" min={40} max={95} step={1}
                    value={cfg.min_confidence ?? ''}
                    onChange={e => setCfg({ ...cfg, min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                    onBlur={e => patch({ min_confidence: e.target.value ? parseInt(e.target.value) : 60 })}
                    className="w-full mt-1 px-3 py-2 text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Max Trades/Day</label>
                  <input type="number" min={1} max={50} step={1}
                    value={cfg.max_trades_per_day ?? ''}
                    onChange={e => setCfg({ ...cfg, max_trades_per_day: e.target.value ? parseInt(e.target.value) : 10 })}
                    onBlur={e => patch({ max_trades_per_day: e.target.value ? parseInt(e.target.value) : 10 })}
                    className="w-full mt-1 px-3 py-2 text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Daily Loss Limit (₹)</label>
                <input type="number" min={0} step={500}
                  value={cfg.max_daily_loss ?? ''}
                  placeholder="No Limit"
                  onChange={e => setCfg({ ...cfg, max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                  onBlur={e => patch({ max_daily_loss: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full mt-1 px-3 py-2 text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30" />
                <p className="text-[9px] text-gray-500 mt-1">Stops bot for the day once realized loss hits this cap.</p>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800/60 pt-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Trading Window</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{cfg.session_start} - {cfg.session_end} IST</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold">Start Time</label>
                    <input type="time"
                      value={cfg.session_start}
                      onChange={e => setCfg({ ...cfg, session_start: e.target.value })}
                      onBlur={e => patch({ session_start: e.target.value })}
                      className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold">End Time</label>
                    <input type="time"
                      value={cfg.session_end}
                      onChange={e => setCfg({ ...cfg, session_end: e.target.value })}
                      onBlur={e => patch({ session_end: e.target.value })}
                      className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer" />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800/60 pt-3">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">Auto Square-Off</label>
                    <p className="text-[9px] text-gray-500">Closes open positions at market price.</p>
                  </div>
                  <input type="time"
                    value={cfg.squareoff_time}
                    onChange={e => setCfg({ ...cfg, squareoff_time: e.target.value })}
                    onBlur={e => patch({ squareoff_time: e.target.value })}
                    className="w-32 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/30 cursor-pointer" />
                </div>
              </div>
            </div>
          </Panel>

          <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2.5">
            <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-groww-primary" />
            <span>Set capital & risk, then activate. The agent scans the whole market itself, the council deliberates, and it trades & manages exits autonomously.</span>
          </div>
        </div>

        {/* RIGHT — Council Console + Open Positions */}
        <div className="space-y-4">
          {/* Live console */}
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
                <Terminal className="w-4 h-4 text-groww-primary" /> Agent Console
              </div>
              <span className={cn('flex items-center gap-1.5 text-[11px] font-medium',
                enabled ? 'text-groww-primary' : 'text-gray-400')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-gain animate-pulse' : 'bg-gray-400')} />
                {enabled ? 'LIVE' : 'IDLE'}
              </span>
            </div>
            <div ref={consoleRef} className="h-[420px] overflow-y-auto px-4 py-3 font-mono text-xs space-y-1 bg-gray-50 dark:bg-groww-dark">
              {logs.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-600">{enabled ? 'Waiting for the next market scan…' : 'Activate AI to start the engine. The agent council\'s deliberation will stream here in real time.'}</p>
              ) : logs.map(l => (
                <div key={l.id} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-400 dark:text-gray-600 shrink-0">{new Date(l.created_at + 'Z').toLocaleTimeString('en-IN', { hour12: false })}</span>
                  {l.agent && <span className="text-gray-400 dark:text-gray-500 shrink-0">[{l.agent}]</span>}
                  <span className={LEVEL_STYLE[l.level] ?? 'text-gray-600 dark:text-gray-300'}>{l.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Open positions */}
          <Panel title={`Open Positions (${positions.length})`} icon={Layers}>
            {positions.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No open AI positions.</p>
            ) : (
              <div className="space-y-2">
                {positions.map(p => {
                  const pnl = p.unrealized_pnl ?? 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 px-3 py-2.5">
                      <StockLogo symbol={p.symbol} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{p.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-groww-primary/10 text-groww-primary">conf {p.confidence}%</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {p.quantity} @ ₹{p.entry_price.toFixed(2)} · SL ₹{p.stop_loss.toFixed(2)} · TGT ₹{p.target.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 tabular-nums">₹{(p.current_price ?? p.entry_price).toFixed(2)}</p>
                        <p className={cn('text-sm font-bold tabular-nums', pnl >= 0 ? 'text-gain' : 'text-loss')}>
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <span>Paper-trading simulation. A Claude multi-agent council makes the decisions using technical signals + risk rules on virtual money — not financial advice. Trades route through the paper broker; real-broker integration is pluggable but not enabled.</span>
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

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200 mb-3"><Icon className="w-4 h-4 text-groww-primary" />{title}</h3>
      {children}
    </div>
  );
}
