import YahooFinance from 'yahoo-finance2';
import { isHolidayToday, holidayDescription } from './nseHolidays.js';
import { regionFor, isRegionOpen, regionStatusLabel, REGIONS, type Region } from './regions.js';

const yahooFinance = new YahooFinance();

// Silence the noisy survey/notice banner (best-effort, API varies by version)
try { (yahooFinance as any).suppressNotices?.(['yahooSurvey']); } catch {}

/** All trading-venue codes the engine understands. */
export type ExchangeCode = 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';

export interface Quote {
  symbol: string;          // raw symbol e.g. "RELIANCE" or "AAPL"
  exchange: ExchangeCode;  // which venue + region we used
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
  day_high: number;
  day_low: number;
  volume: number;
  currency: string;
  market_cap?: number;
  pe_ratio?: number;
  high_52w?: number;
  low_52w?: number;
  eps?: number;
  name?: string;
  exchange_long?: string;
}

// ── Market hours detection (IST: UTC+5:30) ──
const MARKET_OPEN_H = 9, MARKET_OPEN_M = 15;   // 9:15 AM IST
const MARKET_CLOSE_H = 15, MARKET_CLOSE_M = 30; // 3:30 PM IST

export function getISTDate(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

export function isMarketOpen(exchange?: ExchangeCode): boolean {
  // Opt-in bypass for the AI-Trade sandbox / UAT only. Production (flag unset)
  // enforces real NSE hours so out-of-hours orders queue for the next open.
  if (process.env.BYPASS_MARKET_HOURS === 'true') return true;
  // Delegate to region calendar when caller specifies a non-IN venue.
  if (exchange === 'NASDAQ' || exchange === 'NYSE') {
    return isRegionOpen(REGIONS.US);
  }
  const ist = getISTDate();
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  if (isHolidayToday()) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const openMin = MARKET_OPEN_H * 60 + MARKET_OPEN_M;
  const closeMin = MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;
  return minutes >= openMin && minutes <= closeMin;
}

/** Status for the US region — for the new Global Markets page. */
export function getUsMarketStatus() {
  const region = REGIONS.US;
  const now = new Date();
  return {
    isOpen: isRegionOpen(region, now),
    label: regionStatusLabel(region, now),
    pollIntervalMs: isRegionOpen(region, now) ? 4_000 : 300_000,
  };
}

export function getMarketStatus() {
  const ist = getISTDate();
  const open = isMarketOpen();
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const openMin = MARKET_OPEN_H * 60 + MARKET_OPEN_M;
  const closeMin = MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;

  // Detect holiday so the UI can show a richer "Closed — Holiday" label.
  let holiday: { date: string; description: string } | null = null;
  if (isHolidayToday()) {
    const isoDate = ist.toISOString().slice(0, 10);
    holiday = { date: isoDate, description: holidayDescription(isoDate) || 'NSE Trading Holiday' };
  }

  let label = 'Closed';
  if (open) label = 'Open';
  else if (holiday) label = 'Holiday';
  else if (day >= 1 && day <= 5 && minutes < openMin) label = 'Pre-market';
  else if (day >= 1 && day <= 5 && minutes > closeMin) label = 'After hours';

  return {
    isOpen: open,
    label,
    ist: ist.toISOString(),
    holiday,
    nextOpen: open ? null : getNextOpenIST(ist),
    // Suggest a poll cadence to the client; tighter to match server tier1 (4s).
    pollIntervalMs: open ? 4_000 : 300_000,
    // Poller health so the UI can show a "stale / reconnecting" badge when
    // Yahoo is failing and we're serving cached prices.
    poller: getPollerHealth(),
  };
}

function getNextOpenIST(ist: Date): string {
  // ist is a fake-UTC date whose numeric value represents IST wall time.
  // We work in that fake space, then convert back to real UTC before returning.
  const IST_OFFSET_MS = 5.5 * 3600000;
  const d = new Date(ist);
  const isHoliday = (x: Date) => holidayDescription(x.toISOString().slice(0, 10)) != null;
  // If today is pre-market on a normal trading day, use today's open.
  if (d.getHours() * 60 + d.getMinutes() < MARKET_OPEN_H * 60 + MARKET_OPEN_M
      && d.getDay() >= 1 && d.getDay() <= 5 && !isHoliday(d)) {
    d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
    return new Date(d.getTime() - IST_OFFSET_MS).toISOString();
  }
  // Otherwise advance day by day, skipping weekends AND NSE holidays.
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() + 1);
    d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(d)) break;
  }
  return new Date(d.getTime() - IST_OFFSET_MS).toISOString();
}

