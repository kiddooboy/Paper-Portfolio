import { DatabaseSync, type StatementSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

// ────────────────────────────────────────────────────────────────────────────
// SQLite-backed database wrapper, powered by Node.js built-in `node:sqlite`.
// No native compilation, no third-party dependency — works on any Node ≥ 22.5.
//
// All callers (routes, services) use the same shape they always did:
//
//   const row = await db.prepare(sql).get(...args);
//   await db.transaction(async () => { ... });
//
// `node:sqlite` is synchronous, so .run/.get/.all return values directly.
// `await <non-promise>` simply yields the value, so legacy `await` callers
// continue to work without modification.
// ────────────────────────────────────────────────────────────────────────────

// Anchor DB path to the *server* package root (one level above src/)
// so the database file is always in the same location regardless of
// which directory the process is started from.
const __db_filename = fileURLToPath(import.meta.url);
const __db_dirname = path.dirname(__db_filename);
const SERVER_ROOT = path.resolve(__db_dirname, '..');  // server/src -> server/

const DB_PATH =
  process.env.DB_PATH ||
  path.resolve(SERVER_ROOT, 'data', 'papertrading.db');

// Ensure the parent directory exists.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db: DatabaseSync | null = null;

export function getRawDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    // Production-friendly pragmas
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA synchronous = NORMAL');
    _db.exec('PRAGMA foreign_keys = ON');
    _db.exec('PRAGMA busy_timeout = 5000');
  }
  return _db;
}

export async function shutdownPool() {
  if (_db) {
    console.log('[db] closing SQLite database…');
    _db.close();
    _db = null;
  }
}

