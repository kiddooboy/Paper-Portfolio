// NYSE / NASDAQ trading-holiday calendar.
//
// Federal-holiday rules are stable, so a hard-coded ±2-year fallback covers us
// even when the optional live fetch fails. Stored in `nyse_holidays` and
// loaded into a Set for O(1) lookup. Refreshed alongside the NSE calendar.

import { db } from '../db/index.js';

const holidaySet = new Set<string>();

function loadIntoMemory(): void {
  holidaySet.clear();
  const rows = db.prepare(`SELECT date FROM nyse_holidays`).all() as { date: string }[];
  for (const r of rows) holidaySet.add(r.date);
}

/** True if the given ISO date (YYYY-MM-DD) is a NYSE/NASDAQ holiday. */
export function isNyseHolidayOn(isoDate: string): boolean {
  return holidaySet.has(isoDate);
}

export function nyseHolidayDescription(isoDate: string): string | null {
  if (!holidaySet.has(isoDate)) return null;
  const row = db.prepare(`SELECT description FROM nyse_holidays WHERE date = ?`).get(isoDate) as any;
  return row?.description || 'NYSE Trading Holiday';
}

// ── Fallback list ────────────────────────────────────────────────────────────
// Federal holidays observed by NYSE + NASDAQ. Variable-date holidays computed
// here so we cover a moving 3-year window automatically.

function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Date {
  // month0 is 0-indexed. `weekday` is 0=Sun..6=Sat.
  const first = new Date(Date.UTC(year, month0, 1));
  const firstWd = first.getUTCDay();
  const delta = (weekday - firstWd + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  return new Date(Date.UTC(year, month0, day));
}

function lastWeekdayOfMonth(year: number, month0: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const lastWd = last.getUTCDay();
  const delta = (lastWd - weekday + 7) % 7;
  return new Date(Date.UTC(year, month0, last.getUTCDate() - delta));
}

function easterSunday(year: number): Date {
  // Anonymous Gregorian (Meeus/Jones/Butcher) — exact for any year.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftIfWeekend(date: Date): Date {
  // NYSE observation rules: if a fixed-date holiday falls on Saturday, observed
  // on the prior Friday; if on Sunday, observed on the following Monday.
  const wd = date.getUTCDay();
  if (wd === 6) return new Date(date.getTime() - 86400_000);
  if (wd === 0) return new Date(date.getTime() + 86400_000);
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fallbackEntries(): { date: string; description: string }[] {
  const out: { date: string; description: string }[] = [];
  const baseYear = new Date().getUTCFullYear();
  for (let y = baseYear - 1; y <= baseYear + 2; y++) {
    // Fixed-date (with weekend-shift rule)
    out.push({ date: iso(shiftIfWeekend(new Date(Date.UTC(y, 0, 1)))),  description: "New Year's Day" });
    out.push({ date: iso(shiftIfWeekend(new Date(Date.UTC(y, 5, 19)))), description: 'Juneteenth' });
    out.push({ date: iso(shiftIfWeekend(new Date(Date.UTC(y, 6, 4)))),  description: 'Independence Day' });
    out.push({ date: iso(shiftIfWeekend(new Date(Date.UTC(y, 11, 25)))),description: 'Christmas Day' });

    // Variable-date
    out.push({ date: iso(nthWeekdayOfMonth(y, 0, 1, 3)),  description: 'Martin Luther King Jr. Day' });   // 3rd Mon Jan
    out.push({ date: iso(nthWeekdayOfMonth(y, 1, 1, 3)),  description: "Washington's Birthday" });        // 3rd Mon Feb (Presidents' Day)
    out.push({ date: iso(lastWeekdayOfMonth(y, 4, 1)),    description: 'Memorial Day' });                 // last Mon May
    out.push({ date: iso(nthWeekdayOfMonth(y, 8, 1, 1)),  description: 'Labor Day' });                    // 1st Mon Sep
    out.push({ date: iso(nthWeekdayOfMonth(y, 10, 4, 4)), description: 'Thanksgiving Day' });             // 4th Thu Nov

    // Good Friday — Easter Sunday minus 2 days
    const easter = easterSunday(y);
    out.push({ date: iso(new Date(easter.getTime() - 2 * 86400_000)), description: 'Good Friday' });
  }
  return out;
}

function seedFallback(): void {
  const entries = fallbackEntries();
  const stmt = db.prepare(
    `INSERT INTO nyse_holidays (date, description, source) VALUES (?, ?, 'fallback')
     ON CONFLICT(date) DO NOTHING`,
  );
  for (const e of entries) stmt.run(e.date, e.description);
}

/** Boot-time refresh: seed fallback, load into memory. */
export async function refreshNyseHolidays(): Promise<void> {
  try {
    seedFallback();
  } catch (e: any) {
    console.warn('[nyse] holiday seed failed:', e?.message || e);
  }
  loadIntoMemory();
  console.log(`[nyse] holidays loaded — ${holidaySet.size} dates in calendar`);
}

/** Today (UTC date suffices — we only need the calendar day, not market open). */
export function isNyseHolidayToday(): boolean {
  return holidaySet.has(new Date().toISOString().slice(0, 10));
}

/** All upcoming holidays from today, sorted ascending. */
export function getUpcomingNyseHolidays(limit = 5): { date: string; description: string }[] {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .prepare(`SELECT date, description FROM nyse_holidays WHERE date >= ? ORDER BY date ASC LIMIT ?`)
    .all(today, limit) as any[];
}
