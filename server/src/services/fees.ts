/**
 * Broker / STT / exchange / GST / stamp simulation for paper-trading fills.
 *
 * Rates approximate a discount-broker model (Zerodha-style):
 *   - Equity delivery (CNC): ₹0 brokerage; STT 0.1% both sides; stamp 0.015% buy.
 *   - Equity intraday (MIS): 0.03% or ₹20 (whichever lower); STT 0.025% sell only;
 *     stamp 0.003% buy.
 *   - Common: exchange 0.00345%, SEBI ~₹10/Cr, GST 18% on brokerage+exchange+SEBI.
 *
 * Numbers are illustrative — the goal is to make paper P&L *roughly* mirror what
 * a real trader would net after costs, not to replicate any specific broker's
 * fee schedule down to the paisa.
 */

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  gst: number;
  stamp: number;
  total: number;
}

const BROKERAGE_INTRADAY_RATE = 0.0003; // 0.03%
const BROKERAGE_CAP = 20;               // ₹20 max per executed order

const STT_DELIVERY_RATE = 0.001;        // 0.1% on both buy & sell (CNC)
const STT_INTRADAY_SELL = 0.00025;      // 0.025% sell-only (MIS)

const EXCHANGE_TXN_RATE = 0.0000345;    // 0.00345% NSE equity
const SEBI_RATE         = 0.000001;     // ₹10 per crore turnover

const GST_RATE          = 0.18;         // 18% on (brokerage + exchange + SEBI)

const STAMP_DELIVERY    = 0.00015;      // 0.015% buy-side (CNC)
const STAMP_INTRADAY    = 0.00003;      // 0.003%  buy-side (MIS)

export function computeCharges(
  side: 'BUY' | 'SELL',
  productType: 'CNC' | 'MIS',
  quantity: number,
  price: number,
): ChargeBreakdown {
  const turnover = quantity * price;
  if (turnover <= 0) {
    return { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0, total: 0 };
  }
  const isBuy   = side === 'BUY';
  const isMIS   = productType === 'MIS';

  // Brokerage: free for CNC, capped intraday rate for MIS
  const brokerage = isMIS ? Math.min(turnover * BROKERAGE_INTRADAY_RATE, BROKERAGE_CAP) : 0;

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

  const total = brokerage + stt + exchange + sebi + gst + stamp;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    brokerage: round(brokerage),
    stt:       round(stt),
    exchange:  round(exchange),
    sebi:      round(sebi),
    gst:       round(gst),
    stamp:     round(stamp),
    total:     round(total),
  };
}
