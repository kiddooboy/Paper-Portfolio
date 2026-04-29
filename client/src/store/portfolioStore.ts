import { create } from 'zustand';
import axios from 'axios';
import { registerLogoutCleanup } from './authStore';

export interface Holding {
  id: number;
  symbol: string;
  quantity: number;
  avg_buy_price: number;
  current_price?: number;
  current_value?: number;
  pnl?: number;
  pnl_percent?: number;
  sector?: string;
}

export interface PortfolioSummary {
  balance: number;
  investedValue: number;
  currentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayChangeTotal?: number;
  dayChangePct?: number;
  holdings: Holding[];
  sectorAllocation?: Array<{ sector: string; value: number; percent: number }>;
  stockAllocation?: Array<{ symbol: string; value: number; percent: number }>;
  risk?: any;
  highlights?: any;
  pnlBreakdown?: any;
  tradeStats?: any;
  transactions?: any[];
}

interface PortfolioState {
  data: PortfolioSummary | null;
  loading: boolean;
  lastFetched: number;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  reset: () => void;
}

const initialState = {
  data: null as PortfolioSummary | null,
  loading: false,
  lastFetched: 0,
  error: null as string | null,
};

const STALE_MS = 5_000; // refetch only if older than 5s on rapid calls

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  ...initialState,

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && Date.now() - lastFetched < STALE_MS) return;
    set({ loading: true, error: null });
    try {
      const res = await axios.get('/api/portfolio');
      set({ data: res.data, lastFetched: Date.now(), loading: false });
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to load portfolio', loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));

// Wipe data when user logs out so next user starts clean.
registerLogoutCleanup(() => usePortfolioStore.getState().reset());
