// US equity trading fees (paper-trading simulation).
//
// Models a Robinhood/Schwab-style $0-commission broker with the real
// regulatory pass-through fees:
//   - SEC fee (sells only): $27.10 per $1M of proceeds = 0.00271%
//   - FINRA TAF (sells only): $0.000166 per share, capped at $8.30 / trade
//   - Brokerage: $0
// Plus an optional slippage simulation (off by default).
//
// Returns the same `ChargeBreakdown` shape as `fees.ts` so the orders flow
// is shape-stable — we just zero out the fields that don't apply to US.

import type { ChargeBreakdown } from './fees.js';

const SEC_FEE_RATE  = 0.0000271;        // $27.10 per $1M of sell proceeds
const FINRA_TAF     = 0.000166;         // $ per share, sells only
const FINRA_TAF_CAP = 8.30;             // max FINRA TAF per trade

/**
 * Charges are returned in **USD** — the caller multiplies by the locked FX
 * rate to record the rupee equivalent on the transaction row.
 */
export function computeChargesUS(
  side: 'BUY' | 'SELL',
  productType: 'DAY' | 'GTC',
  quantity: number,
  priceUsd: number,
): ChargeBreakdown {
  const turnover = quantity * priceUsd;
  if (turnover <= 0) {
    return { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0, dp: 0, total: 0 };
  }

  // No brokerage on US equities (paper Robinhood model).
  const brokerage = 0;

  // SEC fee — sells only.
  const secFee = side === 'SELL' ? turnover * SEC_FEE_RATE : 0;

  // FINRA TAF — sells only, capped at $8.30.
  const finraTaf = side === 'SELL' ? Math.min(quantity * FINRA_TAF, FINRA_TAF_CAP) : 0;

  // We map US fees into the existing `ChargeBreakdown` shape:
  //   exchange ← SEC fee (the closest analog)
  //   sebi     ← FINRA TAF (regulator pass-through)
  // brokerage/stt/gst/stamp/dp are zero on the US side.
  const total = brokerage + secFee + finraTaf;

  const round = (n: number) => Math.round(n * 1000) / 1000; // 3dp — cents matter

  return {
    brokerage: round(brokerage),
    stt:       0,
    exchange:  round(secFee),
    sebi:      round(finraTaf),
    gst:       0,
    stamp:     0,
    dp:        0,
    total:     round(total),
  };
}
