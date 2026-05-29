// Tiny in-memory SSE broadcaster for live quote pushes.
//
// Deliberately additive: this module never touches the existing cache or
// polling. The tier1 poller calls broadcast() *after* its own work; that's
// the only integration point. If nothing is subscribed, broadcast is a no-op.
// If every subscriber disconnects, the heartbeat timer is cleared so there
// is zero background cost.

import type { Response } from 'express';
import type { Quote } from './marketData.js';

const subscribers = new Set<Response>();
let heartbeat: NodeJS.Timeout | null = null;

// ── Per-session dynamic-symbol subscriptions ──
// When a client opens a page that displays symbols outside the static tier1
// universe (Stock Detail, paginated Market Explorer, etc.) it POSTs them to
// /api/stocks/subscribe with its session id. The tier1 poller picks up the
// union of all session subscriptions on each cycle, so anything the user can
// currently see ticks at 4s without needing any page-level changes.
interface Session { res: Response | null; symbols: Set<string> }
const sessions = new Map<string, Session>();
// Hard cap on the *total* dynamic-subscription pool across all sessions
// (separate from per-session caps) so a flood of clients can't blow tier1.
const DYNAMIC_TOTAL_CAP = 200;

// SSE comment lines every 15s — keeps idle connections alive through proxies
// (nginx default proxy_read_timeout is 60s).
function ensureHeartbeat(): void {
  if (heartbeat || subscribers.size === 0) return;
  heartbeat = setInterval(() => {
    for (const res of subscribers) {
      try { res.write(': ka\n\n'); } catch { /* will be reaped on close */ }
    }
  }, 15_000);
}

function maybeStopHeartbeat(): void {
  if (subscribers.size === 0 && heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

export function subscribe(res: Response): () => void {
  subscribers.add(res);
  ensureHeartbeat();
  return () => {
    subscribers.delete(res);
    maybeStopHeartbeat();
  };
}

export function broadcast(quotes: Quote[]): void {
  if (subscribers.size === 0 || !quotes.length) return;
  const payload = `event: tick\ndata: ${JSON.stringify(quotes)}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch { /* socket closed; close handler will unsubscribe */ }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}

// ── Session-aware subscribe (used by SSE clients passing ?sid=) ──
export function subscribeWithSession(sid: string, res: Response): () => void {
  subscribers.add(res);
  ensureHeartbeat();
  const existing = sessions.get(sid);
  sessions.set(sid, { res, symbols: existing?.symbols ?? new Set() });
  return () => {
    subscribers.delete(res);
    // Keep the symbols around for a short reconnect window? Simpler: drop now.
    sessions.delete(sid);
    maybeStopHeartbeat();
  };
}

/** Replace the symbol set for a session. Returns the number of symbols stored. */
export function setSessionSymbols(sid: string, symbols: string[]): number {
  const clean = symbols.map((s) => String(s).toUpperCase()).filter((s) => /^[A-Z0-9.\-&]{1,20}$/.test(s));
  // Per-session cap (defends against a single misbehaving client).
  const capped = clean.slice(0, 80);
  // Auto-create on first subscribe call even if SSE hasn't connected yet.
  const existing = sessions.get(sid);
  sessions.set(sid, { res: existing?.res ?? null, symbols: new Set(capped) });
  return capped.length;
}

/** Union of all session symbol sets, capped at DYNAMIC_TOTAL_CAP. */
export function getDynamicSymbols(): string[] {
  const out = new Set<string>();
  for (const sess of sessions.values()) {
    for (const s of sess.symbols) {
      if (out.size >= DYNAMIC_TOTAL_CAP) return Array.from(out);
      out.add(s);
    }
  }
  return Array.from(out);
}

export function sessionCount(): number { return sessions.size; }
