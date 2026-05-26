import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Bot, Power, ShieldAlert, Wallet, CircleDollarSign, Activity, Layers,
  Plus, X, Gauge, Clock, TrendingUp, TrendingDown, Sparkles, Terminal,
  ShieldCheck, Zap, AlertTriangle, Radar,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import StockLogo from '../components/StockLogo';

// ── Types ────────────────────────────────────────────────────────────────────
type RiskLevel = 'conservative' | 'moderate' | 'aggressive';
interface AiConfig {
  is_enabled: number; kill_switch: number; allocation_pct: number;
  capital_amount: number | null; risk_level: RiskLevel; max_positions: number;
  watchlist: string[]; max_daily_loss: number | null; max_trades_per_day: number;
  squareoff_time: string; session_start: string; session_end: string; min_confidence: number;
}
interface AiState {
  status: string; is_enabled: boolean; kill_switch: boolean;
  wallet_balance: number; active_capital: number; daily_pnl: number;
  open_trades: number; trades_today: number; max_trades_per_day: number; risk_level: string;
}
interface Position {
  id: number; symbol: string; quantity: number; entry_price: number; stop_loss: number;
  target: number; confidence: number; entry_reason: string; current_price?: number; unrealized_pnl?: number;
}
interface LogRow { id: number; level: string; agent: string | null; message: string; created_at: string; }
interface Signal {
  symbol: string; price: number; change_percent: number; confidence: number;
  bias: 'bullish' | 'bearish' | 'neutral'; action: string; meetsThreshold: boolean; reasons: string[];
}
interface RiskProfile {
  label: string; targetPct: number; stopLossPct: number; trailingPct: number;
  maxTradesPerDay: number; minConfidence: number; maxPositions: number;
}

const RISK_ORDER: RiskLevel[] = ['conservative', 'moderate', 'aggressive'];
const NIFTY_SUGGESTIONS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'BAJFINANCE', 'LT'];