// ── Adaptive TTL ──
const TTL_LIVE_MS   = 4_000;   // 4 seconds — matches server poll interval
const TTL_CLOSED_MS = 300_000; // 5 minutes outside market hours

// ── Poller health (consumed by /api/stocks/market-status so the UI can
//     surface "stale / reconnecting" badges when Yahoo is misbehaving) ──
let lastPollOkAt = 0;
let lastPollErrorAt = 0;
let lastPollErrorMessage: string | null = null;
let consecutiveFailures = 0;
const CIRCUIT_FAIL_THRESHOLD = 5;

export function markPollSuccess(): void {
  lastPollOkAt = Date.now();
  consecutiveFailures = 0;
  lastPollErrorMessage = null;
}
export function markPollFailure(message?: string): void {
  lastPollErrorAt = Date.now();
  consecutiveFailures++;
  if (message) lastPollErrorMessage = message.slice(0, 200);
}
export function isCircuitOpen(): boolean {
  return consecutiveFailures >= CIRCUIT_FAIL_THRESHOLD;
}
export function getPollerHealth() {
  const now = Date.now();
  return {
    lastPollOkAt: lastPollOkAt || null,
    lastPollErrorAt: lastPollErrorAt || null,
    secondsSinceOk: lastPollOkAt ? Math.round((now - lastPollOkAt) / 1000) : null,
    consecutiveFailures,
    circuitOpen: isCircuitOpen(),
    lastError: lastPollErrorMessage,
  };
}
// Stale-while-revalidate: serve stale data up to this age before refusing
const STALE_GRACE_MS = 3_600_000; // 1 hour — always serve *something*

function getTTL(): number {
  return isMarketOpen() ? TTL_LIVE_MS : TTL_CLOSED_MS;
}

// ── Cache — stores BOTH live and last-known-good data ──
// { data: Quote, at: number (last successful fetch), stale: boolean }
interface CacheEntry { data: Quote; at: number; }
const cache = new Map<string, CacheEntry>();

// ── Tradeable market indices ──
// App symbol → Yahoo Finance index ticker. Lets users trade index levels
// (NIFTY, SENSEX, …) the same way they trade a stock in this simulator.
export const INDEX_TICKERS: Record<string, string> = {
  NIFTY:       '^NSEI',
  NIFTY50:     '^NSEI',
  SENSEX:      '^BSESN',
  BANKNIFTY:   '^NSEBANK',
  NIFTYBANK:   '^NSEBANK',
  NIFTYIT:     '^CNXIT',
  NIFTY100:    '^CNX100',
  NIFTYMIDCAP: '^CNXMIDCAP',
};

export const TRADEABLE_INDICES = [
  { symbol: 'NIFTY',       name: 'NIFTY 50 Index' },
  { symbol: 'SENSEX',      name: 'BSE SENSEX Index' },
  { symbol: 'BANKNIFTY',   name: 'NIFTY Bank Index' },
  { symbol: 'NIFTYIT',     name: 'NIFTY IT Index' },
  { symbol: 'NIFTY100',    name: 'NIFTY 100 Index' },
  { symbol: 'NIFTYMIDCAP', name: 'NIFTY Midcap Index' },
];

