// ── NSE F&O lot sizes (as of SEBI circular, updated quarterly) ──────────────
export const LOT_SIZES: Record<string, number> = {
  // Indices
  NIFTY:       75,
  BANKNIFTY:   30,
  FINNIFTY:    65,
  MIDCPNIFTY:  150,
  SENSEX:      10,
  BANKEX:      15,

  // Nifty 50
  RELIANCE:    250,
  HDFCBANK:    550,
  ICICIBANK:   700,
  INFY:        400,
  TCS:         175,
  KOTAKBANK:   400,
  SBIN:        1500,
  AXISBANK:    1200,
  BHARTIARTL:  950,
  LT:          175,
  BAJFINANCE:  125,
  HINDUNILVR:  300,
  ITC:         3200,
  WIPRO:       1500,
  HCLTECH:     700,
  MARUTI:      100,
  TITAN:       350,
  NTPC:        4500,
  POWERGRID:   4500,
  ONGC:        4800,
  COALINDIA:   3200,
  BPCL:        3000,
  HINDALCO:    2800,
  TATASTEEL:   5500,
  JSWSTEEL:    1350,
  GRASIM:      250,
  SUNPHARMA:   700,
  CIPLA:       650,
  DRREDDY:     125,
  DIVISLAB:    150,
  APOLLOHOSP:  125,
  BAJAJFINSV:  500,
  'BAJAJ-AUTO': 250,
  EICHERMOT:   200,
  HEROMOTOCO:  300,
  TATACONSUM:  1100,
  NESTLEIND:   50,
  BRITANNIA:   200,
  ULTRACEMCO:  100,
  ADANIENT:    500,
  ADANIPORTS:  1250,
  ASIANPAINT:  200,
  DMART:       175,

  // Banking & Finance
  INDUSINDBK:  500,
  FEDERALBNK:  10000,
  IDFCFIRSTB:  13500,
  BANDHANBNK:  3600,
  RBLBANK:     7500,
  BANKBARODA:  5850,
  PNB:         16000,
  CANBK:       8625,
  UNIONBANK:   10600,
  CHOLAFIN:    500,
  MUTHOOTFIN:  800,
  RECLTD:      3200,
  PFC:         3200,
  LICI:        700,

  // IT
  TECHM:       600,
  LTIM:        150,
  MPHASIS:     200,
  COFORGE:     150,
  PERSISTENT:  200,

  // Auto
  TATAMOTORS:  2800,
  MOTHERSON:   9500,
  MRF:         10,
  BALKRISIND:  250,
  EXIDEIND:    2750,

  // Pharma
  AUROPHARMA:  650,
  LUPIN:       500,
  TORNTPHARM:  250,
  ALKEM:       100,
  IPCALAB:     300,

  // Energy & Infra
  TATAPOWER:   4275,
  ADANIGREEN:  750,
  ADANITRANS:  400,
  SIEMENS:     275,
  ABB:         125,
  POLYCAB:     125,
  HAVELLS:     500,

  // Consumer & Retail
  DELHIVERY:   2175,
  ZOMATO:      4075,
  NAUKRI:      125,
  IRCTC:       875,
  INDIGO:      300,

  // PSU
  IRFC:        4750,
  RVNL:        2475,
  BEL:         3700,
  HAL:         175,
  BHEL:        7000,
};

// ── Base IV assumptions per symbol (annualised) ──────────────────────────────
// These approximate historical volatility. In a real platform these would be
// fetched from the options market itself.
const BASE_IV: Record<string, number> = {
  NIFTY: 0.14, BANKNIFTY: 0.18, FINNIFTY: 0.16, MIDCPNIFTY: 0.20,
  MRF: 0.22,   NESTLEIND: 0.18, TCS: 0.20, INFY: 0.22, HCLTECH: 0.23,
  WIPRO: 0.25, TECHM: 0.26,
};
const DEFAULT_IV_LARGE = 0.28;
const DEFAULT_IV_MID   = 0.35;

export function getBaseIV(symbol: string): number {
  if (BASE_IV[symbol]) return BASE_IV[symbol];
  const lot = LOT_SIZES[symbol] ?? 0;
  return lot >= 1000 ? DEFAULT_IV_MID : DEFAULT_IV_LARGE;
}

// ── Strike interval per underlying price ────────────────────────────────────
export function getStrikeInterval(symbol: string, price: number): number {
  if (symbol === 'NIFTY') return 50;
  if (symbol === 'BANKNIFTY') return 100;
  if (symbol === 'FINNIFTY') return 50;
  if (symbol === 'MIDCPNIFTY') return 25;
  if (symbol === 'SENSEX') return 100;

  if (price < 100)   return 2.5;
  if (price < 250)   return 5;
  if (price < 500)   return 10;
  if (price < 1000)  return 20;
  if (price < 2500)  return 50;
  if (price < 5000)  return 100;
  if (price < 10000) return 200;
  return 500;
}

// ── NSE expiry date calculation ─────────────────────────────────────────────
// Monthly: last Thursday of each calendar month
function lastThursdayOf(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const dow = lastDay.getUTCDay(); // 0=Sun, 4=Thu
  const back = (dow - 4 + 7) % 7;
  return new Date(Date.UTC(year, month, lastDay.getUTCDate() - back));
}

export function getMonthlyExpiries(count = 3): Date[] {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600000);
  const expiries: Date[] = [];
  let y = istNow.getUTCFullYear();
  let m = istNow.getUTCMonth();

  while (expiries.length < count) {
    const exp = lastThursdayOf(y, m);
    // Use 3:30 PM IST cutoff on expiry day
    const expCutoff = new Date(exp.getTime() + (9 * 60 + 45) * 60000); // 3:30 PM IST = exp + 9h45m since exp is midnight UTC
    if (istNow <= expCutoff) expiries.push(exp);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return expiries;
}

// Weekly: every Thursday (for NIFTY/BANKNIFTY/FINNIFTY)
export function getWeeklyExpiries(count = 8): Date[] {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600000);
  const expiries: Date[] = [];

  // Find current/next Thursday in IST
  const dow = istNow.getUTCDay();
  let daysToThursday = (4 - dow + 7) % 7;
  // If today is Thursday but past 3:30 PM IST, move to next week
  if (daysToThursday === 0) {
    const istHour = istNow.getUTCHours();
    const istMin = istNow.getUTCMinutes();
    if (istHour > 10 || (istHour === 10 && istMin >= 0)) daysToThursday = 7; // 3:30 PM IST = 10:00 UTC
  }

  const d = new Date(istNow);
  d.setUTCDate(d.getUTCDate() + daysToThursday);
  d.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    expiries.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return expiries;
}

// Index symbols that have weekly options
export const WEEKLY_EXPIRY_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']);

export function getExpiriesForSymbol(symbol: string, count = 3): Date[] {
  if (WEEKLY_EXPIRY_SYMBOLS.has(symbol)) return getWeeklyExpiries(count + 2).slice(0, count + 2);
  return getMonthlyExpiries(count);
}

export function formatExpiry(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function timeToExpiryYears(expiryDate: string): number {
  const now = new Date();
  const exp = new Date(expiryDate + 'T10:00:00Z'); // 3:30 PM IST = 10:00 UTC
  const ms = exp.getTime() - now.getTime();
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
}

// ── Stable seed for OI/Volume simulation ─────────────────────────────────────
export function chainSeed(symbol: string, expiryDate: string): number {
  let h = 0;
  const s = symbol + expiryDate;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}
