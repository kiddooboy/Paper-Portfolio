import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Ccy = 'INR' | 'USD';

interface FmtOpts {
  currency?: Ccy;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function formatCurrency(amount: number, opts: FmtOpts = {}): string {
  const currency = opts.currency || 'INR';
  const locale = opts.locale || (currency === 'USD' ? 'en-US' : 'en-IN');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  }).format(amount);
}

export function formatNumber(num: number, opts: FmtOpts = {}): string {
  const locale = opts.locale || ((opts.currency || 'INR') === 'USD' ? 'en-US' : 'en-IN');
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  }).format(num);
}

export function formatPercent(num: number): string {
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export function formatCompact(num: number, currency: Ccy = 'INR'): string {
  if (currency === 'USD') {
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9)  return '$' + (num / 1e9).toFixed(2)  + 'B';
    if (num >= 1e6)  return '$' + (num / 1e6).toFixed(2)  + 'M';
    if (num >= 1e3)  return '$' + (num / 1e3).toFixed(2)  + 'K';
    return '$' + num.toFixed(2);
  }
  if (num >= 1e7) return (num / 1e7).toFixed(2) + ' Cr';
  if (num >= 1e5) return (num / 1e5).toFixed(2) + ' L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + ' K';
  return num.toString();
}

/**
 * Render the "primary + secondary" price pattern used across the Global
 * Markets section. Prefers `prefer` for the primary line; the other currency
 * is rendered as a smaller secondary chip.
 *
 * Example: formatPriceDual(192.43, 83.20, 'USD') →
 *   { primary: '$192.43', secondary: '≈ ₹16,015.18' }
 */
export function formatPriceDual(
  usdPrice: number,
  fxRate: number,
  prefer: Ccy = 'INR',
): { primary: string; secondary: string } {
  const inr = usdPrice * fxRate;
  const usdStr = formatCurrency(usdPrice, { currency: 'USD' });
  const inrStr = formatCurrency(inr, { currency: 'INR' });
  return prefer === 'USD'
    ? { primary: usdStr, secondary: `≈ ${inrStr}` }
    : { primary: inrStr, secondary: `≈ ${usdStr}` };
}

// SQLite stores datetime('now') as "YYYY-MM-DD HH:MM:SS" in UTC with no timezone
// marker. Appending 'Z' before passing to Date() forces correct UTC parsing so
// toLocaleString() displays the right IST time (UTC+5:30).
export function parseDbDate(s: string): Date {
  if (!s) return new Date(NaN);
  // Already has timezone info — parse as-is
  if (s.endsWith('Z') || s.includes('+')) return new Date(s);
  // SQLite format "YYYY-MM-DD HH:MM:SS" — treat as UTC
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function formatDbDate(s: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDbDate(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...opts,
  });
}
