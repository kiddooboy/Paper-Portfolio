import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  hydrated: boolean; // true once persist rehydration has finished
  login: (token: string, user: User) => void;
  logout: () => void;
  updateBalance: (balance: number) => void;
  setUser: (user: User) => void;
  loginMpin: (email: string, mpin: string) => Promise<void>;
  setMpin: (mpin: string) => Promise<void>;
  setHydrated: () => void;
}

// Registry of "reset on logout" callbacks from other stores.
// Other stores call registerLogoutCleanup(() => store.reset()) at module load.
type Cleanup = () => void;
const logoutCleanups: Cleanup[] = [];
export function registerLogoutCleanup(fn: Cleanup) {
  logoutCleanups.push(fn);
}

function runLogoutCleanups() {
  for (const fn of logoutCleanups) {
    try { fn(); } catch (err) { console.warn('[auth] cleanup failed:', err); }
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      hydrated: false,
      login: (token, user) => {
        set({ token, user, isAuthenticated: true });
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Remember the device has a registered user, even after logout
        try { localStorage.setItem('last_email', user.email); } catch {}
      },
      logout: () => {
        // Run all registered cleanup callbacks BEFORE wiping auth state
        // so that other stores can clean up while still authenticated context exists.
        runLogoutCleanups();
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
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
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
        // Mark hydrated so App.tsx can run bootstrap exactly once.
        state?.setHydrated?.();
      },
    }
  )
);

// Initialize axios headers if token exists
let storedToken;
try {
  storedToken = JSON.parse(sessionStorage.getItem('auth-storage') || '{}')?.state?.token;
} catch {}
if (storedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
}

// ─────────────────────────────────────────────────────────────────
// Smart 401 interceptor.
//
// Old behaviour: ANY 401 → instant logout. Too aggressive: a single
// transient backend hiccup would log the user out, forcing them to
// re-enter credentials on every fetch failure.
//
// New behaviour: only logout if /api/auth/me returns 401 (the canonical
// "is my token still valid?" probe used by bootstrap). For other endpoints,
// surface the 401 to the caller without nuking the session.  Bootstrap
// re-validates the session via /me on every app load and on focus, so an
// expired token is still caught — just gracefully.
// ─────────────────────────────────────────────────────────────────
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    const url: string | undefined = err?.config?.url;
    const is401 = err?.response?.status === 401;
    const isMeProbe = typeof url === 'string' && url.endsWith('/api/auth/me');
    if (is401 && isMeProbe) {
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
