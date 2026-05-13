// ── Standard normal CDF via Hart approximation ──────────────────────────────
function normalCDF(x: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const d = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2) * poly;
  return x >= 0 ? d : 1 - d;
}

function normalPDF(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

export interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;   // per day
  vega: number;    // per 1% change in IV
  iv: number;      // as decimal e.g. 0.25
}

export function blackScholes(
  S: number,         // underlying spot price
  K: number,         // strike price
  T: number,         // time to expiry in years
  r: number,         // risk-free rate (decimal, e.g. 0.065)
  sigma: number,     // implied volatility (decimal, e.g. 0.25)
  type: 'CE' | 'PE'
): BSResult {
  if (T <= 0) {
    const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, iv: sigma };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let price: number;
  let delta: number;

  if (type === 'CE') {
    price = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    delta = normalCDF(d1);
  } else {
    price = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    delta = normalCDF(d1) - 1;
  }

  const npd1 = normalPDF(d1);
  const gamma = npd1 / (S * sigma * sqrtT);

  const thetaBase = -(S * npd1 * sigma) / (2 * sqrtT) / 365;
  const theta = type === 'CE'
    ? thetaBase - r * K * Math.exp(-r * T) * normalCDF(d2) / 365
    : thetaBase + r * K * Math.exp(-r * T) * normalCDF(-d2) / 365;

  const vega = S * sqrtT * npd1 / 100;

  return { price: Math.max(0, price), delta, gamma, theta, vega, iv: sigma };
}

// ── IV skew: OTM options command a premium (volatility smile) ───────────────
// moneyness < 1 = put side skew, > 1 = call side skew
export function adjustedIV(baseIV: number, S: number, K: number): number {
  const moneyness = Math.log(S / K);
  // Simple parabolic skew: IV increases by ~2–5% per 5% OTM
  const skew = 0.15 * moneyness * moneyness + 0.02 * Math.abs(moneyness);
  return Math.max(0.05, baseIV + skew);
}

// ── Deterministic pseudo-random for realistic OI/Volume ─────────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export interface OptionStrike {
  strike: number;
  CE: BSResult & { oi: number; volume: number; bidPrice: number; askPrice: number };
  PE: BSResult & { oi: number; volume: number; bidPrice: number; askPrice: number };
}

export function generateOptionChain(
  S: number,
  baseIV: number,
  T: number,
  r: number,
  strikeInterval: number,
  numStrikes: number,   // each side of ATM
  seed: number          // use (expiryTimestamp + symbolHash) for consistency
): OptionStrike[] {
  const atm = Math.round(S / strikeInterval) * strikeInterval;
  const strikes: OptionStrike[] = [];

  for (let i = -numStrikes; i <= numStrikes; i++) {
    const K = atm + i * strikeInterval;
    if (K <= 0) continue;

    const iv = adjustedIV(baseIV, S, K);
    const ce = blackScholes(S, K, T, r, iv, 'CE');
    const pe = blackScholes(S, K, T, r, iv, 'PE');

    // Simulate OI: peaks near ATM, declines exponentially further out
    // OI is higher on the OTM side (people buy insurance)
    const distFromAtm = Math.abs(i) / numStrikes;
    const baseOI = Math.round(seededRandom(seed + K) * 80000 + 20000);
    const oiDecay = Math.exp(-2.5 * distFromAtm);
    const ceOI = Math.round(baseOI * oiDecay * (i <= 0 ? 1.2 : 0.8)); // calls higher above ATM
    const peOI = Math.round(baseOI * oiDecay * (i >= 0 ? 1.2 : 0.8)); // puts higher below ATM
    const ceVol = Math.round(ceOI * (0.05 + seededRandom(seed + K + 1) * 0.15));
    const peVol = Math.round(peOI * (0.05 + seededRandom(seed + K + 2) * 0.15));

    // Bid/ask spread = ~0.5–2% of price
    const ceSpread = Math.max(0.05, ce.price * 0.015);
    const peSpread = Math.max(0.05, pe.price * 0.015);

    strikes.push({
      strike: K,
      CE: { ...ce, oi: ceOI, volume: ceVol, bidPrice: Math.max(0.05, ce.price - ceSpread / 2), askPrice: ce.price + ceSpread / 2 },
      PE: { ...pe, oi: peOI, volume: peVol, bidPrice: Math.max(0.05, pe.price - peSpread / 2), askPrice: pe.price + peSpread / 2 },
    });
  }

  return strikes;
}