function yahooTicker(symbol: string, exchange: ExchangeCode) {
  const up = symbol.toUpperCase();
  if (up.startsWith('^')) return up;          // raw Yahoo index ticker
  const idx = INDEX_TICKERS[up];
  if (idx) return idx;                        // tradeable index alias
  if (exchange === 'NASDAQ' || exchange === 'NYSE') return up; // US tickers are bare
  return `${symbol}.${exchange === 'NSE' ? 'NS' : 'BO'}`;
}

function mapYahooQuote(q: any, symbol: string, exchange: ExchangeCode): Quote | null {
  if (!q || typeof q.regularMarketPrice !== 'number') return null;
  const defaultCcy = (exchange === 'NASDAQ' || exchange === 'NYSE') ? 'USD' : 'INR';
  return {
    symbol,
    exchange,
    price: q.regularMarketPrice,
    change: q.regularMarketChange ?? 0,
    change_percent: q.regularMarketChangePercent ?? 0,
    previous_close: q.regularMarketPreviousClose ?? q.regularMarketPrice,
    day_high: q.regularMarketDayHigh ?? q.regularMarketPrice,
    day_low: q.regularMarketDayLow ?? q.regularMarketPrice,
    volume: q.regularMarketVolume ?? 0,
    currency: q.currency ?? defaultCcy,
    market_cap: q.marketCap,
    pe_ratio: q.trailingPE,
    high_52w: q.fiftyTwoWeekHigh,
    low_52w: q.fiftyTwoWeekLow,
    eps: q.epsTrailingTwelveMonths,
    name: q.longName || q.shortName,
    exchange_long: q.fullExchangeName,
  };
}

/** Sleep helper for rate-limit back-off between Yahoo chunks */
function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Fallback: fetch latest price via Yahoo's chart endpoint.
 * The chart endpoint does NOT require the auth crumb cookie, so it works
 * even when /v7/quote returns 429 "Failed to get crumb" (common on shared
 * cloud IPs). Slower than batched quote() but reliable.
 */
async function fetchQuoteViaChart(symbol: string, exchange: ExchangeCode): Promise<Quote | null> {
  try {
    const ticker = yahooTicker(symbol, exchange);
    const res = (await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - 7 * 24 * 3600 * 1000),
      interval: '1d',
    })) as any;
    const meta = res?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null;
    const price: number = meta.regularMarketPrice;
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const defaultCcy = (exchange === 'NASDAQ' || exchange === 'NYSE') ? 'USD' : 'INR';
    return {
      symbol,
      exchange,
      price,
      change,
      change_percent: changePct,
      previous_close: prevClose,
      day_high: meta.regularMarketDayHigh ?? price,
      day_low: meta.regularMarketDayLow ?? price,
      volume: meta.regularMarketVolume ?? 0,
      currency: meta.currency ?? defaultCcy,
      name: meta.longName || meta.shortName || meta.symbol,
      exchange_long: meta.fullExchangeName,
    };
  } catch {
    return null;
  }
}

/**
 * Cache-only read. Does NOT call Yahoo — guarantees a user request never
 * triggers an upstream fetch. Returns the last-known-good quote (any age),
 * or a zero-priced dummy if we have nothing yet. The background poller is
 * the sole source of truth for cache freshness.
 */
export function getCachedQuote(symbol: string, exchange: ExchangeCode = 'NSE'): Quote {
  const hit = cache.get(`${symbol}:${exchange}`);
  if (hit) return hit.data;

  // Smart fallback: check if this symbol exists in the cache under another exchange with a valid price
  const exchanges: ExchangeCode[] = ['NSE', 'NASDAQ', 'NYSE', 'BSE'];
  for (const ex of exchanges) {
    if (ex === exchange) continue;
    const fallbackHit = cache.get(`${symbol}:${ex}`);
    if (fallbackHit && fallbackHit.data && fallbackHit.data.price > 0) {
      return fallbackHit.data;
    }
  }

  const ccy = (exchange === 'NASDAQ' || exchange === 'NYSE') ? 'USD' : 'INR';
  return { symbol, exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: ccy };
}

