import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';

// Fallback stock data if NSE API fails
const FALLBACK_STOCKS: StockRow[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Oil & Gas', isin: 'INE002A01018' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', sector: 'IT Services', isin: 'INE467B01029' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Banking', isin: 'INE040A01034' },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'IT Services', isin: 'INE009A01021' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', sector: 'Banking', isin: 'INE090A01021' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', sector: 'FMCG', isin: 'INE029A01027' },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Banking', isin: 'INE062A01020' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', sector: 'Telecom', isin: 'INE939A01024' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', exchange: 'NSE', sector: 'Banking', isin: 'INE237A01028' },
  { symbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE', sector: 'FMCG', isin: 'INE154A01025' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', exchange: 'NSE', sector: 'Construction', isin: 'INE018A01030' },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', exchange: 'NSE', sector: 'Banking', isin: 'INE238A01034' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', sector: 'Automobile', isin: 'INE585B01010' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', sector: 'Finance', isin: 'INE086A01024' },
  { symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', sector: 'IT Services', isin: 'INE239A01022' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance Co Ltd', exchange: 'NSE', sector: 'Insurance', isin: 'INE098I01017' },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', exchange: 'NSE', sector: 'FMCG', isin: 'INE239A01022' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', exchange: 'NSE', sector: 'Cement', isin: 'INE030A01027' },
  { symbol: 'DMART', name: 'Avenue Supermarts Ltd', exchange: 'NSE', sector: 'Retail', isin: 'INE856A01024' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', exchange: 'NSE', sector: 'Diversified', isin: 'INE448A01024' },
];

// NIFTY 500 constituents — official NSE list (auto-updated)
const NIFTY500_URLS = [
  'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
  'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/csv,application/csv,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

interface StockRow {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  sector: string | null;
  isin: string | null;
}

async function fetchNifty500Symbols(): Promise<StockRow[]> {
  const session = axios.create({
    headers: { ...HEADERS, Referer: 'https://www.nseindia.com/' },
    timeout: 30000,
    maxRedirects: 5,
  });

  // Prime a session cookie by hitting the NSE homepage (some CDNs require it)
  let cookie = '';
  try {
    const home = await session.get('https://www.nseindia.com/', {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const setCookie = home.headers['set-cookie'];
    if (Array.isArray(setCookie)) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  } catch {
    // continue without cookie
  }

  let csv = '';
  let lastErr: any;
  for (const url of NIFTY500_URLS) {
    try {
      const res = await session.get<string>(url, {
        responseType: 'text',
        headers: cookie ? { Cookie: cookie } : undefined,
      });
      csv = res.data;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!csv) throw lastErr ?? new Error('NIFTY 500 CSV unavailable');

  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as any[];
  return rows
    .map((r) => ({
      symbol: String(r['Symbol'] || r['SYMBOL'] || '').trim(),
      name: String(r['Company Name'] || r['COMPANY NAME'] || '').trim(),
      exchange: 'NSE' as const,
      sector: String(r['Industry'] || r['INDUSTRY'] || '').trim() || null,
      isin: String(r['ISIN Code'] || r['ISIN CODE'] || '').trim() || null,
    }))
    .filter((r) => r.symbol && r.name);
}

/**
 * Ingests NIFTY 500 constituents into the stocks table.
 * Idempotent via ON CONFLICT DO NOTHING on the (symbol, exchange) unique constraint.
 * Also prunes any non-NIFTY-500 stocks that may exist from older deploys.
 */
export async function ingestSymbols() {
  // Wipe any non-NSE rows from older versions
  await db.prepare(`DELETE FROM stocks WHERE exchange <> 'NSE'`).run();

  const existing = ((await db.prepare('SELECT COUNT(*) as c FROM stocks WHERE exchange = ?').get('NSE')) as any)?.c ?? 0;
  if (existing >= 450) {
    console.log(`[symbols] already have ${existing} NIFTY 500 stocks, skipping ingest`);
    return existing;
  }

  console.log(`[symbols] fetching NIFTY 500 list (have=${existing})...`);
  let rows: StockRow[] = [];
  try {
    rows = await fetchNifty500Symbols();
  } catch (err: any) {
    console.warn('[symbols] NIFTY 500 fetch failed:', err?.message || err);
  }

  if (rows.length === 0) {
    // Fallback to hardcoded list if NSE API fails
    console.log('[symbols] Using fallback stock list...');
    rows = FALLBACK_STOCKS;
  }

  // Prune any stocks that are no longer in NIFTY 500
  const validSymbols = new Set(rows.map((r) => r.symbol.toUpperCase()));
  const allCurrent = (await db.prepare(`SELECT symbol FROM stocks WHERE exchange = 'NSE'`).all()) as any[];
  let pruned = 0;
  const pruneStmt = db.prepare(`DELETE FROM stocks WHERE symbol = ? AND exchange = 'NSE'`);
  for (const row of allCurrent) {
    if (!validSymbols.has(row.symbol.toUpperCase())) {
      await pruneStmt.run(row.symbol);
      pruned++;
    }
  }
  if (pruned) console.log(`[symbols] pruned ${pruned} non-NIFTY-500 stocks`);

  const insert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, sector, isin, category) VALUES (?, ?, ?, ?, ?, 'stock') ON CONFLICT (symbol, exchange) DO NOTHING`
  );
  let inserted = 0;
  for (const r of rows) {
    try {
      const res = await insert.run(r.symbol.toUpperCase(), r.name, r.exchange, r.sector, r.isin);
      if (res.changes) inserted++;
    } catch {
      // ignore individual row errors
    }
  }
  console.log(`[symbols] NIFTY 500 ingest complete: ${inserted} new, ${rows.length} total`);
  return inserted;
}
