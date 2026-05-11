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
        type              TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT','SL','SL-M')),
        transaction_type  TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
        quantity          INTEGER NOT NULL,
        price             REAL NOT NULL,
        limit_price       REAL,
        trigger_price     REAL,
        product_type      TEXT NOT NULL DEFAULT 'CNC' CHECK(product_type IN ('CNC','MIS')),
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

      CREATE TABLE IF NOT EXISTS trade_pnl (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol          TEXT NOT NULL,
        buy_order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        sell_order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        quantity        INTEGER NOT NULL,
        buy_price       REAL NOT NULL,
        sell_price      REAL NOT NULL,
        realized_pnl    REAL NOT NULL,
        closed_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        email       TEXT NOT NULL,
        otp_hash    TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        used        INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  safeExec(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`, 'migration: users.firebase_uid');
  safeExec(`ALTER TABLE users ADD COLUMN ai_credits_used INTEGER NOT NULL DEFAULT 0`, 'migration: users.ai_credits_used');
  safeExec(`ALTER TABLE users MODIFY COLUMN password TEXT`, 'migration: users.password nullable');
  safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`, 'index: users.firebase_uid');

  // Orders: new columns for SL/SL-M, MIS/CNC, target price
  safeExec(`ALTER TABLE orders ADD COLUMN trigger_price REAL`, 'migration: orders.trigger_price');
  safeExec(`ALTER TABLE orders ADD COLUMN product_type TEXT NOT NULL DEFAULT 'CNC'`, 'migration: orders.product_type');
  safeExec(`ALTER TABLE orders ADD COLUMN target_price REAL`, 'migration: orders.target_price');

  // Stocks: fundamental data columns
  safeExec(`ALTER TABLE stocks ADD COLUMN roe REAL`, 'migration: stocks.roe');
  safeExec(`ALTER TABLE stocks ADD COLUMN book_value REAL`, 'migration: stocks.book_value');
  safeExec(`ALTER TABLE stocks ADD COLUMN debt_to_equity REAL`, 'migration: stocks.debt_to_equity');
  safeExec(`ALTER TABLE stocks ADD COLUMN div_yield REAL`, 'migration: stocks.div_yield');

  // New table indexes
  safeExec(`CREATE INDEX IF NOT EXISTS idx_trade_pnl_user_id ON trade_pnl(user_id)`, 'index: trade_pnl.user_id');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_trade_pnl_symbol ON trade_pnl(symbol, user_id)`, 'index: trade_pnl.symbol');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps(email)`, 'index: password_reset_otps.email');

  // ── Phase 2c: New feature tables ──

  // GTT / AMO flags on orders
  safeExec(`ALTER TABLE orders ADD COLUMN is_gtt INTEGER NOT NULL DEFAULT 0`, 'migration: orders.is_gtt');
  safeExec(`ALTER TABLE orders ADD COLUMN gtt_valid_till TEXT`, 'migration: orders.gtt_valid_till');
  safeExec(`ALTER TABLE orders ADD COLUMN is_amo INTEGER NOT NULL DEFAULT 0`, 'migration: orders.is_amo');
  safeExec(`ALTER TABLE orders ADD COLUMN parent_order_id INTEGER`, 'migration: orders.parent_order_id');

  // Fix orders.type CHECK constraint — tables created before SL/SL-M support only
  // allow ('MARKET','LIMIT'). SQLite cannot ALTER a CHECK constraint, so rebuild
  // the table atomically when the stale constraint is detected.
  {
    const orderTableSql = (raw.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'`
    ).get() as any)?.sql ?? '';
    if (!orderTableSql.includes("'SL'")) {
      console.log('[db] migration: rebuilding orders table — adding SL/SL-M to type CHECK constraint');
      try {
        raw.exec(`
          BEGIN;
          CREATE TABLE orders_new (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol            TEXT NOT NULL,
            type              TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT','SL','SL-M')),
            transaction_type  TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
            quantity          INTEGER NOT NULL,
            price             REAL NOT NULL,
            limit_price       REAL,
            trigger_price     REAL,
            product_type      TEXT NOT NULL DEFAULT 'CNC' CHECK(product_type IN ('CNC','MIS')),
            target_price      REAL,
            status            TEXT NOT NULL DEFAULT 'PENDING'
                                CHECK(status IN ('PENDING','FILLED','CANCELLED','EXPIRED','FAILED')),
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            filled_at         TEXT,
            updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
            is_gtt            INTEGER NOT NULL DEFAULT 0,
            gtt_valid_till    TEXT,
            is_amo            INTEGER NOT NULL DEFAULT 0,
            parent_order_id   INTEGER
          );
          INSERT INTO orders_new
            SELECT id, user_id, symbol, type, transaction_type, quantity, price,
                   limit_price, trigger_price,
                   COALESCE(product_type, 'CNC'), target_price, status,
                   created_at, filled_at, updated_at,
                   COALESCE(is_gtt, 0), gtt_valid_till,
                   COALESCE(is_amo, 0), parent_order_id
            FROM orders;
          DROP TABLE orders;
          ALTER TABLE orders_new RENAME TO orders;
          COMMIT;
        `);
        // Recreate indexes dropped along with the old table
        raw.exec(`
          CREATE INDEX IF NOT EXISTS idx_orders_user_id     ON orders(user_id);
          CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
          CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
          CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders(created_at);
        `);
        console.log('[db] migration: orders table rebuilt successfully');
      } catch (err: any) {
        try { raw.exec('ROLLBACK'); } catch {}
        console.error('[db] migration: orders rebuild failed —', err?.message);
      }
    }
  }

  // Basket orders
  safeExec(`CREATE TABLE IF NOT EXISTS baskets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: baskets');
  safeExec(`CREATE TABLE IF NOT EXISTS basket_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    basket_id   INTEGER NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    transaction_type TEXT NOT NULL DEFAULT 'BUY' CHECK(transaction_type IN ('BUY','SELL')),
    UNIQUE(basket_id, symbol)
  )`, 'table: basket_items');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_baskets_user_id ON baskets(user_id)`, 'index: baskets.user_id');

  // Stock Collections / Themes
  safeExec(`CREATE TABLE IF NOT EXISTS collections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    icon        TEXT,
    color       TEXT DEFAULT '#00B386',
    is_public   INTEGER NOT NULL DEFAULT 1,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: collections');
  safeExec(`CREATE TABLE IF NOT EXISTS collection_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    UNIQUE(collection_id, symbol)
  )`, 'table: collection_items');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id)`, 'index: collection_items');

  // Trading Contests
  safeExec(`CREATE TABLE IF NOT EXISTS contests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    start_date    TEXT NOT NULL,
    end_date      TEXT NOT NULL,
    starting_capital REAL NOT NULL DEFAULT 100000,
    status        TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','active','completed')),
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: contests');
  safeExec(`CREATE TABLE IF NOT EXISTS contest_participants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contest_id  INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance     REAL NOT NULL DEFAULT 100000,
    joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(contest_id, user_id)
  )`, 'table: contest_participants');
  safeExec(`CREATE TABLE IF NOT EXISTS contest_holdings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contest_id    INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 0,
    avg_buy_price REAL NOT NULL DEFAULT 0,
    UNIQUE(contest_id, user_id, symbol)
  )`, 'table: contest_holdings');
  safeExec(`CREATE TABLE IF NOT EXISTS contest_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contest_id    INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
    quantity      INTEGER NOT NULL,
    price         REAL NOT NULL,
    total_amount  REAL NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: contest_transactions');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_contest_participants_user ON contest_participants(user_id)`, 'index: contest_participants');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_contest_holdings_user ON contest_holdings(contest_id, user_id)`, 'index: contest_holdings');

  // SIP Schedules
  safeExec(`CREATE TABLE IF NOT EXISTS sip_schedules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    frequency     TEXT NOT NULL DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly','monthly')),
    day_of_week   INTEGER,
    day_of_month  INTEGER,
    is_active     INTEGER NOT NULL DEFAULT 1,
    next_run      TEXT,
    total_runs    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: sip_schedules');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_sip_schedules_user ON sip_schedules(user_id)`, 'index: sip_schedules');

  // Achievements
  safeExec(`CREATE TABLE IF NOT EXISTS achievements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT '🏆',
    category    TEXT NOT NULL DEFAULT 'trading'
  )`, 'table: achievements');
  safeExec(`CREATE TABLE IF NOT EXISTS user_achievements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    earned_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_key)
  )`, 'table: user_achievements');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id)`, 'index: user_achievements');

  // Corporate Actions
  safeExec(`CREATE TABLE IF NOT EXISTS corporate_actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol        TEXT NOT NULL,
    action_type   TEXT NOT NULL CHECK(action_type IN ('BONUS','SPLIT','DIVIDEND')),
    ratio         TEXT,
    amount        REAL,
    ex_date       TEXT NOT NULL,
    applied       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`, 'table: corporate_actions');
  safeExec(`CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol ON corporate_actions(symbol)`, 'index: corporate_actions');

  // Seed default achievements
  const defaultAchievements = [
    ['first_trade',      'First Trade',          'Placed your very first trade',                    '🚀', 'trading'],
    ['first_profit',     'First Profit',          'Closed a trade in profit',                        '💰', 'trading'],
    ['ten_trades',       '10 Trades',             'Completed 10 trades',                             '📈', 'trading'],
    ['fifty_trades',     '50 Trades',             'Completed 50 trades',                             '⚡', 'trading'],
    ['diversified',      'Diversified Portfolio', 'Hold stocks in 5+ different sectors',             '🌐', 'portfolio'],
    ['ten_bagger',       '10-Bagger Club',        'A holding gained 1000%+ from buy price',          '🔥', 'portfolio'],
    ['loss_recovered',   'Comeback Kid',          'Portfolio recovered after a 10%+ drawdown',       '💪', 'portfolio'],
    ['analyst',          'Market Analyst',        'Set 10+ price alerts',                            '🔔', 'alerts'],
    ['big_balance',      'High Roller',           'Portfolio total value exceeded ₹5,00,000',        '🏆', 'portfolio'],
    ['no_loss_week',     'Green Week',            'All holdings in profit for a full week',          '🌱', 'portfolio'],
    ['sector_master',    'Sector Master',         'Traded in all 10 sectors',                        '🗂️', 'trading'],
    ['patient_investor', 'Patient Investor',      'Held a stock for 30+ days',                       '⏳', 'portfolio'],
  ];
  for (const [key, name, description, icon, category] of defaultAchievements) {
    safeExec(
      `INSERT OR IGNORE INTO achievements (key, name, description, icon, category) VALUES ('${key}', '${name}', '${description}', '${icon}', '${category}')`,
      `achievement: ${key}`
    );
  }

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