export function getCachedQuotes(items: { symbol: string; exchange?: ExchangeCode }[]): Quote[] {
  return items.map((it) => getCachedQuote(it.symbol, it.exchange ?? 'NSE'));
}

export function getAllCachedQuotes(): Map<string, Quote> {
  const out = new Map<string, Quote>();
  for (const [key, entry] of cache.entries()) {
    out.set(key, entry.data);
  }
  return out;
}

export function getCachedIndices(): IndexQuote[] {
  const out: IndexQuote[] = [];
  for (const idx of INDICES) {
    const hit = indexCache.get(idx.symbol);
    if (hit) out.push(hit.data);
  }
  return out;
}

export async function getQuote(symbol: string, exchange: ExchangeCode = 'NSE', forceRefresh = false): Promise<Quote | null> {
  const key = `${symbol}:${exchange}`;
  const hit = cache.get(key);
  const now = Date.now();

  // If not forcing a refresh, return any cached data within the stale grace period (1 hr).
  // If forcing refresh (e.g., background poller), only return cache if it's within strict TTL.
  if (!forceRefresh && hit && now - hit.at < STALE_GRACE_MS) return hit.data;
  if (forceRefresh && hit && now - hit.at < getTTL()) return hit.data;

  try {
    const q = (await yahooFinance.quote(yahooTicker(symbol, exchange))) as any;
    const data = mapYahooQuote(q, symbol, exchange);
    if (data) {
      cache.set(key, { data, at: now });
      return data;
    }
  } catch (err: any) {
    console.warn(`[market] getQuote(${symbol}) failed: ${err?.message ?? err}`);
    // Crumb / 429 — try chart() endpoint (no crumb required)
    const fallback = await fetchQuoteViaChart(symbol, exchange);
    if (fallback) {
      cache.set(key, { data: fallback, at: Date.now() });
      return fallback;
    }
  }

  // If we reach here, Yahoo didn't return data or threw an error
  // If we have stale cache, serve it
  if (hit && now - hit.at < STALE_GRACE_MS) return hit.data;

  // Otherwise, cache a dummy to prevent immediate retry spam
  const dummyCcy = (exchange === 'NASDAQ' || exchange === 'NYSE') ? 'USD' : 'INR';
  const dummy: Quote = { symbol, exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: dummyCcy };
  cache.set(key, { data: dummy, at: now });
  return dummy;
}

