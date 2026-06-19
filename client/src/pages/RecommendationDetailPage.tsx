import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  TrendingUp, TrendingDown, Minus, Target, ShieldAlert, ArrowLeft,
  Zap, Brain, CheckCircle, AlertTriangle, Percent, DollarSign,
  ChevronRight, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useMarketStore } from '../store/marketStore';
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
  sent_at: string | null;
};

type OrderState = {
  quantity: string;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice: string;
  productType: 'CNC' | 'MIS';
};

// ── Helpers ────────────────────────────────────────────────────────────────

const actionConfig = {
  BUY:  {
    color:    'text-green-600 dark:text-green-400',
    bg:       'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30',
    btnBg:    'bg-green-600 hover:bg-green-700',
    icon:     TrendingUp,
    label:    'BUY',
  },
  SELL: {
    color:    'text-red-600 dark:text-red-400',
    bg:       'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30',
    btnBg:    'bg-red-600 hover:bg-red-700',
    icon:     TrendingDown,
    label:    'SELL',
  },
  HOLD: {
    color:    'text-yellow-600 dark:text-yellow-400',
    bg:       'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30',
    btnBg:    'bg-yellow-600 hover:bg-yellow-700',
    icon:     Minus,
    label:    'HOLD',
  },
};

const riskConfig = {
  LOW:    { color: 'text-green-600 dark:text-green-400',   label: 'Low Risk'    },
  MEDIUM: { color: 'text-yellow-600 dark:text-yellow-400', label: 'Medium Risk' },
  HIGH:   { color: 'text-red-600 dark:text-red-400',       label: 'High Risk'   },
};

// ── Confidence ring ────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
  const r = 24, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg width={64} height={64} className="-rotate-90">
          <circle cx={32} cy={32} r={r} fill="none"
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth={5} />
          <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-sm font-bold text-gray-900 dark:text-white leading-none">{pct.toFixed(0)}%</div>
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Confidence</div>
    </div>
  );
}

// ── Risk bar ───────────────────────────────────────────────────────────────

