// Signal engine — the deterministic "analysis agents" of the AI Trade system.
//
// Per the chosen design (rules decide, Claude explains), this module makes the
// actual long/skip call. It runs several independent analysis modules over the
// intraday candles + live quote, each contributing a weighted sub-score and a
// human reason, then folds them into a composite confidence (0-100).
//
// Long-only intraday for now (paper engine buys to open, sells to close).

import {
  calcEMA, calcRSI, calcMACD, calcVWAP, calcATR, calcBollinger, calcSupertrend, type Bar,
} from '../indicators.js';

export interface AgentSignal {
  agent: string;      // which "agent" produced it
  score: number;      // contribution toward confidence (can be negative)
  detail: string;     // one-line human explanation
}

export interface SignalResult {
  symbol: string;
  confidence: number;            // 0-100 composite
  action: 'enter' | 'skip';
  bias: 'bullish' | 'bearish' | 'neutral';
  reasons: string[];             // top positive reasons
  signals: AgentSignal[];        // full per-agent breakdown
  snapshot: {
    price: number;
    rsi: number | null;
    macdHist: number | null;
    ema9: number | null;
    ema21: number | null;
    supertrend: 1 | -1 | null;
    atrPct: number | null;
    atr: number | null;
    vwap: number | null;
    volSurge: number | null;     // current vol ÷ avg vol
    nearBreakout: boolean;
  };
}

const last = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

/**
 * Analyse one symbol. `bars` are intraday OHLC (oldest → newest); `price` is
 * the live last price; `changePct` is the day's % change.
 */