export async function getQuotes(
  items: { symbol: string; exchange?: ExchangeCode }[],
  forceRefresh = false
): Promise<Quote[]> {
  const now = Date.now();
  const ttl = getTTL();
  const tickers: string[] = [];
  const missKey: Record<string, { symbol: string; exchange: ExchangeCode }> = {};
  const out: Quote[] = [];

  for (const it of items) {
    const exchange: ExchangeCode = it.exchange ?? 'NSE';
    const key = `${it.symbol}:${exchange}`;
    const hit = cache.get(key);

    const isFreshEnough = forceRefresh ? (hit && now - hit.at < ttl) : (hit && now - hit.at < STALE_GRACE_MS);

    if (isFreshEnough && hit) {
      out.push(hit.data);
    } else {
      const t = yahooTicker(it.symbol, exchange);
      tickers.push(t);
      missKey[t] = { symbol: it.symbol, exchange };
    }
  }

  // Fetch missing in chunks — with a small delay between each chunk
  // to stay well under Yahoo's rate limit (~5 req/s)
  const CHUNK = 25; // smaller chunks → more reliable
  const CHUNK_DELAY_MS = 500; // 500ms between chunks = 2 chunks/sec

  for (let i = 0; i < tickers.length; i += CHUNK) {
    if (i > 0) await sleep(CHUNK_DELAY_MS);
    const slice = tickers.slice(i, i + CHUNK);
    try {
      const results = (await yahooFinance.quote(slice)) as any;
      const arr = Array.isArray(results) ? results : [results];
      const foundTickers = new Set<string>();

      for (const q of arr) {
        if (q?.symbol) foundTickers.add(q.symbol);
        const src = missKey[q?.symbol];
        if (!src) continue;
        const data = mapYahooQuote(q, src.symbol, src.exchange);
        if (data) {
          cache.set(`${src.symbol}:${src.exchange}`, { data, at: now });
          out.push(data);
        }
      }

      // Cache dummies for anything Yahoo didn't return to prevent infinite retry spam
      for (const ticker of slice) {
        if (!foundTickers.has(ticker)) {
          const src = missKey[ticker];
          if (src) {
            const ccy = (src.exchange === 'NASDAQ' || src.exchange === 'NYSE') ? 'USD' : 'INR';
            const dummy: Quote = { symbol: src.symbol, exchange: src.exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: ccy };
            cache.set(`${src.symbol}:${src.exchange}`, { data: dummy, at: now });
            out.push(dummy);
          }
        }
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      console.warn(`[market] getQuotes chunk ${i}–${i+CHUNK} failed: ${msg}`);

      // Crumb / rate-limit failures: fall back to chart() endpoint per symbol.
      // chart() does NOT require the auth crumb cookie, so it works even when
      // /v7/quote returns 429 from Yahoo. Slower (one HTTP per symbol) but
      // populates the central cache so all users see live data.
      const isCrumbErr = /crumb/i.test(msg) || /429/.test(msg) || /Too Many Requests/i.test(msg);
      if (isCrumbErr) {
        for (const ticker of slice) {
          const src = missKey[ticker];
          if (!src) continue;
          const fallback = await fetchQuoteViaChart(src.symbol, src.exchange);
          if (fallback) {
            cache.set(`${src.symbol}:${src.exchange}`, { data: fallback, at: Date.now() });
            if (!out.find(o => o.symbol === src.symbol && o.exchange === src.exchange)) {
              out.push(fallback);
            }
          } else {
            const stale = cache.get(`${src.symbol}:${src.exchange}`);
            if (stale && now - stale.at < STALE_GRACE_MS && !out.find(o => o.symbol === src.symbol && o.exchange === src.exchange)) {
              out.push(stale.data);
            }
          }
          // small throttle so we don't slam chart() either
          await sleep(120);
        }
      } else {
        // On any other failure: serve stale cache for symbols in this chunk
        for (const ticker of slice) {
          const src = missKey[ticker];
          if (!src) continue;
          const stale = cache.get(`${src.symbol}:${src.exchange}`);
          if (stale && now - stale.at < STALE_GRACE_MS && !out.find(o => o.symbol === src.symbol && o.exchange === src.exchange)) {
            out.push(stale.data);
          }
        }
      }
    }
  }

  return out;
}

export async function getHistory(
  symbol: string,
  exchange: ExchangeCode = 'NSE',
  period1: Date = new Date(Date.now() - 90 * 24 * 3600 * 1000),
  interval: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo' = '1d'
) {
  try {
    const res = (await yahooFinance.chart(yahooTicker(symbol, exchange), {
      period1,
      interval,
    })) as any;
    return (res?.quotes || []).map((q: any) => ({
      date: q.date,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    }));
  } catch {
    return [];
  }
}

/**
 * Free-text symbol/name search via Yahoo Finance. Includes NSE, BSE, NASDAQ
 * and NYSE results. Pass `region` to scope the search.
 */
export async function searchSymbols(query: string, limit = 15, region?: 'IN' | 'US' | 'all') {
  if (!query) return [];
  try {
    const res = (await yahooFinance.search(query, { quotesCount: limit * 2, newsCount: 0 })) as any;
    const quotes = res?.quotes || [];
    const filtered = quotes.filter((q: any) => {
      if (!q?.symbol) return false;
      const inIN = q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO');
      const inUS = (q.exchange === 'NMS' || q.exchange === 'NYQ' || q.exchange === 'NGM' || q.exchange === 'NCM')
        && !q.symbol.includes('.') && !q.symbol.startsWith('^');
      if (region === 'IN') return inIN;
      if (region === 'US') return inUS;
      return inIN || inUS;
    });
    return filtered.slice(0, limit).map((q: any) => {
      let ex: ExchangeCode = 'NSE';
      let bareSymbol = q.symbol as string;
      if (q.symbol.endsWith('.NS')) { ex = 'NSE'; bareSymbol = q.symbol.replace(/\.NS$/, ''); }
      else if (q.symbol.endsWith('.BO')) { ex = 'BSE'; bareSymbol = q.symbol.replace(/\.BO$/, ''); }
      else if (q.exchange === 'NYQ') { ex = 'NYSE'; }
      else { ex = 'NASDAQ'; }
      return {
        symbol: bareSymbol,
        name: q.longname || q.shortname || bareSymbol,
        exchange: ex,
        type: q.quoteType,
      };
    });
  } catch {
    return [];
  }
}

// ── Indian market indices (public, no auth required) ──
export const INDICES = [
  { symbol: '^NSEI',       name: 'NIFTY 50' },
  { symbol: '^BSESN',      name: 'SENSEX' },
  { symbol: '^NSEBANK',    name: 'BANK NIFTY' },
  { symbol: '^CNX100',     name: 'NIFTY 100' },
  { symbol: '^CNXIT',      name: 'NIFTY IT' },
  { symbol: '^NSEMDCP50',  name: 'MIDCAP 50' },
];

// ── US/global market indices ──
export const US_INDICES = [
  { symbol: '^GSPC',  name: 'S&P 500' },
  { symbol: '^IXIC',  name: 'NASDAQ Composite' },
  { symbol: '^DJI',   name: 'Dow Jones' },
  { symbol: '^VIX',   name: 'VIX' },
  { symbol: '^RUT',   name: 'Russell 2000' },
  { symbol: '^FTSE',  name: 'FTSE 100' },
];

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
}

