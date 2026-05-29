import axios from 'axios';
import { useAuthStore } from './authStore';
import { usePortfolioStore } from './portfolioStore';
import { useWatchlistStore } from './watchlistStore';
import { useOrdersStore } from './ordersStore';
import { useNotificationsStore } from './notificationsStore';
import { startMarketPolling, stopMarketPolling, startMarketStream, stopMarketStream, useMarketStore } from './marketStore';

/**
 * One-stop bootstrap:
 *   1. Validate the session via /api/auth/me  (auto-logout on 401).
 *   2. Pre-fetch all user-scoped data so pages render instantly.
 *   3. Start adaptive market polling.
 *
 * Idempotent — safe to call multiple times. Re-entrant guard prevents
 * concurrent runs from racing.
 */
let inFlight: Promise<boolean> | null = null;

export async function bootstrap(): Promise<boolean> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const auth = useAuthStore.getState();

    // 1) Validate the JWT cookie and refresh user data from server
    try {
      const res = await axios.get('/api/auth/me');
      const fresh = res.data?.user;
      if (fresh) auth.login(fresh);
    } catch (err: any) {
      // 401 will trigger logout via interceptor; other errors are non-fatal.
      if (err?.response?.status !== 401) {
        console.warn('[bootstrap] /me probe failed (non-fatal):', err?.message);
      }
      return false;
    }

    // 2) Kick off all data fetches in parallel
    await Promise.allSettled([
      usePortfolioStore.getState().fetch(true),
      useWatchlistStore.getState().fetch(true),
      useOrdersStore.getState().fetch(true),
      useNotificationsStore.getState().fetch(true),
    ]);

    // 3) Start adaptive live-quote polling AND the SSE live-tick stream.
    // SSE pushes the tier1 universe in ~4s; polling stays as a safety net
    // (and supplies quotes for symbols outside the tier1 universe).
    startMarketPolling();
    startMarketStream();
    // Also kick an immediate first fetch so quotes are available straight away
    useMarketStore.getState().fetchLive();

    return true;
  })();

  try { return await inFlight; }
  finally { inFlight = null; }
}

/**
 * Stop polling and clear local data.  Called on logout.
 * (logoutCleanups in authStore already reset each store; this just stops timers.)
 */
export function teardown() {
  stopMarketPolling();
  stopMarketStream();
}

/**
 * Re-validate the session whenever the tab regains focus.  Cheap and catches
 * the case where the user came back after the laptop was asleep / token expired.
 */
let focusListenerInstalled = false;
export function installFocusRevalidation() {
  if (focusListenerInstalled) return;
  focusListenerInstalled = true;
  window.addEventListener('focus', () => {
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated) bootstrap();
  });
}
