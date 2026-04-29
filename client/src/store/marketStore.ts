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

export interface MarketStatus {
  isOpen: boolean;
  label: string;
  ist: string;
  nextOpen: string | null;
  pollIntervalMs: number;
}

interface MarketState {
  quotes: Record<string, LiveQuote>;
  status: MarketStatus | null;
  lastFetched: number;
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
