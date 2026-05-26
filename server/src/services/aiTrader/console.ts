// AI console log — the live terminal feed shown on the right of the AI Trade page.
// Each call appends one structured event; the route layer polls rows newer than
// a cursor id. We keep the table bounded by pruning old rows per user.

import { db } from '../../db/index.js';

export type LogLevel = 'info' | 'signal' | 'trade' | 'warn' | 'error' | 'agent';

const MAX_ROWS_PER_USER = 400;

export function logConsole(
  userId: number,
  level: LogLevel,
  message: string,
  opts: { agent?: string; meta?: unknown } = {},
): void {
  try {
    db.prepare(
      `INSERT INTO ai_console_log (user_id, level, agent, message, meta) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      userId,
      level,
      opts.agent ?? null,
      message,
      opts.meta !== undefined ? JSON.stringify(opts.meta) : null,
    );

    // Prune: keep only the newest MAX_ROWS_PER_USER rows for this user.
    db.prepare(
      `DELETE FROM ai_console_log
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM ai_console_log WHERE user_id = ? ORDER BY id DESC LIMIT ?
         )`,
    ).run(userId, userId, MAX_ROWS_PER_USER);
  } catch (err) {
    console.error('[aiTrader] logConsole error:', err);
  }
}

export function getConsole(userId: number, sinceId = 0, limit = 200) {
  return db
    .prepare(
      `SELECT id, level, agent, message, meta, created_at
       FROM ai_console_log
       WHERE user_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(userId, sinceId, limit) as any[];
}
