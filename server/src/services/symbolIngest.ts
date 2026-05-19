import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';
import { TRADEABLE_INDICES } from './marketData.js';

/** Ensures the tradeable market indices (NIFTY, SENSEX, …) exist as
 *  category='index' rows so users can trade them like stocks. */
function ensureIndices() {
  const insert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, category)
     VALUES (?, ?, 'NSE', 'index')
     ON CONFLICT (symbol, exchange) DO UPDATE SET
       name = excluded.name, category = 'index'`
  );
  for (const idx of TRADEABLE_INDICES) {
    try { insert.run(idx.symbol, idx.name); } catch {}
  }
}

const FALLBACK_STOCKS = [
  { symbol: 'RELIANCE',   name: 'Reliance Industries Ltd',              exchange: 'NSE' as const, sector: 'Oil Gas & Consumable Fuels',       isin: 'INE002A01018' },
  { symbol: 'TCS',        name: 'Tata Consultancy Services Ltd',         exchange: 'NSE' as const, sector: 'Information Technology',           isin: 'INE467B01029' },
  { symbol: 'HDFCBANK',   name: 'HDFC Bank Ltd',                         exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE040A01034' },
  { symbol: 'INFY',       name: 'Infosys Ltd',                           exchange: 'NSE' as const, sector: 'Information Technology',           isin: 'INE009A01021' },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank Ltd',                        exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE090A01021' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd',                exchange: 'NSE' as const, sector: 'Fast Moving Consumer Goods',       isin: 'INE029A01027' },
  { symbol: 'SBIN',       name: 'State Bank of India',                   exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE062A01020' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd',                     exchange: 'NSE' as const, sector: 'Telecommunication',                isin: 'INE939A01024' },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank Ltd',               exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE237A01028' },
  { symbol: 'ITC',        name: 'ITC Ltd',                               exchange: 'NSE' as const, sector: 'Fast Moving Consumer Goods',       isin: 'INE154A01025' },
  { symbol: 'LT',         name: 'Larsen & Toubro Ltd',                   exchange: 'NSE' as const, sector: 'Capital Goods',                    isin: 'INE018A01030' },
  { symbol: 'AXISBANK',   name: 'Axis Bank Ltd',                         exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE238A01034' },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki India Ltd',               exchange: 'NSE' as const, sector: 'Automobile and Auto Components',   isin: 'INE585B01010' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd',                     exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE086A01024' },
  { symbol: 'WIPRO',      name: 'Wipro Ltd',                             exchange: 'NSE' as const, sector: 'Information Technology',           isin: 'INE239A01022' },
  { symbol: 'HDFCLIFE',   name: 'HDFC Life Insurance Co Ltd',            exchange: 'NSE' as const, sector: 'Financial Services',               isin: 'INE098I01017' },
  { symbol: 'NESTLEIND',  name: 'Nestle India Ltd',                      exchange: 'NSE' as const, sector: 'Fast Moving Consumer Goods',       isin: 'INE239A01022' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd',                  exchange: 'NSE' as const, sector: 'Construction Materials',           isin: 'INE030A01027' },
  { symbol: 'DMART',      name: 'Avenue Supermarts Ltd',                 exchange: 'NSE' as const, sector: 'Consumer Services',                isin: 'INE856A01024' },
  { symbol: 'ADANIENT',   name: 'Adani Enterprises Ltd',                 exchange: 'NSE' as const, sector: 'Oil Gas & Consumable Fuels',       isin: 'INE448A01024' },
];

// NIFTY 500 CSV — carries Industry (sector) labels per stock
const NIFTY500_URLS = [
  'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
  'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
];

// Complete NSE equity master — all EQ-series listed stocks (~2 000+)
const NSE_EQUITY_URLS = [
  'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
  'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/csv,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

interface StockRow {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  sector: string | null;
  isin: string | null;
}

function makeNseSession() {
  return axios.create({
    headers: { ...HEADERS, Referer: 'https://www.nseindia.com/' },
    timeout: 30_000,
    maxRedirects: 5,
  });
}

async function getNseCookie(session: ReturnType<typeof axios.create>): Promise<string> {
  try {
    const home = await session.get('https://www.nseindia.com/', {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const setCookie = home.headers['set-cookie'];
    if (Array.isArray(setCookie)) return setCookie.map((c) => c.split(';')[0]).join('; ');
  } catch {}
  return '';
}

/** Returns Map<isin, sector> from NIFTY 500 CSV for sector enrichment. */
async function fetchNifty500SectorMap(): Promise<Map<string, string>> {
  const session = makeNseSession();
  const cookie = await getNseCookie(session);
  let csv = '';
  for (const url of NIFTY500_URLS) {
    try {
      const res = await session.get<string>(url, {
        responseType: 'text',
        headers: cookie ? { Cookie: cookie } : undefined,
      });
      csv = res.data;
      break;
    } catch {}
  }
  const map = new Map<string, string>();
  if (!csv) return map;
  try {
    const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as any[];
    for (const r of rows) {
      const isin   = String(r['ISIN Code'] || r['ISIN CODE'] || '').trim();
      const sector = String(r['Industry']  || r['INDUSTRY']  || '').trim();
      if (isin && sector) map.set(isin, sector);
    }
  } catch {}
  return map;
}

/** Fetches ALL NSE EQ-series stocks from EQUITY_L.csv. */
async function fetchAllNseSymbols(): Promise<StockRow[]> {
  const session = makeNseSession();
  const cookie = await getNseCookie(session);
  let csv = '';
  for (const url of NSE_EQUITY_URLS) {
    try {
      const res = await session.get<string>(url, {
        responseType: 'text',
        headers: cookie ? { Cookie: cookie } : undefined,
      });
      csv = res.data;
      break;
    } catch {}
  }
  if (!csv) throw new Error('NSE EQUITY_L.csv unavailable');

  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1); // strip BOM

  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as any[];
  return rows
    .filter((r) => String(r['SERIES'] || '').trim().toUpperCase() === 'EQ')
    .map((r) => ({
      symbol: String(r['SYMBOL'] || '').trim().toUpperCase(),
      name:   String(r['NAME OF COMPANY'] || '').trim(),
      exchange: 'NSE' as const,
      sector: null,
      isin:   String(r['ISIN NUMBER'] || '').trim() || null,
    }))
    .filter((r) => r.symbol && r.name);
}

/**
 * Ingests ALL NSE EQ-series stocks into the stocks table.
 *
 * Data sources:
 *   1. EQUITY_L.csv  — full NSE equity master (~2 000 EQ-series stocks, no sector)
 *   2. ind_nifty500list.csv — adds sector labels for the NIFTY 500 subset
 *
 * Skips ingest if stocks table already has ≥ 1 800 NSE rows (i.e. already expanded).
 */
export async function ingestSymbols() {
  // Always make sure the tradeable indices are present (cheap, idempotent).
  ensureIndices();

  const existing =
    ((db.prepare(`SELECT COUNT(*) as c FROM stocks WHERE exchange = 'NSE' AND category = 'stock'`).get()) as any)?.c ?? 0;

  if (existing >= 1800) {
    console.log(`[symbols] already have ${existing} NSE stocks — skipping ingest`);
    return existing;
  }

  console.log(`[symbols] starting full NSE ingest (current=${existing})…`);

  // Build ISIN → sector enrichment map from NIFTY500 CSV
  let sectorMap = new Map<string, string>();
  try {
    sectorMap = await fetchNifty500SectorMap();
    console.log(`[symbols] sector map: ${sectorMap.size} NIFTY500 entries`);
  } catch (err: any) {
    console.warn('[symbols] sector map fetch failed:', err?.message);
  }

  // Fetch all NSE EQ stocks
  let nseStocks: StockRow[] = [];
  try {
    const raw = await fetchAllNseSymbols();
    nseStocks = raw.map((s) => ({
      ...s,
      sector: s.isin ? (sectorMap.get(s.isin) ?? null) : null,
    }));
    console.log(`[symbols] NSE EQUITY_L: ${nseStocks.length} EQ stocks`);
  } catch (err: any) {
    console.warn('[symbols] NSE EQUITY_L fetch failed:', err?.message);
  }

  if (nseStocks.length === 0) {
    console.log('[symbols] Using built-in fallback stock list…');
    nseStocks = FALLBACK_STOCKS;
  }

  // Non-destructive prune: only remove stale rows when the fresh fetch is
  // healthy (≥ 1 000 stocks), and NEVER remove a symbol a user holds or
  // watches — otherwise they could be stuck unable to exit a position.
  const healthyFetch = nseStocks.length >= 1000;
  if (healthyFetch) {
    const fresh = new Set(nseStocks.map((s) => s.symbol));
    const protectedSyms = new Set(
      (db.prepare(
        `SELECT symbol FROM holdings UNION SELECT symbol FROM watchlist_items`
      ).all() as any[]).map((r) => r.symbol)
    );
    const current = db.prepare(
      `SELECT symbol FROM stocks WHERE exchange = 'NSE' AND category = 'stock'`
    ).all() as any[];
    const del = db.prepare(`DELETE FROM stocks WHERE symbol = ? AND exchange = 'NSE' AND category = 'stock'`);
    let pruned = 0;
    for (const row of current) {
      if (!fresh.has(row.symbol) && !protectedSyms.has(row.symbol)) {
        del.run(row.symbol);
        pruned++;
      }
    }
    if (pruned) console.log(`[symbols] pruned ${pruned} delisted/stale NSE rows`);
  }

  const insert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, sector, isin, category)
     VALUES (?, ?, ?, ?, ?, 'stock')
     ON CONFLICT (symbol, exchange) DO UPDATE SET
       name   = excluded.name,
       sector = COALESCE(excluded.sector, stocks.sector),
       isin   = COALESCE(excluded.isin,   stocks.isin)`
  );

  let inserted = 0;
  for (const r of nseStocks) {
    try {
      const res = insert.run(r.symbol, r.name, r.exchange, r.sector, r.isin);
      if (res.changes) inserted++;
    } catch {}
  }

  const total =
    ((db.prepare(`SELECT COUNT(*) as c FROM stocks WHERE exchange = 'NSE'`).get()) as any)?.c ?? 0;
  console.log(`[symbols] ingest complete — ${inserted} upserted, ${total} total NSE stocks`);
  return total;
}
