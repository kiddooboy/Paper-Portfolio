// One-off: populate the stocks table with the full NSE EQ universe + indices.
// Run:  node --experimental-sqlite server/src/scripts/populate-nse.mjs
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'papertrading.db');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/csv,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TRADEABLE_INDICES = [
  { symbol: 'NIFTY',       name: 'NIFTY 50 Index' },
  { symbol: 'SENSEX',      name: 'BSE SENSEX Index' },
  { symbol: 'BANKNIFTY',   name: 'NIFTY Bank Index' },
  { symbol: 'NIFTYIT',     name: 'NIFTY IT Index' },
  { symbol: 'NIFTY100',    name: 'NIFTY 100 Index' },
  { symbol: 'NIFTYMIDCAP', name: 'NIFTY Midcap Index' },
];

async function fetchText(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Referer: 'https://www.nseindia.com/' } });
      if (res.ok) return await res.text();
    } catch {}
  }
  return '';
}

async function main() {
  console.log('[populate] DB:', DB_PATH);
  const db = new DatabaseSync(DB_PATH);

  // 1. Sector map from NIFTY 500
  let sectorMap = new Map();
  const n500 = await fetchText([
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
    'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
  ]);
  if (n500) {
    try {
      const rows = parse(n500, { columns: true, skip_empty_lines: true, trim: true });
      for (const r of rows) {
        const isin = String(r['ISIN Code'] || r['ISIN CODE'] || '').trim();
        const sector = String(r['Industry'] || r['INDUSTRY'] || '').trim();
        if (isin && sector) sectorMap.set(isin, sector);
      }
    } catch {}
  }
  console.log('[populate] sector map entries:', sectorMap.size);

  // 2. Full NSE EQ list
  let csv = await fetchText([
    'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
    'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
  ]);
  if (!csv) throw new Error('EQUITY_L.csv unavailable');
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);

  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  const stocks = rows
    .filter((r) => String(r['SERIES'] || '').trim().toUpperCase() === 'EQ')
    .map((r) => {
      const isin = String(r['ISIN NUMBER'] || '').trim() || null;
      return {
        symbol: String(r['SYMBOL'] || '').trim().toUpperCase(),
        name: String(r['NAME OF COMPANY'] || '').trim(),
        isin,
        sector: isin ? (sectorMap.get(isin) ?? null) : null,
      };
    })
    .filter((r) => r.symbol && r.name);

  console.log('[populate] parsed', stocks.length, 'EQ stocks');

  const insert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, sector, isin, category)
     VALUES (?, ?, 'NSE', ?, ?, 'stock')
     ON CONFLICT (symbol, exchange) DO UPDATE SET
       name   = excluded.name,
       sector = COALESCE(excluded.sector, stocks.sector),
       isin   = COALESCE(excluded.isin, stocks.isin),
       category = 'stock'`
  );

  let n = 0;
  db.exec('BEGIN');
  for (const s of stocks) {
    try { insert.run(s.symbol, s.name, s.sector, s.isin); n++; } catch {}
  }
  db.exec('COMMIT');

  // 3. Indices
  const idxInsert = db.prepare(
    `INSERT INTO stocks (symbol, name, exchange, category)
     VALUES (?, ?, 'NSE', 'index')
     ON CONFLICT (symbol, exchange) DO UPDATE SET name = excluded.name, category = 'index'`
  );
  for (const idx of TRADEABLE_INDICES) {
    try { idxInsert.run(idx.symbol, idx.name); } catch {}
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM stocks WHERE exchange='NSE'`).get();
  const idxCount = db.prepare(`SELECT COUNT(*) c FROM stocks WHERE category='index'`).get();
  console.log(`[populate] done — ${n} stocks upserted · ${total.c} total NSE rows · ${idxCount.c} indices`);
  db.close();
}

main().catch((e) => { console.error('[populate] FAILED:', e.message); process.exit(1); });