// ── Statement cache so prepare() is paid only once per unique SQL ──
const stmtCache = new Map<string, StatementSync>();
function getCachedStatement(sql: string): StatementSync {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = getRawDb().prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

// ── AsyncLocalStorage flag so db.transaction() can be reentrant ──
const inTransaction = new AsyncLocalStorage<true>();

class Statement {
  constructor(private sql: string) {}

  run(...params: any[]) {
    const result = getCachedStatement(this.sql).run(...(params as any));
    return {
      lastInsertRowid: Number(result.lastInsertRowid ?? 0),
      changes: Number(result.changes ?? 0),
    };
  }

  get(...params: any[]) {
    return getCachedStatement(this.sql).get(...(params as any));
  }

  all(...params: any[]) {
    return getCachedStatement(this.sql).all(...(params as any));
  }
}

class WrappedDatabase {
  prepare(sql: string) {
    return new Statement(sql);
  }

  exec(sql: string) {
    getRawDb().exec(sql);
  }

  pragma(sql: string) {
    return getRawDb().prepare(`PRAGMA ${sql}`).all();
  }

  /**
   * Run `fn` inside a SQLite BEGIN/COMMIT block. Reentrant: nested calls
   * skip the BEGIN and just run on the same connection (SQLite serializes
   * writes intrinsically, so atomicity is guaranteed).
   */
  async transaction<R>(fn: () => Promise<R> | R): Promise<R> {
    if (inTransaction.getStore()) {
      return await fn();
    }
    const raw = getRawDb();
    raw.exec('BEGIN');
    try {
      const result = await inTransaction.run(true, fn);
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      try { raw.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }
}

export const db = new WrappedDatabase();

// ────────────────────────────────────────────────────────────────────────────
// Helper: run a single SQL statement safely. Logs and continues on error.
// ────────────────────────────────────────────────────────────────────────────
function safeExec(sql: string, label?: string) {
  try {
    getRawDb().exec(sql);
  } catch (err: any) {
    if (label) console.warn(`[db:migrate] ${label}: ${err?.message ?? err}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Schema initialisation
// ────────────────────────────────────────────────────────────────────────────
export async function initSchema() {
  const raw = getRawDb();

  // ── Phase 1: Core tables (single transaction) ──
  raw.exec('BEGIN');
  try {
    raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password      TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user'
                        CHECK(role IN ('user','admin')),
        balance       REAL NOT NULL DEFAULT 100000,
        mpin_hash     TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stocks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol        TEXT NOT NULL,
        name          TEXT NOT NULL,
        exchange      TEXT NOT NULL,
        sector        TEXT,
        isin          TEXT,
        market_cap    REAL,
        pe_ratio      REAL,
        high_52w      REAL,
        low_52w       REAL,
        eps           REAL,
        volume        INTEGER,
        about         TEXT,
        category      TEXT DEFAULT 'stock',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(symbol, exchange)
      );

      CREATE TABLE IF NOT EXISTS holdings (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        quantity      INTEGER NOT NULL DEFAULT 0,
        avg_buy_price REAL NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol            TEXT NOT NULL,
        type              TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT')),
        transaction_type  TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
        quantity          INTEGER NOT NULL,
        price             REAL NOT NULL,
        limit_price       REAL,
        status            TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK(status IN ('PENDING','FILLED','CANCELLED','EXPIRED','FAILED')),
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        filled_at         TEXT,
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        symbol        TEXT NOT NULL,
        type          TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
        quantity      INTEGER NOT NULL,
        price         REAL NOT NULL,
        total_amount  REAL NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS watchlists (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS watchlist_items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        watchlist_id  INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        added_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(watchlist_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        message       TEXT NOT NULL,
        type          TEXT NOT NULL DEFAULT 'system'
                        CHECK(type IN ('order','price_alert','system')),
        read          INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS price_alerts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        target_price  REAL NOT NULL,
        condition     TEXT NOT NULL CHECK(condition IN ('above','below')),
        triggered     INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS portfolio_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_value   REAL NOT NULL,
        cash_balance  REAL NOT NULL,
        recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type          TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
        amount        REAL NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action        TEXT NOT NULL,
        details       TEXT,
        ip_address    TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    raw.exec('COMMIT');
    console.log('[db] core tables created/verified');
  } catch (err) {
    raw.exec('ROLLBACK');
    throw err;
  }

  // ── Phase 2: Indexes ──
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_stocks_symbol        ON stocks(symbol)`,
    `CREATE INDEX IF NOT EXISTS idx_stocks_name          ON stocks(name)`,
    `CREATE INDEX IF NOT EXISTS idx_stocks_exchange      ON stocks(exchange)`,
    `CREATE INDEX IF NOT EXISTS idx_holdings_user_id     ON holdings(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_holdings_symbol      ON holdings(symbol)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON orders(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_user_status   ON orders(user_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_symbol  ON transactions(symbol)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_watchlists_user_id   ON watchlists(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id)`,
    `CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`,
    `CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON price_alerts(triggered)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_id ON portfolio_history(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_history_recorded_at ON portfolio_history(user_id, recorded_at)`,
    `CREATE INDEX IF NOT EXISTS idx_wallet_txns_user_id  ON wallet_transactions(user_id)`,
    // Activity log indexes
    `CREATE INDEX IF NOT EXISTS idx_activity_log_user_id    ON activity_log(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_action     ON activity_log(action)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)`,
  ];
  for (const sql of indexes) safeExec(sql, 'index');
  console.log('[db] indexes ensured');

  // ── Phase 2b: Migrations (add columns to existing tables) ──
  safeExec(`ALTER TABLE users ADD COLUMN last_login TEXT`, 'migration: users.last_login');

  // ── Phase 3: updated_at triggers ──
  // Drop-and-recreate so any older incompatible trigger definition (e.g.
  // from a previous Postgres-flavoured deploy) is replaced cleanly.
  // recursive_triggers is OFF by default in SQLite, so the inner UPDATE
  // does NOT re-fire the trigger.
  const tablesWithUpdatedAt = ['users', 'stocks', 'holdings', 'orders', 'watchlists'];
  for (const table of tablesWithUpdatedAt) {
    safeExec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at`, `drop trigger ${table}`);
    safeExec(
      `CREATE TRIGGER trg_${table}_updated_at
         AFTER UPDATE ON ${table}
         FOR EACH ROW
       BEGIN
         UPDATE ${table} SET updated_at = datetime('now') WHERE id = NEW.id;
       END`,
      `trigger ${table}`,
    );
  }
  console.log('[db] triggers ensured');

  // ── Phase 4: Admin bootstrap ──
  const ADMIN_EMAIL = (
    process.env.ADMIN_EMAIL || 'yogesh.nithyanandam@gmail.com'
  ).toLowerCase().trim();
  const DEFAULT_ADMIN_PASSWORD = 'admin123';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

  try {
    const existing = raw
      .prepare('SELECT id, role FROM users WHERE email = ? COLLATE NOCASE')
      .get(ADMIN_EMAIL) as any;

    if (existing) {
      // Ensure existing user has admin role
      if (existing.role !== 'admin') {
        raw.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(existing.id);
        console.log(`[admin] elevated ${ADMIN_EMAIL} to admin role`);
      }

      // Only reset password if explicitly provided via env
      if (process.env.ADMIN_PASSWORD) {
        const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        raw.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, existing.id);
        console.log(`[admin] reset password for ${ADMIN_EMAIL} from ADMIN_PASSWORD env var`);
      } else {
        console.log(`[admin] ensured role for ${ADMIN_EMAIL}`);
      }
    } else {
      // Create new admin user with provided or default password
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      raw
        .prepare('INSERT INTO users (name, email, password, role, balance) VALUES (?, ?, ?, ?, ?)')
        .run(ADMIN_NAME, ADMIN_EMAIL, hashed, 'admin', 500000); // 5x starting balance for admin
      
      console.log(`[admin] bootstrapped admin user ${ADMIN_EMAIL} (using ${process.env.ADMIN_PASSWORD ? 'provided' : 'default'} password)`);
    }
  } catch (err: any) {
    console.warn('[admin] bootstrap failed:', err?.message || err);
  }

  console.log(`[db] schema initialised (file: ${DB_PATH})`);
}
