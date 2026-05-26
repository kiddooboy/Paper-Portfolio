// Risk profiles for the AI Trade engine.
//
// The user picks a risk *category*; that single choice drives the concrete
// numbers the engine trades with — target %, stop-loss %, trailing logic,
// how aggressively it sizes a position, how many trades it'll take in a day,
// and the confidence bar an entry must clear.
//
// Low Risk  → tight SL + modest target + few, high-conviction trades
// High Risk → wider SL + bigger target + aggressive, frequent entries

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

export interface RiskProfile {
  level: RiskLevel;
  label: string;
  /** Take-profit, % above entry. */
  targetPct: number;
  /** Hard stop-loss, % below entry. */
  stopLossPct: number;
  /** Trailing-stop distance, % off the high-water mark. 0 = no trailing. */
  trailingPct: number;
  /** Fraction of per-trade budget actually deployed (sizing aggressiveness). */
  sizingFactor: number;
  /** Engine won't exceed this many *new entries* per day per user (capped again by config). */
  maxTradesPerDay: number;
  /** Minimum composite confidence (0-100) an entry candidate must clear. */
  minConfidence: number;
  /** Default max simultaneous open positions. */
  maxPositions: number;
}

export const RISK_PROFILES: Record<RiskLevel, RiskProfile> = {
  conservative: {
    level: 'conservative',
    label: 'Low Risk',
    targetPct: 0.8,
    stopLossPct: 0.5,
    trailingPct: 0.3,
    sizingFactor: 0.6,
    maxTradesPerDay: 4,
    minConfidence: 72,
    maxPositions: 3,
  },
  moderate: {
    level: 'moderate',
    label: 'Medium Risk',
    targetPct: 1.5,
    stopLossPct: 1.0,
    trailingPct: 0.6,
    sizingFactor: 0.8,
    maxTradesPerDay: 8,
    minConfidence: 62,
    maxPositions: 5,
  },
  aggressive: {
    level: 'aggressive',
    label: 'High Risk',
    targetPct: 3.0,
    stopLossPct: 2.0,
    trailingPct: 1.2,
    sizingFactor: 1.0,
    maxTradesPerDay: 16,
    minConfidence: 52,
    maxPositions: 8,
  },
};

export function getRiskProfile(level: string | null | undefined): RiskProfile {
  return RISK_PROFILES[(level as RiskLevel)] ?? RISK_PROFILES.moderate;
}
