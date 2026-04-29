import { create } from 'zustand';
import axios from 'axios';
import { registerLogoutCleanup } from './authStore';

export interface Order {
  id: number;
  user_id: number;
  symbol: string;
  type: 'MARKET' | 'LIMIT';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  limit_price?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  created_at: string;
  filled_at?: string;
}

interface OrdersState {
  orders: Order[];
  loading: boolean;
  lastFetched: number;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  reset: () => void;
}

const initialState = {
  orders: [] as Order[],
  loading: false,
  lastFetched: 0,
  error: null as string | null,
};

const STALE_MS = 3_000;

export const useOrdersStore = create<OrdersState>((set, get) => ({
  ...initialState,

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && Date.now() - lastFetched < STALE_MS) return;
    set({ loading: true, error: null });
    try {
      const res = await axios.get('/api/orders');
      const orders = Array.isArray(res.data) ? res.data : (res.data?.orders || []);
      set({ orders, lastFetched: Date.now(), loading: false });
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to load orders', loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));

registerLogoutCleanup(() => useOrdersStore.getState().reset());
