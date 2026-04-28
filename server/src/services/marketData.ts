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
  // Convert to IST (UTC+5:30)
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
  const d = new Date(ist);
  // advance to next weekday
  do {
    if (d.getHours() * 60 + d.getMinutes() < MARKET_OPEN_H * 60 + MARKET_OPEN_M && d.getDay() >= 1 && d.getDay() <= 5) break;
    d.setDate(d.getDate() + 1);
    d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
  } while (d.getDay() === 0 || d.getDay() === 6);
  d.setHours(MARKET_OPEN_H, MARKET_OPEN_M, 0, 0);
  return d.toISOString();
}

// ── Adaptive TTL ──
const TTL_LIVE_MS = 10_000;   // 10 seconds during market hours
const TTL_CLOSED_MS = 300_000; // 5 minutes outside market hours

function getTTL(): number {
  return isMarketOpen() ? TTL_LIVE_MS : TTL_CLOSED_MS;
}

const cache = new Map<string, { at: number; data: Quote }>();

function yahooTicker(symbol: string, exchange: 'NSE' | 'BSE') {
  return `${symbol}.${exchange === 'NSE' ? 'NS' : 'BO'}`;
}

export async function getQuote(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE'): Promise<Quote | null> {
  const key = `${symbol}:${exchange}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < getTTL()) return hit.data;

  try {
    const q = (await yahooFinance.quote(yahooTicker(symbol, exchange))) as any;
    if (!q || typeof q.regularMarketPrice !== 'number') return null;
    const data: Quote = {
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
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    return null;
  }
}

export async function getQuotes(
  items: { symbol: string; exchange?: 'NSE' | 'BSE' }[]
): Promise<Quote[]> {
  const tickers: string[] = [];
  const missKey: Record<string, { symbol: string; exchange: 'NSE' | 'BSE' }> = {};
  const out: Quote[] = [];

  for (const it of items) {
    const exchange = it.exchange ?? 'NSE';
    const key = `${it.symbol}:${exchange}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < getTTL()) {
      out.push(hit.data);
    } else {
      const t = yahooTicker(it.symbol, exchange);
      tickers.push(t);
      missKey[t] = { symbol: it.symbol, exchange };
    }
  }

  if (tickers.length) {
    try {
      const results = (await yahooFinance.quote(tickers)) as any[];
      const arr = Array.isArray(results) ? results : [results];
      for (const q of arr) {
        if (!q || typeof q.regularMarketPrice !== 'number') continue;
        const src = missKey[q.symbol];
        if (!src) continue;
        const data: Quote = {
          symbol: src.symbol,
          exchange: src.exchange,
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
        cache.set(`${src.symbol}:${src.exchange}`, { at: Date.now(), data });
        out.push(data);
      }
    } catch {
      // swallow batch errors
    }
  }

  return out;
}

export async function getHistory(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE',
  period1: Date = new Date(Date.now() - 90 * 24 * 3600 * 1000),
  interval: '1d' | '1h' | '1wk' | '1mo' = '1d'
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
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^BSESN', name: 'SENSEX' },
  { symbol: '^NSEBANK', name: 'BANK NIFTY' },
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

export async function getIndices(): Promise<IndexQuote[]> {
  const ttl = getTTL();
  const fresh: IndexQuote[] = [];
  const missing: typeof INDICES = [];

  for (const idx of INDICES) {
    const hit = indexCache.get(idx.symbol);
    if (hit && Date.now() - hit.at < ttl) fresh.push(hit.data);
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
        indexCache.set(meta.symbol, { at: Date.now(), data });
        fresh.push(data);
      }
    } catch {
      // swallow; return whatever we have
    }
  }
  return fresh;
}

// Popular Nifty50 + Sensex30 basket for gainers/losers widgets.
export const NIFTY50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL',
  'ITC', 'BAJFINANCE', 'KOTAKBANK', 'LT', 'AXISBANK', 'MARUTI', 'ASIANPAINT', 'SUNPHARMA',
  'ULTRACEMCO', 'HCLTECH', 'TITAN', 'WIPRO', 'NTPC', 'TATAMOTORS', 'POWERGRID', 'TATASTEEL',
  'TECHM', 'ONGC', 'NESTLEIND', 'COALINDIA', 'INDUSINDBK', 'JSWSTEEL', 'HDFCLIFE', 'SBILIFE',
  'M&M', 'ADANIENT', 'ADANIPORTS', 'GRASIM', 'CIPLA', 'HINDALCO', 'DRREDDY', 'BAJAJFINSV',
  'EICHERMOT', 'BRITANNIA', 'DIVISLAB', 'HEROMOTOCO', 'BPCL', 'UPL', 'TATACONSUM',
  'APOLLOHOSP', 'LTIM', 'SHREECEM',
];
