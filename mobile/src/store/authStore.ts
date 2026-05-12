import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from '../lib/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  balance: number;
  has_mpin?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateBalance: (balance: number) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        setAuthToken(token);
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        setAuthToken(null);
        set({ user: null, token: null, isAuthenticated: false });
      },

      updateBalance: (balance) =>
        set((s) => ({ user: s.user ? { ...s.user, balance } : null })),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.token) setAuthToken(state.token);
      },
    }
  )
);
