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
