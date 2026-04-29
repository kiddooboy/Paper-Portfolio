import { create } from 'zustand';
import axios from 'axios';
import { registerLogoutCleanup } from './authStore';

export interface WatchlistItem {
  id: number;
  symbol: string;
  added_at: string;
}

export interface Watchlist {
  id: number;
  user_id: number;
  name: string;
  items: WatchlistItem[];
  created_at: string;
  updated_at?: string;
}

interface WatchlistState {
  watchlists: Watchlist[];
  loading: boolean;
  lastFetched: number;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  isInWatchlist: (symbol: string) => boolean;
  reset: () => void;
}

const initialState = {
  watchlists: [] as Watchlist[],
  loading: false,
  lastFetched: 0,
  error: null as string | null,
};

const STALE_MS = 5_000;

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  ...initialState,

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && Date.now() - lastFetched < STALE_MS) return;
    set({ loading: true, error: null });
    try {
      const res = await axios.get('/api/watchlists');
      const watchlists = Array.isArray(res.data) ? res.data : (res.data?.watchlists || []);
      set({ watchlists, lastFetched: Date.now(), loading: false });
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to load watchlists', loading: false });
    }
  },

  isInWatchlist: (symbol) => {
    const upper = symbol.toUpperCase();
    return get().watchlists.some((w) =>
      w.items?.some((i) => i.symbol.toUpperCase() === upper)
    );
  },

  reset: () => set({ ...initialState }),
}));

registerLogoutCleanup(() => useWatchlistStore.getState().reset());
