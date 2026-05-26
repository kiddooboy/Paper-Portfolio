// AI console log — the live terminal feed shown on the right of the AI Trade page.
// Each call appends one structured event; the route layer polls rows newer than
// a cursor id. We keep the table bounded by pruning old rows per user.
//
// IMPORTANT: Every logConsole call also writes to process.stdout so the operator
// sees the AI agent's decision-making live in the server terminal.

import { db } from '../../db/index.js';

export type LogLevel = 'info' | 'signal' | 'trade' | 'warn' | 'error' | 'agent';

const MAX_ROWS_PER_USER = 400;

// ── ANSI colour codes for terminal output ────────────────────────────────────
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const MAGENTA= '\x1b[35m';
const WHITE  = '\x1b[37m';

const LEVEL_STYLE: Record<LogLevel, { color: string; icon: string; label: string }> = {
  info:   { color: DIM,     icon: '📋', label: 'INFO'   },
  signal: { color: CYAN,    icon: '📊', label: 'SIGNAL' },
  trade:  { color: GREEN,   icon: '💰', label: 'TRADE'  },
  warn:   { color: YELLOW,  icon: '⚠️',  label: 'WARN'   },
  error:  { color: RED,     icon: '🚨', label: 'ERROR'  },
  agent:  { color: MAGENTA, icon: '🤖', label: 'AGENT'  },
};

function getIST(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600000);
  return `${String(ist.getHours()).padStart(2, '0')}:${String(ist.getMinutes()).padStart(2, '0')}:${String(ist.getSeconds()).padStart(2, '0')}`;
}

/** Write to both the database (for the UI console panel) and stdout (for the terminal). */
export function logConsole(
  userId: number,
  level: LogLevel,
  message: string,
  opts: { agent?: string; meta?: unknown } = {},
): void {
  // ── Terminal output ──
  const style = LEVEL_STYLE[level];
  const time = getIST();
  const agentTag = opts.agent ? ` ${DIM}[${opts.agent}]${RESET}` : '';
  const line = `${DIM}${time}${RESET} ${style.color}${BOLD}${style.icon} [AI-AGENT]${RESET}${agentTag} ${style.color}${message}${RESET}`;
  console.log(line);

  // ── Database output ──
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
    console.error('[aiTrader] logConsole DB error:', err);
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
