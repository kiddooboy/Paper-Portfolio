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
      set({
        quotes: res.data.quotes || {},
        status: res.data.status || null,
        lastFetched: Date.now(),
      });
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

  // 10s during market hours, 5min when closed (use server status to detect)
  const isOpen = store.status?.isOpen ?? true;
  const interval = isOpen ? 10_000 : 300_000;
  pollTimer = setTimeout(poll, interval);
}

// ── SSE: live tick push (augments polling — never replaces it) ──
// EventSource handles reconnect automatically (with Last-Event-ID where
// applicable). On any error we just let it retry; the poller above stays as
// a safety net so quotes never go fully stale.
let es: EventSource | null = null;

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
    es = new EventSource(`${base}/api/stocks/stream`, { withCredentials: true });
  } catch {
    es = null;
    return;
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

