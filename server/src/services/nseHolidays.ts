// NSE trading-holiday calendar — keeps the market clock honest.
//
// On startup we seed a small fallback list of fixed-date holidays
// (Republic Day, May Day, Independence Day, Gandhi Jayanti, Christmas) so the
// feature works offline. Then we attempt to fetch NSE's official holiday-master
// (it needs a cookie session — we bootstrap one from nseindia.com), persist any
// new dates to `nse_holidays`, and keep an in-memory Set for O(1) lookups by
// `isMarketOpen()`. Refreshed on boot and every morning at 6 AM IST.

import { db } from '../db/index.js';

// Local IST helper (avoids a marketData ↔ nseHolidays import cycle).
function getISTDate(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

const HOLIDAY_URL = 'https://www.nseindia.com/api/holiday-master?type=trading';
const BOOTSTRAP_URL = 'https://www.nseindia.com/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0 Safari/537.36';

// ── In-memory cache ────────────────────────────────────────────────────────
const holidaySet = new Set<string>();

function loadIntoMemory() {
  holidaySet.clear();
  const rows = db.prepare(`SELECT date FROM nse_holidays`).all() as { date: string }[];
  for (const r of rows) holidaySet.add(r.date);
}

/** `YYYY-MM-DD` in IST. */
function istToday(): string {
  return getISTDate().toISOString().slice(0, 10);
}

/** True if today (IST) is a registered NSE trading holiday. */
export function isHolidayToday(): boolean {
  return holidaySet.has(istToday());
}

/** Description for a given ISO date, or null. */
export function holidayDescription(isoDate: string): string | null {
  if (!holidaySet.has(isoDate)) return null;
  const row = db.prepare(`SELECT description FROM nse_holidays WHERE date = ?`).get(isoDate) as any;
  return row?.description || 'NSE Trading Holiday';
}

// ── Fallback list (fixed-date national holidays NSE always observes) ───────
// Used as a safety net when the live NSE fetch fails. Generates +/- 2 years
// around today so we cover this FY and the next without manual updates.
function fallbackEntries(): { date: string; description: string }[] {
  const out: { date: string; description: string }[] = [];
  const ist = getISTDate();
  const baseYear = ist.getFullYear();
  for (let y = baseYear - 1; y <= baseYear + 2; y++) {
    out.push(
      { date: `${y}-01-26`, description: 'Republic Day' },
      { date: `${y}-05-01`, description: 'Maharashtra Day / Labour Day' },
      { date: `${y}-08-15`, description: 'Independence Day' },
      { date: `${y}-10-02`, description: 'Mahatma Gandhi Jayanti' },
      { date: `${y}-12-25`, description: 'Christmas' },
    );
  }
  return out;
}

function upsertHoliday(date: string, description: string, source: 'nse' | 'fallback') {
  // ISO sanity: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  // Don't downgrade a row sourced from NSE back to "fallback".
  const existing = db.prepare(`SELECT source FROM nse_holidays WHERE date = ?`).get(date) as any;
  if (existing?.source === 'nse' && source === 'fallback') return;
  db.prepare(`
    INSERT INTO nse_holidays (date, description, source, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      description = excluded.description,
      source      = excluded.source,
      updated_at  = excluded.updated_at
  `).run(date, description, source);
}

// ── Live fetch from NSE ────────────────────────────────────────────────────
// NSE's API requires a cookie session bootstrapped from the home page.
function cookieHeader(setCookies: string[] | undefined): string {
  if (!setCookies || !setCookies.length) return '';
  return setCookies.map(c => c.split(';')[0]).join('; ');
}

function parseNseDate(s: string): string | null {
  // NSE returns dates like "26-Jan-2026". Convert to YYYY-MM-DD.
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const mo = months[m[2].slice(0, 3).replace(/^./, c => c.toUpperCase()) as string];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
}

async function fetchFromNse(): Promise<{ date: string; description: string }[]> {
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.nseindia.com/resources/exchange-communication-holidays',
  };
  // Bootstrap cookies
  const boot = await fetch(BOOTSTRAP_URL, { headers });
  const cookies = cookieHeader((boot.headers as any).getSetCookie?.() ?? boot.headers.get('set-cookie')?.split(', '));
  // Holiday master
  const res = await fetch(HOLIDAY_URL, { headers: { ...headers, Cookie: cookies } });
  if (!res.ok) throw new Error(`NSE holiday-master HTTP ${res.status}`);
  const data: any = await res.json();
  // Equity segment lives under "CM"
  const list: any[] = data?.CM || data?.cm || [];
  const out: { date: string; description: string }[] = [];
  for (const row of list) {
    const iso = parseNseDate(row.tradingDate || row.holidayDate || '');
    if (!iso) continue;
    out.push({ date: iso, description: String(row.description || row.holidayName || 'NSE Trading Holiday') });
  }
  return out;
}

// ── Public refresh ─────────────────────────────────────────────────────────
let refreshing = false;

export async function refreshNseHolidays(): Promise<{ added: number; source: 'nse' | 'fallback' }> {
  if (refreshing) return { added: 0, source: 'fallback' };
  refreshing = true;
  try {
    let source: 'nse' | 'fallback' = 'fallback';
    let entries: { date: string; description: string }[] = [];
    try {
      entries = await fetchFromNse();
      if (entries.length) source = 'nse';
    } catch (err) {
      console.warn('[nseHolidays] live fetch failed, using fallback:', (err as Error)?.message || err);
    }
    // Always also upsert the fixed-date fallbacks so essentials are never missing.
    for (const e of fallbackEntries()) upsertHoliday(e.date, e.description, 'fallback');
    for (const e of entries) upsertHoliday(e.date, e.description, 'nse');
    loadIntoMemory();
    console.log(`[nseHolidays] refreshed: ${holidaySet.size} dates cached (source: ${source})`);
    return { added: entries.length, source };
  } finally {
    refreshing = false;
  }
}

/** Returns sorted upcoming holidays (for surfacing in the UI / market status). */
export function getUpcomingHolidays(limit = 10): { date: string; description: string }[] {
  const today = istToday();
  return db.prepare(
    `SELECT date, description FROM nse_holidays WHERE date >= ? ORDER BY date ASC LIMIT ?`,
  ).all(today, limit) as any[];
}

// Initial load from whatever's in the DB so isHolidayToday() works immediately
// even before the first network refresh succeeds.
try { loadIntoMemory(); } catch { /* table may not exist yet on first boot — refreshNseHolidays will seed */ }
