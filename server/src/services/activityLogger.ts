import { db } from '../db/index.js';

// ────────────────────────────────────────────────────────────────────────────
// Lightweight activity logger.
//
// Every meaningful user action is recorded in the `activity_log` table so
// the admin can monitor platform usage in real-time.  Logging is
// fire-and-forget — errors are swallowed to never impact the primary flow.
// ────────────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'REGISTER'
  | 'LOGIN'
  | 'LOGIN_MPIN'
  | 'SET_MPIN'
  | 'BUY_ORDER'
  | 'SELL_ORDER'
  | 'CANCEL_ORDER'
  | 'ORDER_FILLED'
  | 'ORDER_FAILED'
  | 'ORDER_QUEUED'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'WATCHLIST_ADD'
  | 'WATCHLIST_REMOVE'
  | 'PRICE_ALERT_SET'
  | 'PRICE_ALERT_TRIGGERED'
  | 'BALANCE_RESET'
  | 'USER_DELETED';

/**
 * Log a user activity. This is fire-and-forget — it never throws.
 *
 * @param userId  The user performing the action.
 * @param action  One of the predefined ActivityAction strings.
 * @param details Optional object with context (will be JSON-serialised).
 * @param ip      Optional IP address from the request.
 */
export function logActivity(
  userId: number,
  action: ActivityAction,
  details?: Record<string, any> | string,
  ip?: string,
): void {
  try {
    const detailsStr = details
      ? typeof details === 'string'
        ? details
        : JSON.stringify(details)
      : null;
    db.prepare(
      `INSERT INTO activity_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
    ).run(userId, action, detailsStr, ip || null);
  } catch (err) {
    // Never let logging failures bubble up and break the primary flow
    console.error('[activity] log failed:', err);
  }
}

/**
 * Extract client IP from an Express request.
 * Handles X-Forwarded-For (common behind reverse proxies / Render / Vercel).
 */
export function getClientIp(req: { ip?: string; headers?: Record<string, any> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}
