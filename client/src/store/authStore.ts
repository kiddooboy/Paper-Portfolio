import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  balance: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateBalance: (balance: number) => void;
  setUser: (user: User) => void;
  loginMpin: (email: string, mpin: string) => Promise<void>;
  setMpin: (mpin: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => {
        set({ token, user, isAuthenticated: true });
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Remember the device has a registered user, even after logout
        try { localStorage.setItem('last_email', user.email); } catch {}
      },
      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
        delete axios.defaults.headers.common['Authorization'];
      },
      updateBalance: (balance) => set((state) => ({
        user: state.user ? { ...state.user, balance } : null,
      })),
      setUser: (user) => set({ user }),
      loginMpin: async (email, mpin) => {
        try {
          const res = await axios.post('/api/auth/login-mpin', { email, mpin });
          const { token, user } = res.data;
          set({ token, user, isAuthenticated: true });
          localStorage.setItem('token', token);
          try { localStorage.setItem('last_email', user.email); } catch {}
        } catch (err: any) {
          throw new Error(err?.response?.data?.error || 'MPIN login failed');
        }
      },
      setMpin: async (mpin) => {
        try {
          await axios.post('/api/auth/set-mpin', { mpin });
        } catch (err: any) {
          throw new Error(err?.response?.data?.error || 'Failed to set MPIN');
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // On page load, restore axios header from the rehydrated token
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
          // Make sure auth flag matches token presence
          if (!state.isAuthenticated && state.user) state.isAuthenticated = true;
        }
      },
    }
  )
);

// Initialize axios headers if token exists
let storedToken;
try {
  storedToken = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token;
} catch {}
if (storedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
}

// Auto-logout on any 401 so stale/expired tokens don't poison the UI.
// Skip /api/auth endpoints so login/register 401s surface to the form.
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    const url: string | undefined = err?.config?.url;
    const isAuthCall = typeof url === 'string' && url.includes('/api/auth/');
    if (err?.response?.status === 401 && !isAuthCall) {
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        state.logout();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);
