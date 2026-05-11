import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatPercent(num: number): string {
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export function formatCompact(num: number): string {
  if (num >= 1e7) return (num / 1e7).toFixed(2) + ' Cr';
  if (num >= 1e5) return (num / 1e5).toFixed(2) + ' L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + ' K';
  return num.toString();
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
