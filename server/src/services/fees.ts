/**
 * Broker / STT / exchange / GST / stamp / DP simulation for paper-trading fills.
 *
 * Modelled on **Groww's** published charge schedule (NSE equity):
 *   - Brokerage (delivery & intraday): ₹20 or 0.1% of turnover, whichever is
 *     LOWER, with a ₹5 minimum per executed order.
 *   - STT: delivery 0.1% on buy & sell; intraday 0.025% on sell only.
 *   - Exchange transaction charge (NSE): 0.00297% of turnover.
 *   - SEBI turnover fee: ₹10 per crore (0.0001%).
 *   - GST: 18% on (brokerage + exchange + SEBI).
 *   - Stamp duty (buy side): delivery 0.015%, intraday 0.003%.
 *   - DP charge: ₹13.5 + 18% GST per scrip on the SELL side of DELIVERY only
 *     (depository/CDSL charge Groww passes through).
 *
 * The goal is to make paper P&L mirror what a Groww user actually nets after
 * costs. (Per-scrip-per-day DP nuance is approximated as per delivery-sell.)
 */

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  gst: number;
  stamp: number;
  dp: number;
  total: number;
}

const BROKERAGE_RATE   = 0.001;  // 0.1% of turnover
const BROKERAGE_CAP    = 20;     // ₹20 max per executed order
const BROKERAGE_MIN    = 5;      // ₹5 min per executed order

const STT_DELIVERY_RATE = 0.001;        // 0.1% on both buy & sell (CNC)
const STT_INTRADAY_SELL = 0.00025;      // 0.025% sell-only (MIS)

const EXCHANGE_TXN_RATE = 0.0000297;    // 0.00297% NSE equity
const SEBI_RATE         = 0.000001;     // ₹10 per crore turnover

const GST_RATE          = 0.18;         // 18% on (brokerage + exchange + SEBI)

const STAMP_DELIVERY    = 0.00015;      // 0.015% buy-side (CNC)
const STAMP_INTRADAY    = 0.00003;      // 0.003%  buy-side (MIS)

const DP_CHARGE         = 13.5;         // ₹13.5 + GST per scrip on delivery sell

export function computeCharges(
  side: 'BUY' | 'SELL',
  productType: 'CNC' | 'MIS',
  quantity: number,
  price: number,
): ChargeBreakdown {
  const turnover = quantity * price;
  if (turnover <= 0) {
    return { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0, dp: 0, total: 0 };
  }
  const isBuy = side === 'BUY';
  const isMIS = productType === 'MIS';

  // Brokerage: ₹20 or 0.1% whichever lower, floored at ₹5 (same for CNC & MIS).
  const brokerage = Math.max(BROKERAGE_MIN, Math.min(BROKERAGE_CAP, turnover * BROKERAGE_RATE));

  // STT
  let stt = 0;
  if (isMIS) {
    if (!isBuy) stt = turnover * STT_INTRADAY_SELL;
  } else {
    stt = turnover * STT_DELIVERY_RATE; // both sides
  }

  const exchange = turnover * EXCHANGE_TXN_RATE;
  const sebi     = turnover * SEBI_RATE;
  const gst      = (brokerage + exchange + sebi) * GST_RATE;
  const stamp    = isBuy ? turnover * (isMIS ? STAMP_INTRADAY : STAMP_DELIVERY) : 0;

  // DP charge: delivery sell only (₹13.5 + 18% GST per scrip).
  const dp = (!isMIS && !isBuy) ? DP_CHARGE * (1 + GST_RATE) : 0;

  const total = brokerage + stt + exchange + sebi + gst + stamp + dp;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    brokerage: round(brokerage),
    stt:       round(stt),
    exchange:  round(exchange),
    sebi:      round(sebi),
    gst:       round(gst),
    stamp:     round(stamp),
    dp:        round(dp),
    total:     round(total),
  };
}