export function analyzeSymbol(
  symbol: string,
  bars: Bar[],
  price: number,
  changePct: number,
): SignalResult {
  let activeBars = bars;
  if (bars.length < 30 && process.env.BYPASS_MARKET_HOURS === 'true') {
    // Generate mock constructive intraday candles for sandbox offline testing!
    activeBars = [];
    const basePrice = price || 100;
    const nowMs = Date.now();
    for (let i = 0; i < 50; i++) {
      const date = new Date(nowMs - (50 - i) * 5 * 60000);
      const open = basePrice * (1 + (i - 1) * 0.0006 + (Math.random() - 0.25) * 0.0004);
      const close = basePrice * (1 + i * 0.0006 + (Math.random() - 0.25) * 0.0004);
      const high = Math.max(open, close) * 1.001;
      const low = Math.min(open, close) * 0.999;
      const volume = 20000 + Math.floor(Math.random() * 10000);
      activeBars.push({ date: date.toISOString(), open, high, low, close, volume });
    }
  }

  const signals: AgentSignal[] = [];
  const closes = activeBars.map(b => b.close).filter(n => Number.isFinite(n));

  const snapshot: SignalResult['snapshot'] = {
    price, rsi: null, macdHist: null, ema9: null, ema21: null,
    supertrend: null, atrPct: null, atr: null, vwap: null, volSurge: null, nearBreakout: false,
  };

  // Need enough candles to be meaningful.
  if (closes.length < 30) {
    return {
      symbol, confidence: 0, action: 'skip', bias: 'neutral',
      reasons: ['Insufficient candle history'], signals, snapshot,
    };
  }

  // ── Trend Agent: Supertrend direction + EMA9/EMA21 stack ──
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const st = calcSupertrend(activeBars, 10, 3);
  const e9 = last(ema9) ?? null, e21 = last(ema21) ?? null;
  const stDir = last(st)?.dir ?? null;
  snapshot.ema9 = e9; snapshot.ema21 = e21; snapshot.supertrend = stDir;
  if (stDir === 1) signals.push({ agent: 'Trend', score: 18, detail: 'Supertrend is bullish' });
  else if (stDir === -1) signals.push({ agent: 'Trend', score: -22, detail: 'Supertrend is bearish' });
  if (e9 != null && e21 != null) {
    if (e9 > e21) signals.push({ agent: 'Trend', score: 14, detail: 'EMA9 above EMA21 (uptrend)' });
    else signals.push({ agent: 'Trend', score: -14, detail: 'EMA9 below EMA21 (downtrend)' });
  }

  // ── Momentum Agent: RSI + MACD histogram ──
  const rsiArr = calcRSI(closes, 14);
  const rsi = last(rsiArr) ?? null;
  snapshot.rsi = rsi;
  if (rsi != null) {
    if (rsi >= 55 && rsi <= 70) signals.push({ agent: 'Momentum', score: 16, detail: `RSI ${rsi.toFixed(0)} — healthy momentum` });
    else if (rsi > 70) signals.push({ agent: 'Momentum', score: -8, detail: `RSI ${rsi.toFixed(0)} — overbought` });
    else if (rsi < 35) signals.push({ agent: 'Momentum', score: -10, detail: `RSI ${rsi.toFixed(0)} — weak` });
    else signals.push({ agent: 'Momentum', score: 4, detail: `RSI ${rsi.toFixed(0)} — neutral` });
  }
  const macd = calcMACD(closes);
  const hist = last(macd)?.histogram ?? null;
  const prevHist = macd[macd.length - 2]?.histogram ?? null;
  snapshot.macdHist = hist;
  if (hist != null) {
    if (hist > 0 && prevHist != null && hist > prevHist) signals.push({ agent: 'Momentum', score: 14, detail: 'MACD rising above zero' });
    else if (hist > 0) signals.push({ agent: 'Momentum', score: 8, detail: 'MACD positive' });
    else signals.push({ agent: 'Momentum', score: -10, detail: 'MACD negative' });
  }

  // ── Volatility Agent: ATR as % of price (context for sizing/SL) ──
  const atr = last(calcATR(activeBars, 14)) ?? null;
  const atrPct = atr != null && price > 0 ? (atr / price) * 100 : null;
  snapshot.atrPct = atrPct;
  snapshot.atr = atr;
  if (atrPct != null) {
    if (atrPct > 4) signals.push({ agent: 'Volatility', score: -8, detail: `ATR ${atrPct.toFixed(1)}% — choppy` });
    else if (atrPct >= 0.6) signals.push({ agent: 'Volatility', score: 6, detail: `ATR ${atrPct.toFixed(1)}% — tradable range` });
  }

  // ── Breakout Agent: price vs Bollinger upper + recent high ──
  const bb = last(calcBollinger(closes, 20, 2));
  const recentHigh = Math.max(...activeBars.slice(-20).map(b => b.high));
  const nearBreakout = !!(bb?.upper && price >= bb.upper) || price >= recentHigh * 0.998;
  snapshot.nearBreakout = nearBreakout;
  if (nearBreakout) signals.push({ agent: 'Breakout', score: 12, detail: 'Breaking recent high / upper band' });

  // ── Volume Agent: current bar volume vs 20-bar average ──
  const vols = activeBars.map(b => b.volume ?? 0);
  const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(20, vols.length - 1));
  const curVol = last(vols) ?? 0;
  const volSurge = avgVol > 0 ? curVol / avgVol : null;
  snapshot.volSurge = volSurge;
  if (volSurge != null && volSurge > 1.5) signals.push({ agent: 'Volume', score: 12, detail: `Volume ${volSurge.toFixed(1)}× average` });
  else if (volSurge != null && volSurge < 0.6) signals.push({ agent: 'Volume', score: -6, detail: 'Volume below average' });

  // ── VWAP Agent: trading above/below VWAP ──
  const vwap = last(calcVWAP(activeBars)) ?? null;
  snapshot.vwap = vwap;
  if (vwap != null) {
    if (price > vwap) signals.push({ agent: 'VWAP', score: 8, detail: 'Price above VWAP' });
    else signals.push({ agent: 'VWAP', score: -8, detail: 'Price below VWAP' });
  }

  // ── Day-trend nudge: avoid chasing sharp gaps, reward steady gainers ──
  if (changePct > 5) signals.push({ agent: 'Trend', score: -6, detail: `Already +${changePct.toFixed(1)}% — extended` });
  else if (changePct > 0.3) signals.push({ agent: 'Trend', score: 5, detail: `Up +${changePct.toFixed(1)}% on the day` });

  // ── Fold into composite confidence ──
  const raw = signals.reduce((s, x) => s + x.score, 0);
  // Map raw (~ -90..+110) into 0-100 around a neutral baseline of 50.
  const confidence = Math.max(0, Math.min(100, Math.round(50 + raw * 0.55)));
  const bias: SignalResult['bias'] = raw > 12 ? 'bullish' : raw < -12 ? 'bearish' : 'neutral';

  const reasons = signals
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => s.detail);

  // Entry requires a genuine bullish posture; the engine still gates on the
  // user's min-confidence threshold before acting.
  const action: 'enter' | 'skip' =
    bias === 'bullish' && stDir !== -1 && (rsi == null || rsi < 78) ? 'enter' : 'skip';

  return { symbol, confidence, action, bias, reasons, signals, snapshot };
}
