// Risk profiles for the AI Trade engine.
//
// The user picks a risk *category*; that single choice drives a proper,
// volatility-aware risk model — not flat percentages. Concretely it sets:
//   • how much capital is risked per trade (the real lever),
//   • how wide the stop is in units of the stock's own ATR (adaptive),
//   • the reward:risk ratio that places the target,
//   • the trailing-stop distance (also in ATR),
//   • single-name and portfolio-wide exposure / risk caps,
//   • trade frequency and the confidence bar for an entry.
//
// Low Risk  → small risk/trade, tight ATR stop, modest R:R, few high-conviction trades.
// High Risk → larger risk/trade, wider ATR stop, bigger R:R, aggressive/frequent entries.

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

export interface RiskProfile {
  level: RiskLevel;
  label: string;
  /** Capital risked if the stop is hit, as % of allocated capital. THE core lever. */
  riskPerTradePct: number;
  /** Stop distance = atrStopMult × ATR(14). Adapts the stop to each stock's volatility. */
  atrStopMult: number;
  /** Target distance = rewardRisk × stop distance (e.g. 2 ⇒ risk ₹1 to make ₹2). */
  rewardRisk: number;
  /** Trailing-stop distance in ATR multiples. 0 = no trailing. */
  trailAtrMult: number;
  /** Max single-position notional as % of allocated capital (concentration cap). */
  maxPositionPct: number;
  /** Cap on total simultaneous open risk (sum of per-trade risk) as % of capital. */
  maxConcurrentRiskPct: number;
  /** Max simultaneous open positions. */
  maxPositions: number;
  /** Max new entries per day. */
  maxTradesPerDay: number;
  /** Minimum composite confidence (0-100) an entry candidate must clear. */
  minConfidence: number;
  /** Fallback flat stop % when ATR is unavailable (thin candle history). */
  fallbackStopPct: number;
}

export const RISK_PROFILES: Record<RiskLevel, RiskProfile> = {
  conservative: {
    level: 'conservative',
    label: 'Low Risk',
    riskPerTradePct: 0.5,
    atrStopMult: 1.5,
    rewardRisk: 2.0,
    trailAtrMult: 1.0,
    maxPositionPct: 15,
    maxConcurrentRiskPct: 1.5,
    maxPositions: 3,
    maxTradesPerDay: 4,
    minConfidence: 72,
    fallbackStopPct: 0.5,
  },
  moderate: {
    level: 'moderate',
    label: 'Medium Risk',
    riskPerTradePct: 1.0,
    atrStopMult: 2.0,
    rewardRisk: 2.0,
    trailAtrMult: 1.5,
    maxPositionPct: 25,
    maxConcurrentRiskPct: 3.0,
    maxPositions: 5,
    maxTradesPerDay: 8,
    minConfidence: 62,
    fallbackStopPct: 1.0,
  },
  aggressive: {
    level: 'aggressive',
    label: 'High Risk',
    riskPerTradePct: 2.0,
    atrStopMult: 2.5,
    rewardRisk: 2.5,
    trailAtrMult: 2.0,
    maxPositionPct: 40,
    maxConcurrentRiskPct: 6.0,
    maxPositions: 8,
    maxTradesPerDay: 16,
    minConfidence: 52,
    fallbackStopPct: 2.0,
  },
};

export function getRiskProfile(level: string | null | undefined): RiskProfile {
  return RISK_PROFILES[(level as RiskLevel)] ?? RISK_PROFILES.moderate;
}

// ── Risk maths (long-only) ───────────────────────────────────────────────────

export interface TradeStops {
  stopLoss: number;
  target: number;
  /** Per-share risk in ₹ (entry − stop). */
  stopDistance: number;
  /** Trailing distance expressed as % (consumed by the engine's trailing logic). */
  trailingPct: number;
}

/**
 * Volatility-adaptive stop & target. `atrValue` is the stock's ATR in ₹; when
 * absent (thin history) we fall back to a flat % stop. Target is placed at a
 * reward:risk multiple of the stop distance.
 */
export function computeStops(profile: RiskProfile, entry: number, atrValue: number | null): TradeStops {
  const stopDistance = atrValue && atrValue > 0
    ? atrValue * profile.atrStopMult
    : entry * (profile.fallbackStopPct / 100);
  const stopLoss = Math.max(0.05, entry - stopDistance);
  const target = entry + profile.rewardRisk * stopDistance;
  const trailDistance = atrValue && atrValue > 0
    ? atrValue * profile.trailAtrMult
    : entry * (profile.fallbackStopPct / 100);
  const trailingPct = entry > 0 ? (trailDistance / entry) * 100 : 0;
  return { stopLoss, target, stopDistance, trailingPct };
}

export interface SizingInput {
  profile: RiskProfile;
  /** Capital the engine is allowed to deploy for this user. */
  allocatedCapital: number;
  entry: number;
  stopDistance: number;
  /** Cash actually available to spend right now. */
  availableCash: number;
  /** Sum of risk (₹) already committed across open positions. */
  openRiskRupees: number;
}

export interface SizingResult {
  qty: number;
  riskRupees: number;
  /** Human note when sizing is constrained (cap hit / no room / unaffordable). */
  note: string;
}

/**
 * Position size from risk, not gut feel:
 *   qty = (capital × risk%/100) ÷ per-share-risk
 * then clamped by the single-name concentration cap, the portfolio-wide
 * concurrent-risk cap, and available cash.
 */
export function sizePosition(input: SizingInput): SizingResult {
  const { profile, allocatedCapital, entry, stopDistance, availableCash, openRiskRupees } = input;
  if (stopDistance <= 0 || entry <= 0) return { qty: 0, riskRupees: 0, note: 'invalid stop' };

  const riskBudget = allocatedCapital * (profile.riskPerTradePct / 100);
  const maxConcurrentRisk = allocatedCapital * (profile.maxConcurrentRiskPct / 100);
  const riskRoom = Math.max(0, maxConcurrentRisk - openRiskRupees);
  const effectiveRiskBudget = Math.min(riskBudget, riskRoom);
  if (effectiveRiskBudget <= 0) return { qty: 0, riskRupees: 0, note: 'portfolio risk cap reached' };

  let qty = Math.floor(effectiveRiskBudget / stopDistance);
  let note = 'risk-based';

  // Concentration cap: no single name above maxPositionPct of capital.
  const maxNotionalQty = Math.floor((allocatedCapital * (profile.maxPositionPct / 100)) / entry);
  if (qty > maxNotionalQty) { qty = maxNotionalQty; note = 'capped by position size'; }

  // Affordability.
  const affordableQty = Math.floor(availableCash / entry);
  if (qty > affordableQty) { qty = affordableQty; note = 'capped by available cash'; }

  qty = Math.max(0, qty);
  return { qty, riskRupees: qty * stopDistance, note: qty < 1 ? 'insufficient room/cash' : note };
}
