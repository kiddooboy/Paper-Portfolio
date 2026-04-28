import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';

// NIFTY 500 constituents — official NSE list (auto-updated)
const NIFTY500_URLS = [
  'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
  'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
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
    return existing;
  }

  if (!rows.length) {
    console.warn('[symbols] NIFTY 500 returned no rows');
    return existing;
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
