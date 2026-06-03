// US equity symbol universe — S&P 500 + NASDAQ 100 + a marquee fallback.
//
// Strategy:
//   1. Try the public S&P 500 constituents CSV (datasets/s-and-p-500-companies
//      on GitHub — stable, MIT-licensed, has Symbol/Name/Sector/Exchange).
//   2. Augment with NASDAQ 100 constituents (separate public CSV).
//   3. If both fetches fail, fall back to a hardcoded 60-name marquee list so
//      the Global page never boots empty in dev.
//
// Top-100 NYSE-by-market-cap is *derived later* — once tier 2 has populated
// the in-memory cache with market caps, we can flag the leaders without
// needing an extra data source. (Stub helper at bottom.)
//
// Idempotent: every insert uses `ON CONFLICT(symbol, exchange) DO UPDATE` so
// re-running the ingest cleanly refreshes name/sector.

import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';

// ── Sources ──────────────────────────────────────────────────────────────────
const SP500_CSV_URLS = [
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv',
];
const NASDAQ100_CSV_URLS = [
  // Wikipedia-derived CSV mirrored on a stable repo.
  'https://raw.githubusercontent.com/edarchimbaud/nasdaq100/main/nasdaq100.csv',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/csv,*/*',
  'Accept-Encoding': 'gzip, deflate, br',
};

// ── Fallback list (60 marquee US tickers) ────────────────────────────────────
// Used when both public CSVs fail. Covers all major sectors so the Global
// page has a meaningful universe even offline.
const FALLBACK_US: { symbol: string; name: string; exchange: 'NASDAQ' | 'NYSE'; sector: string }[] = [
  { symbol: 'AAPL',  name: 'Apple Inc.',                       exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'MSFT',  name: 'Microsoft Corporation',            exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)',          exchange: 'NASDAQ', sector: 'Communication Services' },
  { symbol: 'GOOG',  name: 'Alphabet Inc. (Class C)',          exchange: 'NASDAQ', sector: 'Communication Services' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.',                  exchange: 'NASDAQ', sector: 'Consumer Discretionary' },
  { symbol: 'META',  name: 'Meta Platforms Inc.',              exchange: 'NASDAQ', sector: 'Communication Services' },
  { symbol: 'NVDA',  name: 'NVIDIA Corporation',               exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'TSLA',  name: 'Tesla Inc.',                       exchange: 'NASDAQ', sector: 'Consumer Discretionary' },
  { symbol: 'AMD',   name: 'Advanced Micro Devices Inc.',      exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'INTC',  name: 'Intel Corporation',                exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'NFLX',  name: 'Netflix Inc.',                     exchange: 'NASDAQ', sector: 'Communication Services' },
  { symbol: 'ADBE',  name: 'Adobe Inc.',                       exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'CRM',   name: 'Salesforce Inc.',                  exchange: 'NYSE',   sector: 'Information Technology' },
  { symbol: 'ORCL',  name: 'Oracle Corporation',               exchange: 'NYSE',   sector: 'Information Technology' },
  { symbol: 'IBM',   name: 'International Business Machines',  exchange: 'NYSE',   sector: 'Information Technology' },
  { symbol: 'CSCO',  name: 'Cisco Systems Inc.',               exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'AVGO',  name: 'Broadcom Inc.',                    exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'QCOM',  name: 'QUALCOMM Incorporated',            exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'TXN',   name: 'Texas Instruments Inc.',           exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'MU',    name: 'Micron Technology Inc.',           exchange: 'NASDAQ', sector: 'Information Technology' },
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.',             exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'BAC',   name: 'Bank of America Corp.',            exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'WFC',   name: 'Wells Fargo & Company',            exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'GS',    name: 'Goldman Sachs Group Inc.',         exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'MS',    name: 'Morgan Stanley',                   exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'V',     name: 'Visa Inc.',                        exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'MA',    name: 'Mastercard Incorporated',          exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc. (B)',      exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson',                exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'PFE',   name: 'Pfizer Inc.',                      exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'UNH',   name: 'UnitedHealth Group Inc.',          exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'LLY',   name: 'Eli Lilly and Company',            exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'ABBV',  name: 'AbbVie Inc.',                      exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'MRK',   name: 'Merck & Co. Inc.',                 exchange: 'NYSE',   sector: 'Health Care' },
  { symbol: 'XOM',   name: 'Exxon Mobil Corporation',          exchange: 'NYSE',   sector: 'Energy' },
  { symbol: 'CVX',   name: 'Chevron Corporation',              exchange: 'NYSE',   sector: 'Energy' },
  { symbol: 'COP',   name: 'ConocoPhillips',                   exchange: 'NYSE',   sector: 'Energy' },
  { symbol: 'WMT',   name: 'Walmart Inc.',                     exchange: 'NYSE',   sector: 'Consumer Staples' },
  { symbol: 'COST',  name: 'Costco Wholesale Corporation',     exchange: 'NASDAQ', sector: 'Consumer Staples' },
  { symbol: 'KO',    name: 'The Coca-Cola Company',            exchange: 'NYSE',   sector: 'Consumer Staples' },
  { symbol: 'PEP',   name: 'PepsiCo Inc.',                     exchange: 'NASDAQ', sector: 'Consumer Staples' },
  { symbol: 'PG',    name: 'Procter & Gamble Co.',             exchange: 'NYSE',   sector: 'Consumer Staples' },
  { symbol: 'HD',    name: 'The Home Depot Inc.',              exchange: 'NYSE',   sector: 'Consumer Discretionary' },
  { symbol: 'NKE',   name: 'NIKE Inc.',                        exchange: 'NYSE',   sector: 'Consumer Discretionary' },
  { symbol: 'MCD',   name: 'McDonald\'s Corporation',          exchange: 'NYSE',   sector: 'Consumer Discretionary' },
  { symbol: 'SBUX',  name: 'Starbucks Corporation',            exchange: 'NASDAQ', sector: 'Consumer Discretionary' },
  { symbol: 'DIS',   name: 'The Walt Disney Company',          exchange: 'NYSE',   sector: 'Communication Services' },
  { symbol: 'BA',    name: 'The Boeing Company',               exchange: 'NYSE',   sector: 'Industrials' },
  { symbol: 'CAT',   name: 'Caterpillar Inc.',                 exchange: 'NYSE',   sector: 'Industrials' },
  { symbol: 'GE',    name: 'General Electric Company',         exchange: 'NYSE',   sector: 'Industrials' },
  { symbol: 'UPS',   name: 'United Parcel Service Inc.',       exchange: 'NYSE',   sector: 'Industrials' },
  { symbol: 'T',     name: 'AT&T Inc.',                        exchange: 'NYSE',   sector: 'Communication Services' },
  { symbol: 'VZ',    name: 'Verizon Communications Inc.',      exchange: 'NYSE',   sector: 'Communication Services' },
  { symbol: 'PYPL',  name: 'PayPal Holdings Inc.',             exchange: 'NASDAQ', sector: 'Financials' },
  { symbol: 'SQ',    name: 'Block Inc.',                       exchange: 'NYSE',   sector: 'Financials' },
  { symbol: 'UBER',  name: 'Uber Technologies Inc.',           exchange: 'NYSE',   sector: 'Industrials' },
  { symbol: 'ABNB',  name: 'Airbnb Inc.',                      exchange: 'NASDAQ', sector: 'Consumer Discretionary' },
  { symbol: 'SHOP',  name: 'Shopify Inc.',                     exchange: 'NYSE',   sector: 'Information Technology' },
  { symbol: 'COIN',  name: 'Coinbase Global Inc.',             exchange: 'NASDAQ', sector: 'Financials' },
  { symbol: 'PLTR',  name: 'Palantir Technologies Inc.',       exchange: 'NYSE',   sector: 'Information Technology' },
  { symbol: 'F',     name: 'Ford Motor Company',               exchange: 'NYSE',   sector: 'Consumer Discretionary' },
  { symbol: 'GM',    name: 'General Motors Company',           exchange: 'NYSE',   sector: 'Consumer Discretionary' },
];

interface UsRow { symbol: string; name: string; exchange: 'NASDAQ' | 'NYSE'; sector: string | null; }

async function fetchCsv(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await axios.get<string>(url, { headers: HEADERS, timeout: 20_000, responseType: 'text' });
      if (typeof res.data === 'string' && res.data.length > 100) return res.data;
    } catch (e: any) {
      console.warn(`[us-symbols] fetch failed ${url}: ${e?.message || e}`);
    }
  }
  return null;
}

function normalizeExchange(raw: string | undefined): 'NASDAQ' | 'NYSE' {
  const s = String(raw || '').toUpperCase();
  if (s.includes('NASDAQ') || s === 'NMS' || s === 'NGM' || s === 'NCM') return 'NASDAQ';
  return 'NYSE';
}

function parseSp500(csvText: string): UsRow[] {
  try {
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as any[];
    return rows
      .map((r) => {
        // datasets/s-and-p-500-companies columns: Symbol, Security, GICS Sector, Headquarters Location, Date first added, CIK, Founded
        const symbol = String(r.Symbol || r.symbol || '').trim().toUpperCase();
        const name = String(r.Security || r.security || r.Name || r.name || '').trim();
        const sector = String(r['GICS Sector'] || r.Sector || r.sector || '').trim() || null;
        if (!symbol) return null;
        // S&P 500 mixes NYSE & NASDAQ; the CSV doesn't always include exchange. Default NYSE then patch via NASDAQ 100 below.
        return { symbol, name, exchange: 'NYSE' as const, sector };
      })
      .filter(Boolean) as UsRow[];
  } catch (e: any) {
    console.warn('[us-symbols] sp500 parse failed:', e?.message || e);
    return [];
  }
}

function parseNasdaq100(csvText: string): Set<string> {
  const out = new Set<string>();
  try {
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as any[];
    for (const r of rows) {
      const sym = String(r.Symbol || r.Ticker || r.symbol || r.ticker || '').trim().toUpperCase();
      if (sym) out.add(sym);
    }
  } catch {}
  return out;
}

function upsertRows(rows: UsRow[]): number {
  const insert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, sector, currency)
       VALUES (?, ?, ?, ?, 'USD')
     ON CONFLICT (symbol, exchange) DO UPDATE SET
       name = excluded.name,
       sector = excluded.sector,
       currency = 'USD'`
  );
  let n = 0;
  for (const r of rows) {
    try {
      insert.run(r.symbol, r.name, r.exchange, r.sector ?? null);
      n++;
    } catch (e: any) {
      // Ignore CHECK or uniqueness blowups silently — surface only unknown errors.
      if (!/CHECK|UNIQUE/i.test(String(e?.message || ''))) {
        console.warn(`[us-symbols] insert failed ${r.symbol}: ${e?.message || e}`);
      }
    }
  }
  return n;
}

export async function ingestUsSymbols(): Promise<void> {
  // Skip if we already have a healthy US universe (rerun-friendly).
  const existing = (db.prepare(
    `SELECT COUNT(*) AS c FROM stocks WHERE exchange IN ('NASDAQ','NYSE')`
  ).get() as any)?.c ?? 0;
  if (existing >= 400) {
    console.log(`[us-symbols] cache hit — ${existing} US rows already ingested, skipping fetch`);
    return;
  }

  const [sp500Csv, ndx100Csv] = await Promise.all([
    fetchCsv(SP500_CSV_URLS),
    fetchCsv(NASDAQ100_CSV_URLS),
  ]);

  const ndxSet = ndx100Csv ? parseNasdaq100(ndx100Csv) : new Set<string>();
  const sp500Rows = sp500Csv ? parseSp500(sp500Csv) : [];

  // Patch exchange: any S&P symbol that also lives in NASDAQ 100 → NASDAQ.
  for (const r of sp500Rows) {
    if (ndxSet.has(r.symbol)) r.exchange = 'NASDAQ';
  }

  // Add NASDAQ-100 symbols missing from S&P (e.g. PEP is in both; some N100
  // names like LULU were dropped from S&P at times — keep them).
  if (ndx100Csv) {
    try {
      const ndxRows = parse(ndx100Csv, { columns: true, skip_empty_lines: true, trim: true }) as any[];
      for (const r of ndxRows) {
        const symbol = String(r.Symbol || r.Ticker || '').trim().toUpperCase();
        if (!symbol) continue;
        if (sp500Rows.find((s) => s.symbol === symbol)) continue;
        sp500Rows.push({
          symbol,
          name: String(r.Security || r.Company || r.Name || symbol).trim(),
          exchange: 'NASDAQ',
          sector: String(r['GICS Sector'] || r.Sector || '').trim() || null,
        });
      }
    } catch {}
  }

  const rows = sp500Rows.length ? sp500Rows : FALLBACK_US;
  if (!sp500Rows.length) console.warn('[us-symbols] both feeds failed — using 60-name marquee fallback');

  const inserted = upsertRows(rows);
  console.log(`[us-symbols] ingested ${inserted} symbols across NASDAQ/NYSE (sp500=${sp500Rows.length}, ndx100=${ndxSet.size})`);
}