function RiskBar({ risk }: { risk: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const segments = ['LOW', 'MEDIUM', 'HIGH'] as const;
  const idx = segments.indexOf(risk);
  const activeColor = risk === 'LOW' ? 'bg-green-500' : risk === 'MEDIUM' ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex gap-1 mt-1">
      {segments.map((s, i) => (
        <div
          key={s}
          className={cn('h-1.5 flex-1 rounded-full', i <= idx ? activeColor : 'bg-gray-200 dark:bg-gray-700')}
        />
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quotes = useMarketStore((s) => s.quotes);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const [order, setOrder] = useState<OrderState>({
    quantity: '1',
    orderType: 'MARKET',
    limitPrice: '',
    productType: 'CNC',
  });

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const { data } = await axios.get(`/api/admin/recommendations/campaign/${id}`);
        setCampaign(data.campaign);
        axios.post(`/api/admin/recommendations/campaign/${id}/click`).catch(() => {});
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Recommendation not found');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <RefreshCw size={24} className="animate-spin text-blue-500 dark:text-blue-400" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center text-center p-6 transition-colors">
        <AlertTriangle size={40} className="text-yellow-500 dark:text-yellow-400 mb-4" />
        <p className="text-gray-900 dark:text-white font-semibold mb-2">Recommendation unavailable</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{error || 'This recommendation may have expired.'}</p>
        <button onClick={() => navigate('/recommendations')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          View all recommendations
        </button>
      </div>
    );
  }

  const livePrice = quotes[campaign.symbol]?.price ?? campaign.current_price ?? null;
  const cfg = actionConfig[campaign.action];
  const riskCfg = riskConfig[campaign.risk_level];
  const AIcon = cfg.icon;

  const handlePlaceOrder = async () => {
    if (!campaign || campaign.action === 'HOLD') return;
    const qty = parseInt(order.quantity, 10);
    if (!qty || qty < 1) { toast.error('Enter a valid quantity'); return; }

    setPlacing(true);
    try {
      const payload: any = {
        symbol: campaign.symbol,
        type: order.orderType,
        transaction_type: campaign.action,
        quantity: qty,
        price: order.orderType === 'LIMIT' ? parseFloat(order.limitPrice) || livePrice || 0 : livePrice || 0,
        product_type: order.productType,
      };
      if (campaign.target_price) payload.target_price = campaign.target_price;
      if (campaign.stop_loss) payload.trigger_price = campaign.stop_loss;

      const { data } = await axios.post('/api/orders', payload);

      axios.post(`/api/admin/recommendations/campaign/${campaign.id}/convert`, {
        order_id: data.order?.id,
      }).catch(() => {});

      setPlaced(true);
      setShowOrderModal(false);
      toast.success(`Order placed: ${campaign.action} ${qty} × ${campaign.symbol}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  const estimatedValue = livePrice && parseInt(order.quantity) > 0
    ? (livePrice * parseInt(order.quantity)).toFixed(2)
    : null;

  const rr = campaign.target_price && campaign.stop_loss && livePrice
    ? ((campaign.target_price - livePrice) / (livePrice - campaign.stop_loss)).toFixed(2)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-3 transition-colors">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">AI Recommendation</p>
          <p className="text-sm font-semibold truncate">{campaign.title}</p>
        </div>
        {campaign.ai_generated ? (
          <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
            <Brain size={10} /> AI
          </span>
        ) : null}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4 pb-32">
        {/* Hero card */}
        <div className={cn('rounded-2xl border p-5 space-y-4', cfg.bg)}>
          {/* Symbol + action */}
          <div className="flex items-center justify-between">
            <div>
              <div className={cn('text-3xl font-black tracking-tight', cfg.color)}>{campaign.symbol}</div>
              {livePrice && (
                <div className="text-gray-600 dark:text-gray-300 text-sm mt-0.5">
                  ₹{livePrice.toFixed(2)} <span className="text-gray-400">current</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <span className={cn('inline-flex items-center gap-1.5 text-lg font-black px-3 py-1.5 rounded-xl border', cfg.bg, cfg.color)}>
                <AIcon size={16} /> {cfg.label}
              </span>
            </div>
          </div>

          {/* Target / SL / Return */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Target',    value: campaign.target_price   ? `₹${campaign.target_price.toFixed(2)}` : '—',                 icon: Target,      color: 'text-green-600 dark:text-green-400' },
              { label: 'Stop-Loss', value: campaign.stop_loss      ? `₹${campaign.stop_loss.toFixed(2)}`    : '—',                  icon: ShieldAlert, color: 'text-red-600 dark:text-red-400'     },
              { label: 'Return',    value: campaign.expected_return ? `${campaign.expected_return.toFixed(1)}%` : '—',              icon: Percent,     color: 'text-blue-600 dark:text-blue-400'   },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/50 dark:bg-black/20 rounded-xl p-3 text-center">
                <Icon size={14} className={cn('mx-auto mb-1', color)} />
                <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                <div className={cn('text-sm font-bold mt-0.5', color)}>{value}</div>
              </div>
            ))}
          </div>

          {/* Confidence + Risk */}
          <div className="flex items-center gap-4">
            <ConfidenceRing score={campaign.confidence_score} />
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-gray-500 dark:text-gray-400">Risk Level</span>
                <span className={cn('font-semibold', riskCfg.color)}>{riskCfg.label}</span>
              </div>
              <RiskBar risk={campaign.risk_level} />
              {rr && (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Risk-Reward: <span className="text-gray-900 dark:text-white font-semibold">1 : {rr}</span>
                </div>
              )}
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Horizon: <span className="text-gray-900 dark:text-white font-semibold">{campaign.time_horizon}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rationale */}
        {campaign.rationale && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 transition-colors">
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
              <Zap size={12} className="text-yellow-500 dark:text-yellow-400" /> Analysis
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{campaign.rationale}</p>
          </div>
        )}

        {/* Disclosure */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl p-3 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-500 dark:text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-800 dark:text-yellow-200/70 leading-relaxed">
            This is a paper trading simulation. Recommendations are AI-generated for educational purposes only and do not constitute real financial advice.
          </p>
        </div>

        {/* Success state */}
        {placed && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/40 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">Order placed successfully</p>
              <button onClick={() => navigate('/orders')} className="text-xs text-green-600 dark:text-green-400 underline mt-0.5">
                View in Orders →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      {!placed && campaign.action !== 'HOLD' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 transition-colors">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setShowOrderModal(true)}
              className={cn('w-full py-4 rounded-xl font-bold text-base text-white flex items-center justify-center gap-2 transition-colors', cfg.btnBg)}
            >
              <AIcon size={18} />
              {campaign.action === 'BUY' ? 'Confirm Buy' : 'Confirm Sell'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white text-lg">
                    {campaign.action} {campaign.symbol}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Review and confirm your order</p>
                </div>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Pre-filled info */}
              <div className="grid grid-cols-2 gap-3">
                {livePrice && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1"><DollarSign size={10} /> Market Price</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">₹{livePrice.toFixed(2)}</div>
                  </div>
                )}
                {campaign.target_price && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1"><Target size={10} /> Target</div>
                    <div className="text-sm font-bold text-green-600 dark:text-green-400">₹{campaign.target_price.toFixed(2)}</div>
                  </div>
                )}
                {campaign.stop_loss && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1"><ShieldAlert size={10} /> Stop-Loss</div>
                    <div className="text-sm font-bold text-red-600 dark:text-red-400">₹{campaign.stop_loss.toFixed(2)}</div>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1"><Brain size={10} /> Confidence</div>
                  <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{campaign.confidence_score.toFixed(0)}%</div>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={order.quantity}
                  onChange={(e) => setOrder((o) => ({ ...o, quantity: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Order type */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Order Type</label>
                <div className="flex gap-2">
                  {(['MARKET', 'LIMIT'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOrder((o) => ({ ...o, orderType: t }))}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                        order.orderType === t
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {order.orderType === 'LIMIT' && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Limit Price ₹</label>
                  <input
                    type="number"
                    value={order.limitPrice}
                    onChange={(e) => setOrder((o) => ({ ...o, limitPrice: e.target.value }))}
                    placeholder={livePrice?.toFixed(2)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Product type */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Product</label>
                <div className="flex gap-2">
                  {(['CNC', 'MIS'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOrder((o) => ({ ...o, productType: t }))}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                        order.productType === t
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600',
                      )}
                    >
                      {t === 'CNC' ? 'CNC (Hold)' : 'MIS (Intraday)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value estimate */}
              {estimatedValue && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Estimated value</span>
                  <span className="font-bold text-gray-900 dark:text-white">₹{estimatedValue}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className={cn('w-full py-3.5 rounded-xl font-bold text-base text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60', cfg.btnBg)}
              >
                {placing ? <RefreshCw size={16} className="animate-spin" /> : <AIcon size={16} />}
                {placing ? 'Placing…' : `Confirm ${campaign.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
