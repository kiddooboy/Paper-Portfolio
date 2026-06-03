// USD/INR foreign-exchange rate, cached.
//
// One small lookup that touches everything in the US-trading flow:
//   - Order placement locks the rate so the rupee debit is deterministic.
//   - Portfolio P&L uses the *current* rate for unrealized value.
//   - UI shows "₹X / $" as a tiny footer hint.
//
// Free source: yahoo-finance2 quote() on `USDINR=X`. One symbol per refresh,
// trivial against our existing batched polls.

import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();
try { (yf as any).suppressNotices?.(['yahooSurvey']); } catch {}

const FX_SYMBOL = 'USDINR=X';
const TTL_MS = 60_000;             // refresh at most once a minute
const STALE_GRACE_MS = 6 * 3600_000; // serve stale up to 6h before giving up

interface FxCache { rate: number; at: number; }
let cache: FxCache | null = null;
let inflight: Promise<number | null> | null = null;

const FALLBACK_RATE = 83.20; // sane default if Yahoo can't be reached at all

async function fetchFromYahoo(): Promise<number | null> {
  try {
    const q = (await yf.quote(FX_SYMBOL)) as any;
    const rate = Number(q?.regularMarketPrice);
    if (Number.isFinite(rate) && rate > 50 && rate < 200) return rate;
    return null;
  } catch (e: any) {
    console.warn('[fx] yahoo fetch failed:', e?.message || e);
    return null;
  }
}

/**
 * Current USD/INR rate. Returns from cache when fresh; refreshes lazily;
 * falls back to last-known-good while still in the stale grace window;
 * returns FALLBACK_RATE as the ultimate floor.
 */
export async function getUsdInrRate(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rate;

  // Single-flight refresh
  if (!inflight) {
    inflight = fetchFromYahoo().finally(() => { inflight = null; });
  }
  const fresh = await inflight;
  if (fresh != null) {
    cache = { rate: fresh, at: now };
    return fresh;
  }

  // Yahoo failed — serve stale if we have anything
  if (cache && now - cache.at < STALE_GRACE_MS) return cache.rate;

  // No cache, no live — use a sane floor so order math never NaN's
  return FALLBACK_RATE;
}

/** Synchronous cache read. `null` until the first successful fetch. */
export function getCachedUsdInrRate(): { rate: number; at: number } | null {
  return cache ? { rate: cache.rate, at: cache.at } : null;
}

/** Boot-time priming. Server calls this once during startup. */
export async function primeFxRate(): Promise<void> {
  try {
    const r = await getUsdInrRate();
    console.log(`[fx] USD/INR primed at ₹${r.toFixed(2)}`);
  } catch (e: any) {
    console.warn('[fx] prime failed:', e?.message || e);
  }
}
