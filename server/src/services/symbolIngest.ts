import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';

const NSE_CSV_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const BSE_JSON_URL =
  'https://api.bseindia.com/BseIndiaAPI/api/ListOfScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active';

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

async function fetchNseSymbols(): Promise<StockRow[]> {
  // NSE blocks direct CSV fetches; prime a session by visiting the homepage
  // and reusing the Set-Cookie header.
  const session = axios.create({
    headers: { ...HEADERS, Referer: 'https://www.nseindia.com/' },
    timeout: 30000,
    maxRedirects: 5,
  });

  let cookie = '';
  try {
    const home = await session.get('https://www.nseindia.com/', {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const setCookie = home.headers['set-cookie'];
    if (Array.isArray(setCookie)) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  } catch {
    // continue without cookie; may still work via archives subdomain
  }

  const urls = [
    NSE_CSV_URL,
    'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
  ];
  let csv = '';
  let lastErr: any;
  for (const url of urls) {
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
  if (!csv) throw lastErr ?? new Error('NSE CSV unavailable');

  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as any[];
  return rows
    .map((r) => ({
      symbol: (r['SYMBOL'] || '').trim(),
      name: (r['NAME OF COMPANY'] || '').trim(),
      exchange: 'NSE' as const,
      sector: (r[' SERIES'] || r['SERIES'] || '').trim() || null,
      isin: (r[' ISIN NUMBER'] || r['ISIN NUMBER'] || '').trim() || null,
    }))
    .filter((r) => r.symbol && r.name);
}

async function fetchBseSymbols(): Promise<StockRow[]> {
  const { data } = await axios.get<any>(BSE_JSON_URL, {
    headers: { ...HEADERS, Referer: 'https://www.bseindia.com/' },
    timeout: 30000,
  });
  const list: any[] = Array.isArray(data) ? data : data?.Table || data?.Data || [];
  return list
    .map((r) => ({
      symbol: (r.scrip_id || r.SCRIP_ID || r.Scrip_Id || '').toString().trim(),
      name: (r.scrip_name || r.SCRIP_NAME || r.Scrip_Name || '').toString().trim(),
      exchange: 'BSE' as const,
      sector: (r.Industry || r.industry || '').toString().trim() || null,
      isin: (r.ISIN_NUMBER || r.isin_number || r.ISIN || '').toString().trim() || null,
    }))
    .filter((r) => r.symbol && r.name);
}

/**
 * Ingests all NSE + BSE equity symbols into the stocks table.
 * Idempotent via INSERT OR IGNORE on the (symbol, exchange) unique constraint.
 * Skips any exchange that already has rows so we can retry missing exchanges.
 */
export async function ingestSymbols() {
  const nseCount = (db.prepare('SELECT COUNT(*) as c FROM stocks WHERE exchange = ?').get('NSE') as any)?.c ?? 0;
  const bseCount = (db.prepare('SELECT COUNT(*) as c FROM stocks WHERE exchange = ?').get('BSE') as any)?.c ?? 0;

  const needNse = nseCount < 500;
  const needBse = bseCount < 2000;
  if (!needNse && !needBse) {
    console.log(`[symbols] already have NSE=${nseCount}, BSE=${bseCount}, skipping ingest`);
    return nseCount + bseCount;
  }

  console.log(`[symbols] ingesting missing listings (NSE needed=${needNse}, BSE needed=${needBse})...`);
  const tasks: Promise<StockRow[]>[] = [];
  tasks.push(needNse ? fetchNseSymbols() : Promise.resolve([]));
  tasks.push(needBse ? fetchBseSymbols() : Promise.resolve([]));
  const results = await Promise.allSettled(tasks);

  const nseRows = results[0].status === 'fulfilled' ? results[0].value : [];
  const bseRows = results[1].status === 'fulfilled' ? results[1].value : [];

  if (needNse && results[0].status === 'rejected') console.warn('[symbols] NSE fetch failed:', (results[0].reason as Error).message);
  if (needBse && results[1].status === 'rejected') console.warn('[symbols] BSE fetch failed:', (results[1].reason as Error).message);

  const rows = [...nseRows, ...bseRows];
  console.log(`[symbols] fetched NSE=${nseRows.length}, BSE=${bseRows.length}`);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO stocks (symbol, name, exchange, sector, isin, category) VALUES (?, ?, ?, ?, ?, 'stock')`
  );
  let inserted = 0;
  for (const r of rows) {
    try {
      const res = insert.run(r.symbol.toUpperCase(), r.name, r.exchange, r.sector, r.isin);
      if (res.changes) inserted++;
    } catch {
      // ignore individual row errors
    }
  }
  console.log(`[symbols] inserted ${inserted} new stocks`);
  return inserted;
}
