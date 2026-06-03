// Region registry — the single source of truth for "which market are we
// trading on right now and what rules apply."
//
// A Region bundles:
//   - currency (₹ / $)
//   - timezone (IANA) — used by Intl.DateTimeFormat for DST-aware market hours
//   - openHM / closeHM — market open/close in that timezone's wall-clock
//   - holidayFn — region-specific trading-holiday lookup
//   - yahooSymbol() — turns app-symbol into Yahoo-Finance ticker
//
// Every place that used to hard-code `'NSE'` should now look up a region via
// `regionFor(exchange)`. The IN region wraps the existing Groww-Indian logic
// verbatim so India trading is byte-for-byte unchanged.

import { isHolidayToday as isNseHolidayToday, holidayDescription as nseHolidayDescription } from './nseHolidays.js';
import { isNyseHolidayOn, nyseHolidayDescription } from './nyseHolidays.js';

export type RegionCode = 'IN' | 'US';
export type Exchange = 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';

export interface Region {
  code: RegionCode;
  currency: 'INR' | 'USD';
  currencySymbol: '₹' | '$';
  timezone: string;             // IANA, e.g. 'Asia/Kolkata' or 'America/New_York'
  openHM: [number, number];     // wall-clock open in `timezone`
  closeHM: [number, number];    // wall-clock close in `timezone`
  exchanges: Exchange[];
  yahooSymbol(symbol: string): string;
  isHolidayOn(isoDate: string): boolean;
  holidayDescription(isoDate: string): string | null;
}

// ── India ────────────────────────────────────────────────────────────────────
const IN: Region = {
  code: 'IN',
  currency: 'INR',
  currencySymbol: '₹',
  timezone: 'Asia/Kolkata',
  openHM: [9, 15],
  closeHM: [15, 30],
  exchanges: ['NSE', 'BSE'],
  yahooSymbol(symbol) {
    const up = symbol.toUpperCase();
    if (up.startsWith('^')) return up;
    return `${up}.NS`; // default NSE — BSE callers should append `.BO` themselves
  },
  isHolidayOn(isoDate) {
    // For "today", the in-memory set is authoritative; for any other date we
    // delegate to the description lookup (returns null when not a holiday).
    return nseHolidayDescription(isoDate) != null;
  },
  holidayDescription(isoDate) {
    return nseHolidayDescription(isoDate);
  },
};

// ── United States ────────────────────────────────────────────────────────────
const US: Region = {
  code: 'US',
  currency: 'USD',
  currencySymbol: '$',
  timezone: 'America/New_York',
  openHM: [9, 30],
  closeHM: [16, 0],
  exchanges: ['NASDAQ', 'NYSE'],
  yahooSymbol(symbol) {
    // US tickers are bare on Yahoo: AAPL, MSFT, ^GSPC, ^IXIC, etc.
    return symbol.toUpperCase();
  },
  isHolidayOn(isoDate) {
    return isNyseHolidayOn(isoDate);
  },
  holidayDescription(isoDate) {
    return nyseHolidayDescription(isoDate);
  },
};

export const REGIONS: Record<RegionCode, Region> = { IN, US };

/** Map an exchange to its region. Unknown exchanges default to IN. */
export function regionFor(exchange?: string | null): Region {
  const up = (exchange || '').toUpperCase();
  if (up === 'NASDAQ' || up === 'NYSE') return US;
  return IN;
}

/** All known US exchange codes. */
export const US_EXCHANGES: Exchange[] = ['NASDAQ', 'NYSE'];
export const IN_EXCHANGES: Exchange[] = ['NSE', 'BSE'];

// ── Market-hours math (DST-aware via Intl.DateTimeFormat) ────────────────────
//
// We avoid pulling in luxon/date-fns-tz. Native Intl gives us correct EST↔EDT
// transitions for free. The trick: ask Intl to format `now` *as if in* the
// region's timezone, parse the wall-clock back, and compare against open/close.

function wallClockInTz(date: Date, timezone: string): { y: number; m: number; d: number; h: number; min: number; weekday: number; isoDate: string } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const o: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  const y = Number(o.year);
  const m = Number(o.month);
  const d = Number(o.day);
  let h = Number(o.hour);
  // `en-US` hour12:false sometimes returns "24" for midnight — normalize.
  if (h === 24) h = 0;
  const min = Number(o.minute);
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday as string] ?? 0;
  const isoDate = `${o.year}-${o.month}-${o.day}`;
  return { y, m, d, h, min, weekday: wd, isoDate };
}

/** Is `region` currently in its regular trading session (open, weekday, not a holiday)? */
export function isRegionOpen(region: Region, now: Date = new Date()): boolean {
  // Test bypass for the AI-Trade sandbox stays compatible with India only.
  if (region.code === 'IN' && process.env.BYPASS_MARKET_HOURS === 'true') return true;
  const wc = wallClockInTz(now, region.timezone);
  if (wc.weekday === 0 || wc.weekday === 6) return false;
  if (region.isHolidayOn(wc.isoDate)) return false;
  const minutes = wc.h * 60 + wc.min;
  const open = region.openHM[0] * 60 + region.openHM[1];
  const close = region.closeHM[0] * 60 + region.closeHM[1];
  return minutes >= open && minutes <= close;
}

/** Status label appropriate for the region's wall-clock right now. */
export function regionStatusLabel(region: Region, now: Date = new Date()): string {
  const wc = wallClockInTz(now, region.timezone);
  if (isRegionOpen(region, now)) return 'Open';
  if (region.isHolidayOn(wc.isoDate)) return 'Holiday';
  if (wc.weekday === 0 || wc.weekday === 6) return 'Closed';
  const minutes = wc.h * 60 + wc.min;
  const open = region.openHM[0] * 60 + region.openHM[1];
  const close = region.closeHM[0] * 60 + region.closeHM[1];
  if (minutes < open) return 'Pre-market';
  if (minutes > close) return 'After hours';
  return 'Closed';
}