const indexCache = new Map<string, { at: number; data: IndexQuote }>();

export async function getIndices(forceRefresh = false): Promise<IndexQuote[]> {
  const ttl = getTTL();
  const now = Date.now();
  const fresh: IndexQuote[] = [];
  const missing: typeof INDICES = [];

  for (const idx of INDICES) {
    const hit = indexCache.get(idx.symbol);
    const isFreshEnough = forceRefresh ? (hit && now - hit.at < ttl) : (hit && now - hit.at < STALE_GRACE_MS);
    
    if (isFreshEnough && hit) fresh.push(hit.data);
    else missing.push(idx);
  }

  if (missing.length) {
    try {
      const results = (await yahooFinance.quote(missing.map((i) => i.symbol))) as any;
      const arr = Array.isArray(results) ? results : [results];
      for (const q of arr) {
        if (!q || typeof q.regularMarketPrice !== 'number') continue;
        const meta = missing.find((m) => m.symbol === q.symbol);
        if (!meta) continue;
        const data: IndexQuote = {
          symbol: meta.symbol,
          name: meta.name,
          price: q.regularMarketPrice,
          change: q.regularMarketChange ?? 0,
          change_percent: q.regularMarketChangePercent ?? 0,
          previous_close: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        };
        indexCache.set(meta.symbol, { at: now, data });
        fresh.push(data);
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      console.warn(`[market] getIndices quote failed: ${msg}`);
      // Crumb / 429 — fall back to chart() per index (no crumb required)
      for (const idx of missing) {
        try {
          const res = (await yahooFinance.chart(idx.symbol, {
            period1: new Date(Date.now() - 7 * 24 * 3600 * 1000),
            interval: '1d',
          })) as any;
          const meta = res?.meta;
          if (!meta || typeof meta.regularMarketPrice !== 'number') {
            const stale = indexCache.get(idx.symbol);
            if (stale) fresh.push(stale.data);
            continue;
          }
          const price: number = meta.regularMarketPrice;
          const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
          const data: IndexQuote = {
            symbol: idx.symbol,
            name: idx.name,
            price,
            change: price - prevClose,
            change_percent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
            previous_close: prevClose,
          };
          indexCache.set(idx.symbol, { at: Date.now(), data });
          fresh.push(data);
          await sleep(120);
        } catch {
          const stale = indexCache.get(idx.symbol);
          if (stale) fresh.push(stale.data);
        }
      }
    }
  }
  return fresh;
}

// ── US indices: cache + fetch ──
const usIndexCache = new Map<string, { at: number; data: IndexQuote }>();

export function getCachedUsIndices(): IndexQuote[] {
  const out: IndexQuote[] = [];
  for (const idx of US_INDICES) {
    const hit = usIndexCache.get(idx.symbol);
    if (hit) out.push(hit.data);
  }
  return out;
}

export async function getUsIndices(forceRefresh = false): Promise<IndexQuote[]> {
  const ttl = getTTL();
  const now = Date.now();
  const fresh: IndexQuote[] = [];
  const missing: typeof US_INDICES = [];

  for (const idx of US_INDICES) {
    const hit = usIndexCache.get(idx.symbol);
    const isFreshEnough = forceRefresh ? (hit && now - hit.at < ttl) : (hit && now - hit.at < STALE_GRACE_MS);
    if (isFreshEnough && hit) fresh.push(hit.data);
    else missing.push(idx);
  }

  if (missing.length) {
    try {
      const results = (await yahooFinance.quote(missing.map((i) => i.symbol))) as any;
      const arr = Array.isArray(results) ? results : [results];
      for (const q of arr) {
        if (!q || typeof q.regularMarketPrice !== 'number') continue;
        const meta = missing.find((m) => m.symbol === q.symbol);
        if (!meta) continue;
        const data: IndexQuote = {
          symbol: meta.symbol,
          name: meta.name,
          price: q.regularMarketPrice,
          change: q.regularMarketChange ?? 0,
          change_percent: q.regularMarketChangePercent ?? 0,
          previous_close: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        };
        usIndexCache.set(meta.symbol, { at: now, data });
        fresh.push(data);
      }
    } catch (err: any) {
      console.warn('[market] getUsIndices failed:', err?.message || err);
      for (const idx of missing) {
        const stale = usIndexCache.get(idx.symbol);
        if (stale) fresh.push(stale.data);
      }
    }
  }
  return fresh;
}

// ── NSE Sector indices (20 total) ──
export const SECTOR_INDICES = [
  // Original 10
  { symbol: '^CNXIT',          name: 'IT',           key: 'IT' },
  { symbol: '^CNXFMCG',        name: 'FMCG',         key: 'FMCG' },
  { symbol: '^CNXPHARMA',      name: 'Pharma',       key: 'Pharma' },
  { symbol: '^CNXAUTO',        name: 'Auto',         key: 'Auto' },
  { symbol: '^CNXMETAL',       name: 'Metal',        key: 'Metal' },
  { symbol: '^CNXREALTY',      name: 'Realty',       key: 'Realty' },
  { symbol: '^CNXPSUBANK',     name: 'PSU Bank',     key: 'PSU Bank' },
  { symbol: '^CNXENERGY',      name: 'Energy',       key: 'Energy' },
  { symbol: '^CNXFINANCE',     name: 'Finance',      key: 'Finance' },
  { symbol: '^CNXINFRA',       name: 'Infra',        key: 'Infra' },
  // New 10
  { symbol: '^NSEBANK',        name: 'Banking',      key: 'Banking' },
  { symbol: '^CNXHEALTHCARE',  name: 'Healthcare',   key: 'Healthcare' },
  { symbol: '^CNXMEDIA',       name: 'Media',        key: 'Media' },
  { symbol: '^CNXMIDCAP',      name: 'Midcap',       key: 'Midcap' },
  { symbol: '^CNXMNC',         name: 'MNC',          key: 'MNC' },
  { symbol: '^CNXPSE',         name: 'PSE',          key: 'PSE' },
  { symbol: '^CNXSERVICE',     name: 'Services',     key: 'Services' },
  { symbol: '^CNXCONSUMPTION', name: 'Consumption',  key: 'Consumption' },
  { symbol: '^CNXCOMMODITY',   name: 'Commodities',  key: 'Commodities' },
  { symbol: '^CNXSMALLCAP',    name: 'Smallcap',     key: 'Smallcap' },
];

const sectorCache = new Map<string, { at: number; data: IndexQuote }>();

export async function getSectors(forceRefresh = false): Promise<IndexQuote[]> {
  const ttl = getTTL();
  const now = Date.now();
  const fresh: IndexQuote[] = [];
  const missing: typeof SECTOR_INDICES = [];

  for (const idx of SECTOR_INDICES) {
    const hit = sectorCache.get(idx.symbol);
    const isFreshEnough = forceRefresh ? (hit && now - hit.at < ttl) : (hit && now - hit.at < STALE_GRACE_MS);
    if (isFreshEnough && hit) fresh.push(hit.data);
    else missing.push(idx);
  }

  if (missing.length) {
    try {
      const results = (await yahooFinance.quote(missing.map((i) => i.symbol))) as any;
      const arr = Array.isArray(results) ? results : [results];
      for (const q of arr) {
        if (!q || typeof q.regularMarketPrice !== 'number') continue;
        const meta = missing.find((m) => m.symbol === q.symbol);
        if (!meta) continue;
        const data: IndexQuote = {
          symbol: meta.symbol,
          name: meta.name,
          price: q.regularMarketPrice,
          change: q.regularMarketChange ?? 0,
          change_percent: q.regularMarketChangePercent ?? 0,
          previous_close: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        };
        sectorCache.set(meta.symbol, { at: now, data });
        fresh.push(data);
      }
    } catch {
      // fall back to stale cache
      for (const idx of missing) {
        const stale = sectorCache.get(idx.symbol);
        if (stale) fresh.push(stale.data);
      }
    }
  }

  // Preserve SECTOR_INDICES order
  return SECTOR_INDICES.map((s) => fresh.find((f) => f.symbol === s.symbol)).filter(Boolean) as IndexQuote[];
}

// Popular Nifty50 basket for gainers/losers widgets.
export const NIFTY50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL',
  'ITC', 'BAJFINANCE', 'KOTAKBANK', 'LT', 'AXISBANK', 'MARUTI', 'ASIANPAINT', 'SUNPHARMA',
  'ULTRACEMCO', 'HCLTECH', 'TITAN', 'WIPRO', 'NTPC', 'TATAMOTORS', 'POWERGRID', 'TATASTEEL',
  'TECHM', 'ONGC', 'NESTLEIND', 'COALINDIA', 'INDUSINDBK', 'JSWSTEEL', 'HDFCLIFE', 'SBILIFE',
  'M&M', 'ADANIENT', 'ADANIPORTS', 'GRASIM', 'CIPLA', 'HINDALCO', 'DRREDDY', 'BAJAJFINSV',
  'EICHERMOT', 'BRITANNIA', 'DIVISLAB', 'HEROMOTOCO', 'BPCL', 'UPL', 'TATACONSUM',
  'APOLLOHOSP', 'LTIM', 'SHREECEM',
];

// ── Sector Sparkline Cache ──
const sectorSparkCache = new Map<string, number[]>();

export function getCachedSectorSparkline(symbol: string | null): number[] {
  if (!symbol) return [];
  return sectorSparkCache.get(symbol) || [];
}

export function setCachedSectorSparkline(symbol: string, closes: number[]): void {
  sectorSparkCache.set(symbol, closes);
}
