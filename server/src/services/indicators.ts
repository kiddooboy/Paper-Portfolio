/**
 * Technical indicators — server-side copy of the math in
 * client/src/components/StockChart.tsx, so alert evaluation can run on
 * fetched OHLC bars without involving the browser.
 *
 * All functions return arrays aligned with the input length; entries
 * before the indicator can be computed are `null`.
 */

export interface Bar { date?: string; open?: number; high: number; low: number; close: number; volume?: number }

export function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
  });
}

export function calcEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) {
      prev = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
      out.push(prev); continue;
    }
    prev = closes[i] * k + (prev as number) * (1 - k);
    out.push(prev);
  }
  return out;
}

export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d / period;
    else        avgLoss += (-d) / period;
  }
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ?  d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  }
  return out;
}

export function calcMACD(closes: number[]) {
  const e12 = calcEMA(closes, 12);
  const e26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    e12[i] !== null && e26[i] !== null ? (e12[i] as number) - (e26[i] as number) : null
  );
  const validIdxs = macdLine.map((v, i) => v !== null ? i : -1).filter(i => i >= 0);
  const signalRaw = calcEMA(validIdxs.map(i => macdLine[i] as number), 9);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  validIdxs.forEach((orig, j) => { signal[orig] = signalRaw[j]; });
  return closes.map((_, i) => ({
    macd:      macdLine[i],
    signal:    signal[i],
    histogram: macdLine[i] !== null && signal[i] !== null
      ? (macdLine[i] as number) - (signal[i] as number) : null,
  }));
}

export function calcVWAP(bars: Bar[]): (number | null)[] {
  let cumTP = 0, cumVol = 0;
  return bars.map((b) => {
    const v = b.volume ?? 0;
    cumTP  += ((b.high + b.low + b.close) / 3) * v;
    cumVol += v;
    return cumVol > 0 ? cumTP / cumVol : null;
  });
}

// ─── Alert condition evaluation ───────────────────────────────────────────
// condition_spec JSON shapes:
//   { type: 'price',     op: 'above'|'below',         level: number }            ← existing
//   { type: 'pct_move',  direction: 'up'|'down'|'any', threshold: number }       (vs previous_close)
//   { type: 'indicator', indicator: 'RSI'|'EMA'|'SMA', period: number,
//                        op: 'above'|'below'|'cross_up'|'cross_down',
//                        value?: number }

export type IndicatorSpec =
  | { type: 'price'; op: 'above' | 'below'; level: number }
  | { type: 'pct_move'; direction: 'up' | 'down' | 'any'; threshold: number }
  | { type: 'indicator'; indicator: 'RSI' | 'EMA' | 'SMA'; period: number;
      op: 'above' | 'below' | 'cross_up' | 'cross_down'; value?: number };

export interface AlertEvalInput {
  bars: number[];      // historical closes (oldest → newest)
  currentPrice: number;
  previousClose?: number;
  spec: IndicatorSpec;
}

export function evaluateAlert(input: AlertEvalInput): boolean {
  const { bars, currentPrice, previousClose, spec } = input;

  if (spec.type === 'price') {
    return spec.op === 'above' ? currentPrice >= spec.level : currentPrice <= spec.level;
  }

  if (spec.type === 'pct_move') {
    if (!previousClose || previousClose <= 0) return false;
    const pct = (currentPrice - previousClose) / previousClose * 100;
    if (spec.direction === 'up')   return  pct >=  spec.threshold;
    if (spec.direction === 'down') return -pct >=  spec.threshold;
    return Math.abs(pct) >= spec.threshold;
  }

  // indicator
  if (!bars.length) return false;
  const closes = [...bars, currentPrice];  // include the live value as the last bar
  const period = Math.max(2, Math.floor(spec.period));

  let series: (number | null)[] = [];
  switch (spec.indicator) {
    case 'RSI': series = calcRSI(closes, period); break;
    case 'EMA': series = calcEMA(closes, period); break;
    case 'SMA': series = calcSMA(closes, period); break;
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (last == null) return false;

  if (spec.indicator === 'RSI') {
    // RSI compares against a level (default 70/30 if user omits)
    const level = spec.value ?? (spec.op === 'above' || spec.op === 'cross_up' ? 70 : 30);
    if (spec.op === 'above') return last >= level;
    if (spec.op === 'below') return last <= level;
    if (spec.op === 'cross_up')   return prev != null && prev < level && last >= level;
    if (spec.op === 'cross_down') return prev != null && prev > level && last <= level;
  } else {
    // EMA/SMA: compare price to the indicator level
    const prevPrice = closes[closes.length - 2];
    if (spec.op === 'above') return currentPrice >= last;
    if (spec.op === 'below') return currentPrice <= last;
    if (spec.op === 'cross_up')   return prev != null && prevPrice < prev && currentPrice >= last;
    if (spec.op === 'cross_down') return prev != null && prevPrice > prev && currentPrice <= last;
  }
  return false;
}

// ─── Extra indicators for the AI Trade engine ─────────────────────────────
// All take OHLC bars (oldest → newest) and return arrays aligned with input.

/** Average True Range — volatility, used for SL/target context. */
export function calcATR(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr: number[] = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  let atr = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  out[period] = atr;
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

/** Bollinger Bands (SMA ± k·σ). */
export function calcBollinger(closes: number[], period = 20, k = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return { mid: null, upper: null, lower: null };
    const window = closes.slice(i - period + 1, i + 1);
    const mid = window.reduce((s, v) => s + v, 0) / period;
    const variance = window.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { mid, upper: mid + k * sd, lower: mid - k * sd };
  });
}

/** Supertrend — ATR-based trend direction. Returns value + dir (1 up, -1 down). */
export function calcSupertrend(bars: Bar[], period = 10, mult = 3) {
  const atr = calcATR(bars, period);
  const out: { value: number | null; dir: 1 | -1 | null }[] = bars.map(() => ({ value: null, dir: null }));
  let prevUpper = Infinity, prevLower = -Infinity;
  let prevDir: 1 | -1 = 1;
  for (let i = 0; i < bars.length; i++) {
    const a = atr[i];
    if (a == null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    let upper = mid + mult * a;
    let lower = mid - mult * a;
    const prevClose = i > 0 ? bars[i - 1].close : bars[i].close;
    upper = upper < prevUpper || prevClose > prevUpper ? upper : prevUpper;
    lower = lower > prevLower || prevClose < prevLower ? lower : prevLower;
    let dir: 1 | -1 = prevDir;
    if (prevDir === 1 && bars[i].close < lower) dir = -1;
    else if (prevDir === -1 && bars[i].close > upper) dir = 1;
    out[i] = { value: dir === 1 ? lower : upper, dir };
    prevUpper = upper; prevLower = lower; prevDir = dir;
  }
  return out;
}