const LEVEL_STYLE: Record<string, string> = {
  info:   'text-gray-400',
  signal: 'text-sky-400',
  trade:  'text-emerald-400',
  agent:  'text-violet-400',
  warn:   'text-amber-400',
  error:  'text-red-400',
};

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AlgoTradePage() {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [state, setState] = useState<AiState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [profiles, setProfiles] = useState<Record<string, RiskProfile> | null>(null);
  const [symbolInput, setSymbolInput] = useState('');
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

  // ── Live polling: state, positions, console, signals ──
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

  // Signals widget — refresh less often (heavier)
  const refreshSignals = useCallback(async () => {
    try { const r = await axios.get('/api/algo/ai/signals'); setSignals(r.data); } catch {}
  }, []);
  useEffect(() => {
    refreshSignals();
    const t = setInterval(refreshSignals, 20000);
    return () => clearInterval(t);
  }, [refreshSignals]);

  // Auto-scroll console to bottom on new logs
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // ── Config mutations ──
  const patch = async (p: Partial<AiConfig>) => {
    try {
      const r = await axios.put('/api/algo/ai-config', p);
      setCfg(r.data);
      return r.data as AiConfig;
    } catch { toast.error('Failed to save'); }
  };

  const toggleAi = async () => {
    if (!cfg) return;
    if (!cfg.is_enabled) {
      if (!cfg.watchlist.length) { toast.error('Add at least one stock to your watchlist first'); return; }
      toast.success('AI Trade activated — agents are now live');
    } else {
      toast('AI Trade paused', { icon: '⏸️' });
    }
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

  const addSymbol = async (sym: string) => {
    if (!cfg) return;
    const s = sym.trim().toUpperCase();
    if (!s || cfg.watchlist.includes(s)) return;
    await patch({ watchlist: [...cfg.watchlist, s] });
    setSymbolInput('');
  };
  const removeSymbol = async (sym: string) => {
    if (!cfg) return;
    await patch({ watchlist: cfg.watchlist.filter(x => x !== sym) });
  };

  if (loading || !cfg) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const enabled = !!cfg.is_enabled;
  const halted = !!cfg.kill_switch;
  const activeProfile = profiles?.[cfg.risk_level];

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center',
              enabled ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-gray-800')}>
              <Bot className="w-6 h-6 text-white" />
            </div>
            {enabled && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 animate-pulse ring-2 ring-black" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">AI Trade
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">Autonomous</span>
            </h1>
            <p className="text-sm text-gray-500">Multi-agent intraday trading · paper engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={killSwitch}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/20 transition">
            <ShieldAlert className="w-4 h-4" /> Kill Switch
          </button>
          <button onClick={toggleAi}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition shadow-lg',
              enabled ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-violet-600 text-white shadow-violet-600/20 hover:brightness-110')}>
            <Power className="w-4 h-4" /> {enabled ? 'AI Active' : 'Activate AI'}
          </button>
        </div>
      </div>

      {halted && (
        <div className="flex items-center gap-2 text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Kill switch is engaged. Re-activate AI to resume autonomous trading.
        </div>
      )}

      {/* ── Top stat bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Wallet} label="Wallet Balance" value={formatCurrency(state?.wallet_balance ?? 0)} tone="default" />
        <StatCard icon={CircleDollarSign} label="Active Capital" value={formatCurrency(state?.active_capital ?? 0)} tone="violet" />
        <StatCard icon={Activity} label="Daily P&L"
          value={`${(state?.daily_pnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(state?.daily_pnl ?? 0)}`}
          tone={(state?.daily_pnl ?? 0) >= 0 ? 'gain' : 'loss'} />
        <StatCard icon={Layers} label="Open Trades" value={String(state?.open_trades ?? 0)}
          sub={`${state?.trades_today ?? 0}/${state?.max_trades_per_day ?? 0} today`} tone="default" />
        <AgentStatusCard status={state?.status ?? 'Off'} enabled={enabled} />
      </div>

      {/* ── Main split ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-4">
        {/* LEFT — Rules & Configuration */}
        <div className="space-y-4">
          {/* Watchlist */}
          <Panel title="Watchlist" icon={Radar}>
            <div className="flex gap-2 mb-3">
              <input value={symbolInput}
                onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addSymbol(symbolInput)}
                placeholder="Add symbol e.g. RELIANCE"
                className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <button onClick={() => addSymbol(symbolInput)}
                className="px-3 rounded-lg bg-violet-600 text-white hover:brightness-110"><Plus className="w-4 h-4" /></button>
            </div>
            {cfg.watchlist.length === 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-500 w-full mb-1">Quick add:</span>
                {NIFTY_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => addSymbol(s)}
                    className="text-[11px] px-2 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-violet-500/20 hover:text-violet-300 transition">+ {s}</button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cfg.watchlist.map(s => (
                  <span key={s} className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gray-800 text-gray-200">
                    <StockLogo symbol={s} size={14} /> {s}
                    <button onClick={() => removeSymbol(s)} className="text-gray-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </Panel>

          {/* Capital */}
          <Panel title="Capital Allocation" icon={CircleDollarSign}>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Capital to deploy (₹)</label>
            <input type="number" min={0} step={1000}
              value={cfg.capital_amount ?? ''}
              placeholder={`${Math.round((state?.wallet_balance ?? 0) * cfg.allocation_pct / 100)}`}
              onChange={e => setCfg({ ...cfg, capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
              onBlur={e => patch({ capital_amount: e.target.value ? parseFloat(e.target.value) : null })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Leave blank to use {cfg.allocation_pct}% of wallet. Available: {formatCurrency(state?.wallet_balance ?? 0)}
            </p>
          </Panel>

          {/* Risk category */}
          <Panel title="Risk Category" icon={ShieldCheck}>
            <div className="space-y-2">
              {RISK_ORDER.map(r => {
                const pr = profiles?.[r];
                const active = cfg.risk_level === r;
                return (
                  <button key={r} onClick={() => patch({ risk_level: r })}
                    className={cn('w-full text-left rounded-xl border p-3 transition',
                      active ? 'border-violet-500 bg-violet-500/10' : 'border-gray-800 hover:border-gray-700 bg-gray-900/40')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('font-bold text-sm', active ? 'text-violet-300' : 'text-gray-200')}>{pr?.label ?? r}</span>
                      {active && <span className="text-[10px] font-bold text-violet-400">SELECTED</span>}
                    </div>
                    {pr && (
                      <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] text-gray-400">
                        <span>🎯 Tgt {pr.targetPct}%</span>
                        <span>🛡 SL {pr.stopLossPct}%</span>
                        <span>📉 Trail {pr.trailingPct}%</span>
                        <span>⚡ {pr.maxTradesPerDay}/day</span>
                        <span>📊 Conf ≥{pr.minConfidence}</span>
                        <span>📦 {pr.maxPositions} pos</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Automation controls */}
          <Panel title="Automation Controls" icon={Gauge}>
            <div className="space-y-3">
              <RangeRow label="Max positions" value={cfg.max_positions} min={1} max={activeProfile?.maxPositions ?? 8} suffix=" stocks"
                onChange={v => setCfg({ ...cfg, max_positions: v })} onCommit={v => patch({ max_positions: v })} />
              <RangeRow label="Min confidence" value={cfg.min_confidence} min={40} max={90} suffix="%"
                onChange={v => setCfg({ ...cfg, min_confidence: v })} onCommit={v => patch({ min_confidence: v })} />
              <NumRow label="Max trades / day" value={cfg.max_trades_per_day}
                onCommit={v => patch({ max_trades_per_day: v })} />
              <NumRow label="Max daily loss (₹)" value={cfg.max_daily_loss ?? 0} placeholder="0 = off"
                onCommit={v => patch({ max_daily_loss: v || null })} />
              <div className="grid grid-cols-3 gap-2">
                <TimeRow label="Start" value={cfg.session_start} onCommit={v => patch({ session_start: v })} />
                <TimeRow label="End" value={cfg.session_end} onCommit={v => patch({ session_end: v })} />
                <TimeRow label="Sq-off" value={cfg.squareoff_time} onCommit={v => patch({ squareoff_time: v })} />
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT — Console + Activity */}
        <div className="space-y-4">
          {/* Live console */}
          <div className="rounded-2xl border border-gray-800 bg-[#0a0b0f] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/50">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <Terminal className="w-4 h-4 text-emerald-400" /> AI Console
              </div>
              <span className={cn('flex items-center gap-1.5 text-[11px] font-medium',
                enabled ? 'text-emerald-400' : 'text-gray-500')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600')} />
                {enabled ? 'LIVE' : 'IDLE'}
              </span>
            </div>
            <div ref={consoleRef} className="h-[300px] overflow-y-auto px-4 py-3 font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <p className="text-gray-600">{enabled ? 'Waiting for market activity…' : 'Activate AI to start the engine. Logs will stream here in real time.'}</p>
              ) : logs.map(l => (
                <div key={l.id} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-600 shrink-0">{new Date(l.created_at + 'Z').toLocaleTimeString('en-IN', { hour12: false })}</span>
                  {l.agent && <span className="text-gray-500 shrink-0">[{l.agent}]</span>}
                  <span className={LEVEL_STYLE[l.level] ?? 'text-gray-300'}>{l.message}</span>
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
                    <div key={p.id} className="flex items-center gap-3 rounded-xl bg-gray-900/50 border border-gray-800 px-3 py-2.5">
                      <StockLogo symbol={p.symbol} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{p.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">conf {p.confidence}%</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {p.quantity} @ ₹{p.entry_price.toFixed(2)} · SL ₹{p.stop_loss.toFixed(2)} · TGT ₹{p.target.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 tabular-nums">₹{(p.current_price ?? p.entry_price).toFixed(2)}</p>
                        <p className={cn('text-sm font-bold tabular-nums', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
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

      {/* ── Bottom widgets ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agent insights */}
        <Panel title="AI Agent Insights" icon={Sparkles}>
          <div className="space-y-2 text-sm">
            <InsightRow label="Engine" value={enabled ? 'Running' : 'Stopped'} good={enabled} />
            <InsightRow label="Risk profile" value={activeProfile?.label ?? cfg.risk_level} />
            <InsightRow label="Confidence gate" value={`≥ ${Math.max(cfg.min_confidence, activeProfile?.minConfidence ?? 0)}%`} />
            <InsightRow label="Daily loss guard" value={cfg.max_daily_loss ? formatCurrency(cfg.max_daily_loss) : 'Off'} />
            <InsightRow label="Auto square-off" value={cfg.squareoff_time + ' IST'} />
          </div>
        </Panel>

        {/* Market sentiment (derived from signals) */}
        <Panel title="Market Sentiment" icon={Activity}>
          <SentimentGauge signals={signals} />
        </Panel>

        {/* Active signals */}
        <Panel title="Active Signals" icon={Zap}>
          {signals.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Add symbols to your watchlist to see live signals.</p>
          ) : (
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {signals.map(s => (
                <div key={s.symbol} className="flex items-center gap-2 text-sm">
                  <StockLogo symbol={s.symbol} size={22} />
                  <span className="font-medium w-20 truncate">{s.symbol}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div className={cn('h-full rounded-full',
                      s.confidence >= 65 ? 'bg-emerald-400' : s.confidence >= 50 ? 'bg-amber-400' : 'bg-red-400')}
                      style={{ width: `${s.confidence}%` }} />
                  </div>
                  <span className="text-xs tabular-nums w-9 text-right text-gray-300">{s.confidence}%</span>
                  {s.bias === 'bullish' ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    : s.bias === 'bearish' ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    : <span className="w-3.5 h-3.5 inline-block" />}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-900/40 border border-gray-800 rounded-xl px-4 py-3">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <span>Paper-trading simulation. The AI uses technical signals + risk rules to trade virtual money — not financial advice. Trades route through the paper broker; real-broker integration is pluggable but not enabled.</span>
      </div>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string; sub?: string;
  tone: 'default' | 'gain' | 'loss' | 'violet';
}) {
  const toneCls = tone === 'gain' ? 'text-emerald-400' : tone === 'loss' ? 'text-red-400' : tone === 'violet' ? 'text-violet-400' : 'text-gray-100';
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-3.5">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1.5"><Icon className="w-3.5 h-3.5" /><span className="text-[11px] font-medium">{label}</span></div>
      <p className={cn('text-lg font-bold tabular-nums', toneCls)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function AgentStatusCard({ status, enabled }: { status: string; enabled: boolean }) {
  const map: Record<string, string> = {
    Active: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    Off: 'text-gray-400 border-gray-800 bg-gray-900/40',
    Halted: 'text-red-400 border-red-500/30 bg-red-500/10',
    Idle: 'text-gray-400 border-gray-800 bg-gray-900/40',
  };
  return (
    <div className={cn('rounded-2xl border p-3.5', map[status] ?? map.Off)}>
      <div className="flex items-center gap-1.5 text-gray-500 mb-1.5"><Bot className="w-3.5 h-3.5" /><span className="text-[11px] font-medium">Agent Status</span></div>
      <p className="text-lg font-bold flex items-center gap-2">
        {enabled && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />} {status}
      </p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-200 mb-3"><Icon className="w-4 h-4 text-violet-400" />{title}</h3>
      {children}
    </div>
  );
}

function RangeRow({ label, value, min, max, suffix, onChange, onCommit }: {
  label: string; value: number; min: number; max: number; suffix?: string;
  onChange: (v: number) => void; onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-bold text-violet-300">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        onMouseUp={e => onCommit(parseInt((e.target as HTMLInputElement).value))}
        onTouchEnd={e => onCommit(parseInt((e.target as HTMLInputElement).value))}
        className="w-full accent-violet-500" />
    </div>
  );
}

function NumRow({ label, value, placeholder, onCommit }: { label: string; value: number; placeholder?: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value || ''));
  useEffect(() => { setV(String(value || '')); }, [value]);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-400">{label}</span>
      <input type="number" value={v} placeholder={placeholder}
        onChange={e => setV(e.target.value)}
        onBlur={() => onCommit(parseFloat(v) || 0)}
        className="w-24 px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
    </div>
  );
}

function TimeRow({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-1"><Clock className="w-3 h-3" />{label}</label>
      <input type="time" value={value} onChange={e => onCommit(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
    </div>
  );
}

function InsightRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={cn('font-semibold', good === undefined ? 'text-gray-200' : good ? 'text-emerald-400' : 'text-gray-400')}>{value}</span>
    </div>
  );
}

function SentimentGauge({ signals }: { signals: Signal[] }) {
  if (!signals.length) return <p className="text-sm text-gray-500 py-4 text-center">No data yet.</p>;
  const bull = signals.filter(s => s.bias === 'bullish').length;
  const bear = signals.filter(s => s.bias === 'bearish').length;
  const avg = Math.round(signals.reduce((s, x) => s + x.confidence, 0) / signals.length);
  const mood = avg >= 60 ? 'Bullish' : avg >= 45 ? 'Neutral' : 'Bearish';
  const moodCls = avg >= 60 ? 'text-emerald-400' : avg >= 45 ? 'text-amber-400' : 'text-red-400';
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <span className={cn('text-2xl font-bold', moodCls)}>{mood}</span>
        <span className="text-sm text-gray-400 tabular-nums">avg {avg}%</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-800">
        <div className="bg-emerald-400 h-full" style={{ width: `${(bull / signals.length) * 100}%` }} />
        <div className="bg-red-400 h-full" style={{ width: `${(bear / signals.length) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
        <span className="text-emerald-400">{bull} bullish</span>
        <span className="text-red-400">{bear} bearish</span>
      </div>
    </div>
  );
}
