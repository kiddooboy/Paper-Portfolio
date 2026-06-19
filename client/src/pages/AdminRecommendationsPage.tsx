import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import {
  Sparkles, Send, BarChart3, Users, ArrowLeft, RefreshCw,
  TrendingUp, TrendingDown, Minus, Target, ShieldAlert,
  CheckCircle, Clock, XCircle, Zap, Eye, ChevronDown,
  ChevronUp, Brain, Bell, Percent, DollarSign, Search,
  Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type Campaign = {
  id: number;
  title: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  current_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  expected_return: number | null;
  confidence_score: number;
  rationale: string | null;
  time_horizon: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  ai_generated: number;
  segment: string;
  status: 'draft' | 'sent' | 'cancelled';
  sent_at: string | null;
  sent_count: number;
  total_clicks: number | null;
  total_conversions: number | null;
  created_by_name: string | null;
  created_at: string;
};

type AiPreview = {
  title: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  target_price: number;
  stop_loss: number;
  expected_return: number;
  confidence_score: number;
  rationale: string;
  time_horizon: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  current_price?: number;
  ai_generated: boolean;
};

type DailyRec = {
  symbol: string;
  name: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entry_price?: number;
  target: number;
  stop_loss: number;
  expected_return?: number;
  reasoning: string;
  timeframe: string;
  technical_signals: { rsi?: number; macd?: string; supertrend?: string; ema_trend?: string };
};

type DailyData = {
  date: string;
  market_sentiment: string;
  summary: string;
  recommendations: DailyRec[];
  generated_at: string;
};

type SegmentCounts = {
  all: number;
  active_7d: number;
  active_30d: number;
  watchlist: number;
  holders: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const actionConfig = {
  BUY:  { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30', btnBg: 'bg-green-600 hover:bg-green-700', icon: TrendingUp,   label: 'BUY'  },
  SELL: { color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30',         btnBg: 'bg-red-600 hover:bg-red-700',     icon: TrendingDown, label: 'SELL' },
  HOLD: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30', btnBg: 'bg-yellow-600 hover:bg-yellow-700', icon: Minus, label: 'HOLD' },
};

const riskConfig = {
  LOW:    { color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-500/10'   },
  MEDIUM: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  HIGH:   { color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-500/10'       },
};

const segmentLabels: Record<string, string> = {
  all:        'All users',
  active_7d:  'Active last 7d',
  active_30d: 'Active last 30d',
  watchlist:  'Watchlist holders',
  holders:    'Current holders',
};

const sentimentConfig: Record<string, { color: string; icon: typeof TrendingUp }> = {
  bullish: { color: 'text-green-600 dark:text-green-400', icon: TrendingUp  },
  bearish: { color: 'text-red-600 dark:text-red-400',     icon: TrendingDown },
  neutral: { color: 'text-gray-500 dark:text-gray-400',   icon: Minus        },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function ctr(clicks: number | null, sent: number) {
  if (!sent || !clicks) return '0%';
  return ((clicks / sent) * 100).toFixed(1) + '%';
}

function convRate(conversions: number | null, sent: number) {
  if (!sent || !conversions) return '0%';
  return ((conversions / sent) * 100).toFixed(1) + '%';
}

// ── Confidence bar ─────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map = {
    draft:     { color: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',                    icon: Clock,        label: 'Draft'     },
    sent:      { color: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40',              icon: CheckCircle,  label: 'Sent'      },
    cancelled: { color: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40',                     icon: XCircle,      label: 'Cancelled' },
  };
  const { color, icon: Icon, label } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', color)}>
      <Icon size={10} /> {label}
    </span>
  );
}

// ── Daily Rec quick card ───────────────────────────────────────────────────

function DailyRecCard({
  rec, onSelect,
}: {
  rec: DailyRec;
  onSelect: (r: DailyRec) => void;
}) {
  const cfg = actionConfig[rec.action];
  const AIcon = cfg.icon;
  return (
    <button
      onClick={() => onSelect(rec)}
      className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{rec.symbol}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{rec.name}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border font-bold shrink-0', cfg.bg, cfg.color)}>
          <AIcon size={10} /> {cfg.label}
        </span>
      </div>
      <ConfidenceBar score={rec.confidence} />
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Target: <span className="text-green-600 dark:text-green-400 font-medium">₹{rec.target.toFixed(0)}</span></span>
        <span>SL: <span className="text-red-600 dark:text-red-400 font-medium">₹{rec.stop_loss.toFixed(0)}</span></span>
      </div>
      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
        Click to load & send →
      </div>
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminRecommendationsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  const [tab, setTab] = useState<'generate' | 'campaigns' | 'analytics'>('generate');

  // ── Generate tab state ──
  const [genSymbol, setGenSymbol] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [segmentCounts, setSegmentCounts] = useState<SegmentCounts | null>(null);
  const [segCountLoading, setSegCountLoading] = useState(false);
  const [form, setForm] = useState<Partial<AiPreview & { segment: string }>>({ segment: 'all' });
  const [sendLoading, setSendLoading] = useState(false);

  // ── Daily recs dashboard state ──
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // ── Campaigns tab state ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campsLoading, setCampsLoading] = useState(false);
  const [expandedCamp, setExpandedCamp] = useState<number | null>(null);
  const [campDetail, setCampDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setCampsLoading(true);
    try {
      const { data } = await axios.get('/api/admin/recommendations');
      setCampaigns(data.campaigns);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setCampsLoading(false);
    }
  }, []);

  // Load daily recommendations for the dashboard
  const fetchDailyRecs = useCallback(async () => {
    setDailyLoading(true);
    try {
      const { data } = await axios.get('/api/recommendations/today');
      setDailyData(data);
    } catch {}
    finally { setDailyLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'generate') fetchDailyRecs();
    if (tab === 'campaigns') fetchCampaigns();
    if (tab === 'analytics') fetchCampaigns();
  }, [tab, fetchDailyRecs, fetchCampaigns]);

  // ── Load a daily rec into the form ───────────────────────────────────────

  const handleSelectDailyRec = (rec: DailyRec) => {
    const preview: AiPreview = {
      title: `${rec.symbol} – ${rec.action === 'BUY' ? 'Strong Buy Signal' : rec.action === 'SELL' ? 'Sell Signal' : 'Hold Position'}`,
      symbol: rec.symbol,
      action: rec.action,
      target_price: rec.target,
      stop_loss: rec.stop_loss,
      expected_return: rec.expected_return ?? parseFloat((((rec.target - (rec.entry_price ?? rec.target)) / (rec.entry_price ?? rec.target)) * 100).toFixed(1)),
      confidence_score: rec.confidence,
      rationale: rec.reasoning,
      time_horizon: rec.timeframe ?? '1M',
      risk_level: rec.confidence >= 70 ? 'LOW' : rec.confidence >= 50 ? 'MEDIUM' : 'HIGH',
      current_price: rec.entry_price,
      ai_generated: true,
    };
    setAiPreview(preview);
    setForm({ ...preview, segment: 'all' });
    setGenSymbol(rec.symbol);
    // Fetch segment counts
    setSegCountLoading(true);
    axios.get(`/api/admin/recommendations/segments?symbol=${encodeURIComponent(rec.symbol)}`)
      .then(({ data: d }) => setSegmentCounts(d.segments))
      .finally(() => setSegCountLoading(false));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── AI Generate ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!genSymbol.trim()) { toast.error('Enter a symbol'); return; }
    setGenLoading(true);
    setAiPreview(null);
    setSegmentCounts(null);
    try {
      const { data } = await axios.post('/api/admin/recommendations/generate', { symbol: genSymbol.trim().toUpperCase() });
      setAiPreview(data);
      setForm({ ...data, segment: 'all' });
      setSegCountLoading(true);
      axios.get(`/api/admin/recommendations/segments?symbol=${encodeURIComponent(data.symbol)}`)
        .then(({ data: d }) => setSegmentCounts(d.segments))
        .finally(() => setSegCountLoading(false));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'AI generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  const handleSend = async (sendNow: boolean) => {
    if (!form.title || !form.symbol || !form.action) { toast.error('Fill in all required fields'); return; }
    setSendLoading(true);
    try {
      await axios.post('/api/admin/recommendations', { ...form, send_now: sendNow });
      toast.success(sendNow ? `Campaign sent to ${segmentLabels[form.segment || 'all']}!` : 'Campaign saved as draft');
      setAiPreview(null);
      setForm({ segment: 'all' });
      setGenSymbol('');
      if (sendNow) { setTab('campaigns'); fetchCampaigns(); }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save campaign');
    } finally {
      setSendLoading(false);
    }
  };

  // ── Campaign detail expand ─────────────────────────────────────────────

  const toggleCampDetail = async (id: number) => {
    if (expandedCamp === id) { setExpandedCamp(null); setCampDetail(null); return; }
    setExpandedCamp(id);
    setDetailLoading(true);
    try {
      const { data } = await axios.get(`/api/admin/recommendations/${id}`);
      setCampDetail(data);
    } catch { toast.error('Failed to load campaign detail'); }
    finally { setDetailLoading(false); }
  };

  const handleSendDraft = async (id: number) => {
    try {
      const { data } = await axios.post(`/api/admin/recommendations/${id}/send`);
      toast.success(`Sent to ${data.sent} users`);
      fetchCampaigns();
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Send failed'); }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this campaign?')) return;
    try { await axios.delete(`/api/admin/recommendations/${id}`); fetchCampaigns(); }
    catch { toast.error('Cancel failed'); }
  };

  // ── Analytics ─────────────────────────────────────────────────────────

  const sentCamps = campaigns.filter((c) => c.status === 'sent');
  const totalSent = sentCamps.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalClicks = sentCamps.reduce((s, c) => s + (c.total_clicks || 0), 0);
  const totalConv = sentCamps.reduce((s, c) => s + (c.total_conversions || 0), 0);
  const avgConf = sentCamps.length ? sentCamps.reduce((s, c) => s + c.confidence_score, 0) / sentCamps.length : 0;

  const sentimentKey = (dailyData?.market_sentiment ?? 'neutral').toLowerCase();
  const SentimentIcon = (sentimentConfig[sentimentKey] ?? sentimentConfig.neutral).icon;
  const sentimentColor = (sentimentConfig[sentimentKey] ?? sentimentConfig.neutral).color;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-base font-bold flex items-center gap-2">
            <Brain size={18} className="text-blue-500" /> Recommendation Engine
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">AI-powered push campaigns</p>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-900 rounded-xl p-1 w-fit">
          {(['generate', 'campaigns', 'analytics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize',
                tab === t
                  ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
              )}
            >
              {t === 'generate'   && <Sparkles size={12} className="inline mr-1.5" />}
              {t === 'campaigns'  && <Bell size={12} className="inline mr-1.5" />}
              {t === 'analytics'  && <BarChart3 size={12} className="inline mr-1.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── GENERATE TAB ───────────────────────────────────────────────── */}
        {tab === 'generate' && (
          <div className="space-y-6">

            {/* Market overview banner */}
            {dailyData && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Activity size={15} className="text-blue-500" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Today's Market Analysis</span>
                    </div>
                    <div className={cn('flex items-center gap-1.5 text-base font-bold capitalize', sentimentColor)}>
                      <SentimentIcon size={16} /> {dailyData.market_sentiment}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{new Date(dailyData.generated_at + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST</p>
                    <p className="text-xs text-gray-500">{new Date(dailyData.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{dailyData.summary}</p>
              </div>
            )}

            {/* Pre-analysed stocks grid */}
            {(dailyData?.recommendations?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-yellow-500" />
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Today's AI Picks — click any to load it into the campaign builder
                    </h2>
                  </div>
                  <button onClick={fetchDailyRecs} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <RefreshCw size={13} className={cn(dailyLoading && 'animate-spin text-blue-500')} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dailyData!.recommendations.map((r) => (
                    <DailyRecCard key={r.symbol} rec={r} onSelect={handleSelectDailyRec} />
                  ))}
                </div>
              </div>
            )}

            {dailyLoading && !dailyData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 animate-pulse h-28" />
                ))}
              </div>
            )}

            {/* Custom symbol input */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Search size={14} className="text-blue-500" /> Analyse a custom symbol
              </h2>
              <div className="flex gap-3">
                <input
                  value={genSymbol}
                  onChange={(e) => setGenSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="e.g. TCS, RELIANCE, INFY"
                  className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleGenerate}
                  disabled={genLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors"
                >
                  {genLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {genLoading ? 'Analysing…' : 'Analyse'}
                </button>
              </div>
            </div>

            {/* AI Preview & Campaign Builder */}
            {aiPreview && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {/* Preview header */}
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <Zap size={14} className="text-yellow-500" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Analysis — {aiPreview.symbol}</span>
                  <span className="ml-auto text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">Claude Haiku</span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Action badge row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => { const c = actionConfig[aiPreview.action]; const I = c.icon;
                      return <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold', c.bg, c.color)}><I size={13}/>{c.label}</span>; })()}
                    <span className={cn('text-xs px-2 py-1 rounded-lg font-medium', riskConfig[aiPreview.risk_level].bg, riskConfig[aiPreview.risk_level].color)}>
                      {aiPreview.risk_level} RISK
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">{aiPreview.time_horizon}</span>
                  </div>

                  {/* Key metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Current',    value: aiPreview.current_price ? `₹${aiPreview.current_price.toFixed(2)}` : '—', icon: DollarSign },
                      { label: 'Target',     value: `₹${aiPreview.target_price.toFixed(2)}`, icon: Target },
                      { label: 'Stop-Loss',  value: `₹${aiPreview.stop_loss.toFixed(2)}`,    icon: ShieldAlert },
                      { label: 'Exp. Return',value: `${aiPreview.expected_return.toFixed(1)}%`, icon: Percent },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Icon size={10}/>{label}</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Confidence */}
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">AI Confidence</div>
                    <ConfidenceBar score={aiPreview.confidence_score} />
                  </div>

                  {/* Rationale */}
                  <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-lg p-3">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">Push notification body</div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{aiPreview.rationale}</p>
                  </div>
                </div>

                {/* Editable form */}
                <div className="border-t border-gray-100 dark:border-gray-800 p-5 space-y-4 bg-gray-50/50 dark:bg-gray-900/30">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Customise & Dispatch</h3>

                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Title</label>
                    <input
                      value={form.title || ''}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Rationale</label>
                    <textarea
                      value={form.rationale || ''}
                      onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
                      rows={3}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      ['Target ₹', 'target_price'],
                      ['Stop-Loss ₹', 'stop_loss'],
                      ['Return %', 'expected_return'],
                      ['Confidence', 'confidence_score'],
                    ] as [string, keyof AiPreview][]).map(([label, key]) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
                        <input
                          type="number"
                          value={(form as any)[key] ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || undefined }))}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Segment selector */}
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                      <Users size={11}/> Target Segment
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {Object.entries(segmentLabels).map(([key, label]) => {
                        const count = segmentCounts ? segmentCounts[key as keyof SegmentCounts] : null;
                        return (
                          <button
                            key={key}
                            onClick={() => setForm((f) => ({ ...f, segment: key }))}
                            className={cn(
                              'text-left px-3 py-2 rounded-lg border text-xs transition-all',
                              form.segment === key
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600',
                            )}
                          >
                            <div className="font-medium">{label}</div>
                            {segCountLoading ? (
                              <div className="text-gray-400 mt-0.5">…</div>
                            ) : count != null ? (
                              <div className={cn('mt-0.5 font-semibold', form.segment === key ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400')}>
                                {count} users
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => handleSend(false)}
                      disabled={sendLoading}
                      className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all disabled:opacity-50"
                    >
                      Save as Draft
                    </button>
                    <button
                      onClick={() => handleSend(true)}
                      disabled={sendLoading}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {sendLoading ? <RefreshCw size={13} className="animate-spin"/> : <Send size={13}/>}
                      {sendLoading ? 'Sending…' : 'Send Now'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CAMPAIGNS TAB ─────────────────────────────────────────────── */}
        {tab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{campaigns.length} campaigns</h2>
              <button onClick={fetchCampaigns} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <RefreshCw size={14} className={cn(campsLoading && 'animate-spin text-blue-500')} />
              </button>
            </div>

            {campsLoading && !campaigns.length ? (
              <div className="text-center py-12 text-gray-400">Loading…</div>
            ) : !campaigns.length ? (
              <div className="text-center py-16 text-gray-400">
                <Bell size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No campaigns yet — use the Generate tab to create one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => {
                  const ACfg = actionConfig[c.action];
                  const AIcon = ACfg.icon;
                  const isExpanded = expandedCamp === c.id;
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                      <div className="p-4 flex items-start gap-3">
                        <span className={cn('mt-0.5 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-bold shrink-0', ACfg.bg, ACfg.color)}>
                          <AIcon size={10}/>{ACfg.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {c.symbol} · {segmentLabels[c.segment] ?? c.segment} · {fmtDate(c.created_at)}
                              </p>
                            </div>
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="flex gap-4 mt-2 flex-wrap">
                            {[
                              { label: 'Confidence', value: `${c.confidence_score.toFixed(0)}%` },
                              { label: 'Sent',        value: String(c.sent_count) },
                              { label: 'CTR',         value: ctr(c.total_clicks, c.sent_count) },
                              { label: 'Conversions', value: convRate(c.total_conversions, c.sent_count) },
                            ].map(({ label, value }) => (
                              <div key={label} className="text-xs">
                                <span className="text-gray-400">{label}: </span>
                                <span className="text-gray-700 dark:text-gray-200 font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {c.status === 'draft' && (
                            <>
                              <button onClick={() => handleSendDraft(c.id)} className="text-xs px-2.5 py-1.5 bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-blue-600 dark:text-blue-400 rounded-lg transition-colors">Send</button>
                              <button onClick={() => handleCancel(c.id)} className="text-xs px-2.5 py-1.5 bg-red-50 dark:bg-red-600/10 hover:bg-red-100 dark:hover:bg-red-600/20 text-red-500 rounded-lg transition-colors">Cancel</button>
                            </>
                          )}
                          <button onClick={() => toggleCampDetail(c.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ml-1">
                            {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900/50">
                          {detailLoading && !campDetail ? (
                            <div className="text-sm text-gray-400">Loading…</div>
                          ) : campDetail?.campaign?.id === c.id ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { label: 'Target',    value: c.target_price ? `₹${c.target_price.toFixed(2)}` : '—' },
                                  { label: 'Stop-Loss', value: c.stop_loss ? `₹${c.stop_loss.toFixed(2)}` : '—' },
                                  { label: 'Exp. Return', value: c.expected_return ? `${c.expected_return.toFixed(1)}%` : '—' },
                                  { label: 'Risk',      value: c.risk_level },
                                ].map(({ label, value }) => (
                                  <div key={label} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                                    <div className="text-xs text-gray-400 mb-1">{label}</div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                                  </div>
                                ))}
                              </div>
                              {c.rationale && <div className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg p-3">{c.rationale}</div>}
                              {campDetail.sends?.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-400 mb-2">Delivery log ({campDetail.sends.length})</p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                          {['User', 'Sent', 'Clicked', 'Converted'].map(h => <th key={h} className="text-left pb-2 font-medium">{h}</th>)}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {campDetail.sends.slice(0, 20).map((s: any) => (
                                          <tr key={s.id} className="text-gray-600 dark:text-gray-300">
                                            <td className="py-2">{s.user_name}</td>
                                            <td className="py-2 text-gray-400">{new Date(s.sent_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</td>
                                            <td className="py-2">{s.clicked_at ? <span className="text-green-500">✓</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                            <td className="py-2">{s.order_placed_at ? <span className="text-blue-500">✓ Traded</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ─────────────────────────────────────────────── */}
        {tab === 'analytics' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Recommendation Performance</h2>
              <button onClick={fetchCampaigns} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <RefreshCw size={14} className={cn(campsLoading && 'animate-spin text-blue-500')} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Sent',        value: totalSent.toLocaleString(),  icon: Send,         color: 'text-blue-500' },
                { label: 'Total Clicks',      value: totalClicks.toLocaleString(),icon: Eye,          color: 'text-green-500' },
                { label: 'Total Conversions', value: totalConv.toLocaleString(),  icon: CheckCircle,  color: 'text-purple-500' },
                { label: 'Avg Confidence',    value: `${avgConf.toFixed(0)}%`,    icon: Brain,        color: 'text-yellow-500' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <Icon size={18} className={cn('mb-2', color)} />
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {totalSent > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Engagement Funnel</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Notifications Sent', value: totalSent,   color: 'bg-blue-500' },
                    { label: 'Opened / Clicked',   value: totalClicks, color: 'bg-green-500' },
                    { label: 'Trades Executed',    value: totalConv,   color: 'bg-purple-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                          {value.toLocaleString()} ({totalSent ? ((value / totalSent) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: totalSent ? `${Math.min(100, (value / totalSent) * 100)}%` : '0%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sentCamps.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Per-Campaign Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        {['Title','Action','Confidence','Sent','CTR','Conv. Rate','Date'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {sentCamps.map((c) => {
                        const cfg = actionConfig[c.action]; const I = cfg.icon;
                        return (
                          <tr key={c.id} className="text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 max-w-xs truncate font-medium text-gray-900 dark:text-white">{c.title}</td>
                            <td className="px-4 py-3"><span className={cn('inline-flex items-center gap-1 font-bold', cfg.color)}><I size={10}/>{cfg.label}</span></td>
                            <td className="px-4 py-3">{c.confidence_score.toFixed(0)}%</td>
                            <td className="px-4 py-3">{c.sent_count}</td>
                            <td className="px-4 py-3 text-green-600 dark:text-green-400">{ctr(c.total_clicks, c.sent_count)}</td>
                            <td className="px-4 py-3 text-purple-600 dark:text-purple-400">{convRate(c.total_conversions, c.sent_count)}</td>
                            <td className="px-4 py-3 text-gray-400">{c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-IN') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!sentCamps.length && (
              <div className="text-center py-16 text-gray-400">
                <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No sent campaigns yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
