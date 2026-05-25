import admin from 'firebase-admin';
import { db } from '../db/index.js';
import { getFirebaseAdmin } from '../lib/firebaseAdmin.js';

// FCM push notifications. Device tokens are registered by the native app and
// stored per user; pushToUser() sends a notification to all of a user's devices.
// Gracefully no-ops if Firebase Admin isn't configured.

export function registerDevice(userId: number, token: string, platform?: string): void {
  if (!token) return;
  db.prepare(`
    INSERT INTO device_tokens (user_id, token, platform) VALUES (?, ?, ?)
    ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id,
                                      platform = excluded.platform,
                                      updated_at = datetime('now')
  `).run(userId, token, platform || null);
}

export function unregisterDevice(token: string): void {
  if (!token) return;
  try { db.prepare(`DELETE FROM device_tokens WHERE token = ?`).run(token); } catch {}
}

/** Send a push notification to every device a user has registered. */
export async function pushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> {
  let tokens: string[];
  try {
    tokens = (db.prepare(`SELECT token FROM device_tokens WHERE user_id = ?`).all(userId) as any[])
      .map((r) => r.token).filter(Boolean);
  } catch { return; }
  if (!tokens.length) return;

  try {
    getFirebaseAdmin(); // ensure the default app is initialised (throws if unconfigured)
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
      android: { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
    });
    // Prune tokens FCM reports as permanently invalid
    res.responses.forEach((r, i) => {
      const code = (r as any)?.error?.code || '';
      if (!r.success && /not-registered|invalid-argument|invalid-registration-token/.test(code)) {
        unregisterDevice(tokens[i]);
      }
    });
  } catch (err: any) {
    // Firebase not configured or transient send error — push is best-effort.
    console.warn('[push] send failed:', err?.message ?? err);
  }
}
