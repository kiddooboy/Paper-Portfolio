// Auth token storage for Bearer authentication.
//
// On the website the app authenticates with an httpOnly cookie (same-origin),
// so this token is simply unused. In the wrapped Android app (Capacitor, origin
// https://localhost) the cookie can't travel cross-site to the API, so we store
// the JWT the server returns on login and send it as `Authorization: Bearer`.
//
// localStorage is private to the app's WebView on Android and persists across
// launches, which is sufficient for a paper-trading JWT. (A secure-storage
// plugin can be swapped in later without touching call sites.)

const KEY = 'pp_auth_token';

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setToken(token: string): void {
  try { if (token) localStorage.setItem(KEY, token); } catch { /* ignore */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
