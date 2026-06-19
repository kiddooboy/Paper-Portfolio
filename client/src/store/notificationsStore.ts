import { create } from 'zustand';
import axios from 'axios';
import { registerLogoutCleanup } from './authStore';

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'order' | 'price_alert' | 'system';
  read: boolean;
  created_at: string;
  campaign_id?: number | null;
}

interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  lastFetched: number;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  reset: () => void;
}

const initialState = {
  items: [] as Notification[],
  unreadCount: 0,
  loading: false,
  lastFetched: 0,
  error: null as string | null,
};

const STALE_MS = 5_000;

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  ...initialState,

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && Date.now() - lastFetched < STALE_MS) return;
    set({ loading: true, error: null });
    try {
      const res = await axios.get('/api/notifications');
      const items: Notification[] = Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
      const unreadCount = items.filter((n) => !n.read).length;
      set({ items, unreadCount, lastFetched: Date.now(), loading: false });
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to load notifications', loading: false });
    }
  },

  markRead: async (id: number) => {
    try {
      await axios.post(`/api/notifications/${id}/read`);
      set((state) => {
        const items = state.items.map((n) => (n.id === id ? { ...n, read: true } : n));
        const unreadCount = items.filter((n) => !n.read).length;
        return { items, unreadCount };
      });
    } catch {}
  },

  reset: () => set({ ...initialState }),
}));

registerLogoutCleanup(() => useNotificationsStore.getState().reset());
