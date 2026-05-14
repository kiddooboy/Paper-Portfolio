import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// Silence the noisy survey/notice banner (best-effort, API varies by version)
try { (yahooFinance as any).suppressNotices?.(['yahooSurvey']); } catch {}

export interface Quote {
  symbol: string;          // raw symbol e.g. "RELIANCE"
  exchange: 'NSE' | 'BSE'; // which suffix we used
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

function getISTDate(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

export function isMarketOpen(): boolean {
  const ist = getISTDate();
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const openMin = MARKET_OPEN_H * 60 + MARKET_OPEN_M;
  const closeMin = MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;
  return minutes >= openMin && minutes <= closeMin;
}

export function getMarketStatus() {
  const ist = getISTDate();
  const open = isMarketOpen();
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const openMin = MARKET_OPEN_H * 60 + MARKET_OPEN_M;
  const closeMin = MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;

  let label = 'Closed';
  if (open) label = 'Open';
  else if (day >= 1 && day <= 5 && minutes < openMin) label = 'Pre-market';
  else if (day >= 1 && day <= 5 && minutes > closeMin) label = 'After hours';

  return {
    isOpen: open,
    label,
    ist: ist.toISOString(),
    nextOpen: open ? null : getNextOpenIST(ist),
    pollIntervalMs: open ? 10_000 : 300_000, // 10s live, 5min closed
  };
}

function getNextOpenIST(ist: Date): string {
  // ist is a fake-UTC date whose numeric value represents IST wall time.
  // We work in that fake space, then convert back to real UTC before returning.
  const IST_OFFSET_MS = 5.5 * 3600000;
  const d = new Date(ist);
  do {
    if (d.getHours() * 60 + d.getMinutes() < MARKET_OPEN_H * 60 + MARKET_OPEN_M && d.getDay() >= 1 && d.getDay() <= 5) break;
    d.setDate(d.getDate() + 1);
    d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
  } while (d.getDay() === 0 || d.getDay() === 6);
  d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
  // d is fake-UTC (IST wall time); subtract IST offset to get real UTC
  return new Date(d.getTime() - IST_OFFSET_MS).toISOString();
}

// ── Adaptive TTL ──
const TTL_LIVE_MS   = 5_000;   // 5 seconds — matches server poll interval
const TTL_CLOSED_MS = 300_000; // 5 minutes outside market hours
// Stale-while-revalidate: serve stale data up to this age before refusing
const STALE_GRACE_MS = 3_600_000; // 1 hour — always serve *something*

function getTTL(): number {
  return isMarketOpen() ? TTL_LIVE_MS : TTL_CLOSED_MS;
}

// ── Cache — stores BOTH live and last-known-good data ──
// { data: Quote, at: number (last successful fetch), stale: boolean }
interface CacheEntry { data: Quote; at: number; }
const cache = new Map<string, CacheEntry>();

function yahooTicker(symbol: string, exchange: 'NSE' | 'BSE') {
  return `${symbol}.${exchange === 'NSE' ? 'NS' : 'BO'}`;
}

function mapYahooQuote(q: any, symbol: string, exchange: 'NSE' | 'BSE'): Quote | null {
  if (!q || typeof q.regularMarketPrice !== 'number') return null;
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
    currency: q.currency ?? 'INR',
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
async function fetchQuoteViaChart(symbol: string, exchange: 'NSE' | 'BSE'): Promise<Quote | null> {
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
      currency: meta.currency ?? 'INR',
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
export function getCachedQuote(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE'): Quote {
  const hit = cache.get(`${symbol}:${exchange}`);
  if (hit) return hit.data;
  return { symbol, exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: 'INR' };
}

export function getCachedQuotes(items: { symbol: string; exchange?: 'NSE' | 'BSE' }[]): Quote[] {
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

export async function getQuote(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE', forceRefresh = false): Promise<Quote | null> {
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
  const dummy: Quote = { symbol, exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: 'INR' };
  cache.set(key, { data: dummy, at: now });
  return dummy;
}

export async function getQuotes(
  items: { symbol: string; exchange?: 'NSE' | 'BSE' }[],
  forceRefresh = false
): Promise<Quote[]> {
  const now = Date.now();
  const ttl = getTTL();
  const tickers: string[] = [];
  const missKey: Record<string, { symbol: string; exchange: 'NSE' | 'BSE' }> = {};
  const out: Quote[] = [];

  for (const it of items) {
    const exchange = it.exchange ?? 'NSE';
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
            const dummy: Quote = { symbol: src.symbol, exchange: src.exchange, price: 0, change: 0, change_percent: 0, previous_close: 0, day_high: 0, day_low: 0, volume: 0, currency: 'INR' };
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
  exchange: 'NSE' | 'BSE' = 'NSE',
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
 * Free-text symbol/name search via Yahoo Finance. Returns NSE/BSE only.
 */
export async function searchSymbols(query: string, limit = 15) {
  if (!query) return [];
  try {
    const res = (await yahooFinance.search(query, { quotesCount: limit * 2, newsCount: 0 })) as any;
    const quotes = res?.quotes || [];
    return quotes
      .filter((q: any) => q?.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')))
      .slice(0, limit)
      .map((q: any) => {
        const ex = q.symbol.endsWith('.NS') ? 'NSE' : 'BSE';
        const bareSymbol = q.symbol.replace(/\.(NS|BO)$/, '');
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
