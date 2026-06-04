import { create } from 'zustand';
import axios from 'axios';

export interface LiveQuote {
  symbol: string;
  exchange: string;
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
  day_high: number;
  day_low: number;
  volume: number;
  market_cap?: number;
  pe_ratio?: number;
  high_52w?: number;
  low_52w?: number;
  name?: string;
}

export interface PollerHealth {
  lastPollOkAt: number | null;
  lastPollErrorAt: number | null;
  secondsSinceOk: number | null;
  consecutiveFailures: number;
  circuitOpen: boolean;
  lastError: string | null;
}

export interface MarketStatus {
  isOpen: boolean;
  label: string;
  ist: string;
  nextOpen: string | null;
  pollIntervalMs: number;
  poller?: PollerHealth;
  holiday?: { date: string; description: string } | null;
}

interface MarketState {
  quotes: Record<string, LiveQuote>;
  status: MarketStatus | null;
  lastFetched: number;
  // Wall-clock ms of the last SSE 'tick' or 'snapshot' merge — distinct from
  // lastFetched (HTTP poll) so the UI can prefer the fresher of the two.
  lastTickAt: number;
  streamConnected: boolean;
  loading: boolean;
  extraSymbols: string[];
  addSymbols: (symbols: string[]) => void;
  fetchLive: () => Promise<void>;
  getQuote: (symbol: string) => LiveQuote | undefined;
  reset: () => void;
}

const initialMarketState = {
  quotes: {} as Record<string, LiveQuote>,
  status: null as MarketStatus | null,
  lastFetched: 0,
  lastTickAt: 0,
  streamConnected: false,
  loading: false,
  extraSymbols: [] as string[],
};

export const useMarketStore = create<MarketState>((set, get) => ({
  ...initialMarketState,

  addSymbols: (symbols) => {
    const current = get().extraSymbols;
    const newSet = new Set([...current, ...symbols.map(s => s.toUpperCase())]);
    if (newSet.size !== current.length) {
      set({ extraSymbols: Array.from(newSet) });
    }
  },

  fetchLive: async () => {
    const state = get();
    if (state.loading) return;
    set({ loading: true });
    try {
      const extra = state.extraSymbols.join(',');
      const res = await axios.get('/api/stocks/live', {
        params: extra ? { symbols: extra } : undefined,
      });
      // MERGE the polled response into the existing map instead of replacing.
      // /api/stocks/live only returns NSE quotes; replacing the whole map on
      // every 10 s tick wiped any US quotes the SSE stream had populated, so
      // AAPL/MSFT/NVDA appeared to "vanish" between US tier-1 ticks (every
      // 2 min when US is closed).
      const incoming: Record<string, LiveQuote> = res.data.quotes || {};
      set((s) => ({
        quotes: { ...s.quotes, ...incoming },
        status: res.data.status || s.status,
        lastFetched: Date.now(),
      }));
    } catch {
      // Silent fail — keep stale data
    } finally {
      set({ loading: false });
    }
  },

  getQuote: (symbol) => get().quotes[symbol.toUpperCase()],

  // Clear all market data on logout to prevent leakage between user sessions
  reset: () => set({ ...initialMarketState }),
}));

// ── Adaptive polling manager ──
// Polls /api/stocks/live every 10s during market hours, every 5min when closed.
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isPolling = false;

export function startMarketPolling() {
  if (isPolling) return;
  isPolling = true;
  poll();
}

export function stopMarketPolling() {
  isPolling = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

async function poll() {
  if (!isPolling) return;
  const store = useMarketStore.getState();
  await store.fetchLive();

  // 4s during market hours (using server's recommended pollIntervalMs), 30min when closed.
  // The 30-min cadence is just enough to detect the transition back to open without continuously
  // refreshing prices that haven't changed since the close — the Top Gainers
  // / Top Losers / Most Active / Watchlist widgets visibly freeze.
  const isOpen = store.status?.isOpen ?? true;
  const interval = isOpen ? (store.status?.pollIntervalMs ?? 4_000) : 1_800_000;
  pollTimer = setTimeout(poll, interval);
}

// ── SSE: live tick push (augments polling — never replaces it) ──
// EventSource handles reconnect automatically (with Last-Event-ID where
// applicable). On any error we just let it retry; the poller above stays as
// a safety net so quotes never go fully stale.
let es: EventSource | null = null;
let subscribeTimer: ReturnType<typeof setInterval> | null = null;

// Stable session id (one per tab) — lets the server fold this tab's currently
// visible symbols into tier1's polling universe so they push back at 4s.
const SESSION_ID = (() => {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
})();

async function pushSessionSymbols() {
  const symbols = useMarketStore.getState().extraSymbols;
  // Always push — even an empty list — so the server can clean up when the
  // user navigates away from a stock-detail page.
  try {
    await axios.post('/api/stocks/subscribe', { sid: SESSION_ID, symbols });
  } catch { /* server may be temporarily unreachable; next tick will retry */ }
}

function mergeQuotesArray(arr: any[]) {
  if (!Array.isArray(arr) || !arr.length) return;
  useMarketStore.setState((s) => {
    const next = { ...s.quotes };
    for (const q of arr) {
      if (!q?.symbol) continue;
      next[String(q.symbol).toUpperCase()] = q as LiveQuote;
    }
    return { quotes: next, lastTickAt: Date.now() };
  });
}

export function startMarketStream() {
  if (es) return;
  // Use import.meta.env so the wrapped app (VITE_API_URL=https://paperportfolio.in)
  // and the website (relative /api on same origin) both work without changes.
  const base = (import.meta as any).env?.VITE_API_URL || '';
  try {
    es = new EventSource(`${base}/api/stocks/stream?sid=${encodeURIComponent(SESSION_ID)}`, { withCredentials: true });
  } catch {
    es = null;
    return;
  }
  // Push current visible symbols every 15s so the server's tier1 poll picks
  // them up. First push happens immediately on connect.
  if (!subscribeTimer) {
    pushSessionSymbols();
    subscribeTimer = setInterval(pushSessionSymbols, 15_000);
  }
  es.addEventListener('open', () => useMarketStore.setState({ streamConnected: true }));
  es.addEventListener('snapshot', (e) => {
    try { mergeQuotesArray(JSON.parse((e as MessageEvent).data)); } catch {}
  });
  es.addEventListener('tick', (e) => {
    try { mergeQuotesArray(JSON.parse((e as MessageEvent).data)); } catch {}
  });
  es.addEventListener('error', () => {
    // EventSource auto-reconnects; just reflect state for the UI.
    useMarketStore.setState({ streamConnected: false });
  });
}

export function stopMarketStream() {
  if (es) { try { es.close(); } catch {} es = null; }
  if (subscribeTimer) { clearInterval(subscribeTimer); subscribeTimer = null; }
  useMarketStore.setState({ streamConnected: false });
}

// Start the SSE stream alongside the existing poller. Calling startMarketPolling
// already kicks off the (untouched) poll loop; we add the stream here without
// touching its scheduling.
const _origStartPolling = startMarketPolling;
export function startMarketRealtime() {
  _origStartPolling();
  startMarketStream();
}

