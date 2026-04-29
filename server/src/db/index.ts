import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

let pool: pg.Pool | null = null;

// ── AsyncLocalStorage for transaction-scoped client ──
// When a transaction is active on the current async context, every
// db.prepare().run/get/all call routes through THAT client instead of
// the pool.  This guarantees atomicity (the old code used a separate
// connection for the transaction wrapper and the pool for inner queries,
// making transactions a no-op).
import { AsyncLocalStorage } from 'node:async_hooks';
const txClient = new AsyncLocalStorage<pg.PoolClient>();

export function getPool(): pg.Pool {
  if (!pool) {
    const DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/papertrading';
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false,
      // ── Production pool tuning ──
      max: 20,                    // max simultaneous connections
      min: 2,                     // keep 2 idle connections warm
      idleTimeoutMillis: 30_000,  // release idle clients after 30s
      connectionTimeoutMillis: 5_000, // fail fast if PG is unreachable
    });

    pool.on('error', (err) => {
      console.error('[db] unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Gracefully drain all connections.  Call on SIGINT / SIGTERM.
 */
export async function shutdownPool() {
  if (pool) {
    console.log('[db] draining connection pool…');
    await pool.end();
    pool = null;
  }
}

// ── Helpers ──

/** Return the transaction-scoped client if inside db.transaction(), else pool. */
function getQueryable(): pg.Pool | pg.PoolClient {
  return txClient.getStore() ?? getPool();
}

class Statement {
  private sql: string;
  private params: any[];
  constructor(sql: string, params: any[] = []) {
    this.sql = sql;
    this.params = params;
  }

  // Convert SQLite-style ? placeholders to PostgreSQL-style $1, $2, etc.
  private convertPlaceholders(sql: string, params: any[]): [string, any[]] {
    let paramIndex = 1;
    const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    return [convertedSql, params];
  }

  /**
   * Auto-appends RETURNING id to INSERT statements that lack it so that
   * lastInsertRowid is always populated for new rows.
   */
  private ensureReturningId(sql: string): string {
    const trimmed = sql.trim().toUpperCase();
    if (
      trimmed.startsWith('INSERT') &&
      !trimmed.includes('RETURNING')
    ) {
      return sql.replace(/;?\s*$/, ' RETURNING id');
    }
    return sql;
  }

  async run(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const sqlWithReturning = this.ensureReturningId(this.sql);
    const [sql, convertedParams] = this.convertPlaceholders(
      sqlWithReturning,
      mergedParams,
    );
    const result = await getQueryable().query(sql, convertedParams);
    return {
      lastInsertRowid: result.rows[0]?.id ?? 0,
      changes: result.rowCount || 0,
    };
  }

  async get(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const [sql, convertedParams] = this.convertPlaceholders(
      this.sql,
      mergedParams,
    );
    const result = await getQueryable().query(sql, convertedParams);
    return result.rows[0];
  }

  async all(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const [sql, convertedParams] = this.convertPlaceholders(
      this.sql,
      mergedParams,
    );
    const result = await getQueryable().query(sql, convertedParams);
    return result.rows;
  }
}

class WrappedDatabase {
  prepare(sql: string, params: any[] = []) {
    return new Statement(sql, params);
  }

  async exec(sql: string) {
    await getQueryable().query(sql);
  }

  pragma(_sql: string) {
    return [];
  }

  /**
   * Execute `fn` inside a BEGIN / COMMIT block using a **single dedicated
   * client** that is shared with every db.prepare() call made inside `fn`
   * via AsyncLocalStorage.  If `fn` throws, the transaction is rolled back.
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return (async (...args: any[]) => {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await txClient.run(client, () => fn(...args));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }) as T;
  }
}

export const db = new WrappedDatabase();

// ────────────────────────────────────────────────────────────────────────────
// Schema initialisation — production-grade
// ────────────────────────────────────────────────────────────────────────────
export async function initSchema() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // ── Users ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password      TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user'
                        CHECK(role IN ('user','admin')),
        balance       NUMERIC(18,4) NOT NULL DEFAULT 100000,
        mpin_hash     TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Stocks (master universe — ingested from NSE) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id            SERIAL PRIMARY KEY,
        symbol        TEXT NOT NULL,
        name          TEXT NOT NULL,
        exchange      TEXT NOT NULL,
        sector        TEXT,
        isin          TEXT,
        market_cap    NUMERIC(18,4),
        pe_ratio      NUMERIC(12,4),
        high_52w      NUMERIC(18,4),
        low_52w       NUMERIC(18,4),
        eps           NUMERIC(12,4),
        volume        BIGINT,
        about         TEXT,
        category      TEXT DEFAULT 'stock',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(symbol, exchange)
      )
    `);

    // ── Holdings ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS holdings (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        quantity      INTEGER NOT NULL DEFAULT 0,
        avg_buy_price NUMERIC(18,4) NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, symbol)
      )
    `);

    // ── Orders ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol            TEXT NOT NULL,
        type              TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT')),
        transaction_type  TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
        quantity          INTEGER NOT NULL,
        price             NUMERIC(18,4) NOT NULL,
        limit_price       NUMERIC(18,4),
        status            TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK(status IN ('PENDING','FILLED','CANCELLED','EXPIRED','FAILED')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        filled_at         TIMESTAMPTZ,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Transactions (filled trades) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        symbol        TEXT NOT NULL,
        type          TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
        quantity      INTEGER NOT NULL,
        price         NUMERIC(18,4) NOT NULL,
        total_amount  NUMERIC(18,4) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Watchlists ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Watchlist items ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id            SERIAL PRIMARY KEY,
        watchlist_id  INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(watchlist_id, symbol)
      )
    `);

    // ── Notifications ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        message       TEXT NOT NULL,
        type          TEXT NOT NULL DEFAULT 'system'
                        CHECK(type IN ('order','price_alert','system')),
        read          BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Price alerts ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol        TEXT NOT NULL,
        target_price  NUMERIC(18,4) NOT NULL,
        condition     TEXT NOT NULL CHECK(condition IN ('above','below')),
        triggered     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Portfolio history (hourly snapshots) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_history (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_value   NUMERIC(18,4) NOT NULL,
        cash_balance  NUMERIC(18,4) NOT NULL,
        recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Wallet transactions ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type          TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
        amount        NUMERIC(18,4) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ────────────────────────────────────────
    // Indexes — cover every hot query path
    // ────────────────────────────────────────
    // users
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email))`);

    // stocks
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stocks_exchange ON stocks(exchange)`);

    // holdings
    await client.query(`CREATE INDEX IF NOT EXISTS idx_holdings_user_id ON holdings(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol)`);

    // orders
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);

    // transactions
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`);

    // watchlists
    await client.query(`CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id)`);

    // watchlist_items
    await client.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol)`);

    // notifications
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);

    // price_alerts
    await client.query(`CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON price_alerts(triggered)`);

    // portfolio_history
    await client.query(`CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_id ON portfolio_history(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_portfolio_history_recorded_at ON portfolio_history(user_id, recorded_at)`);

    // wallet_transactions
    await client.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_user_id ON wallet_transactions(user_id)`);

    // ────────────────────────────────────────
    // Auto-update trigger for updated_at
    // ────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    const tablesWithUpdatedAt = [
      'users', 'stocks', 'holdings', 'orders', 'watchlists',
    ];
    for (const table of tablesWithUpdatedAt) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${table}_updated_at'
          ) THEN
            CREATE TRIGGER trg_${table}_updated_at
              BEFORE UPDATE ON ${table}
              FOR EACH ROW
              EXECUTE FUNCTION set_updated_at();
          END IF;
        END $$
      `);
    }

    // ────────────────────────────────────────
    // Migrations (idempotent) — safe for existing DBs
    // ────────────────────────────────────────

    // Expand order status CHECK if it was created with the old set
    try {
      await client.query(`
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check
      `);
      await client.query(`
        ALTER TABLE orders ADD CONSTRAINT orders_status_check
          CHECK(status IN ('PENDING','FILLED','CANCELLED','EXPIRED','FAILED'))
      `);
    } catch {
      // constraint may not exist by that name — ignore
    }

    // Add missing columns to existing tables
    const migrations = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS mpin_hash TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE stocks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE stocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    ];
    for (const m of migrations) {
      try { await client.query(m); } catch { /* already exists */ }
    }

    // Add unique constraint to watchlist_items if missing
    try {
      await client.query(`
        ALTER TABLE watchlist_items
          ADD CONSTRAINT uq_watchlist_items_watchlist_symbol
          UNIQUE (watchlist_id, symbol)
      `);
    } catch { /* already exists */ }

    // Drop the dead stock_prices table — it is never read or written
    await client.query(`DROP TABLE IF EXISTS stock_prices`);

    await client.query('COMMIT');
    console.log('[db] schema initialised successfully');

    // ── Admin bootstrap ──
    const ADMIN_EMAIL = (
      process.env.ADMIN_EMAIL || 'yogesh.nithyanandam@gmail.com'
    )
      .toLowerCase()
      .trim();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
    try {
      const existing = await getPool().query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [ADMIN_EMAIL],
      );
      if (existing.rows.length > 0) {
        await getPool().query(
          `UPDATE users SET role = 'admin' WHERE id = $1`,
          [existing.rows[0].id],
        );
        if (ADMIN_PASSWORD) {
          const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
          await getPool().query(
            `UPDATE users SET password = $1 WHERE id = $2`,
            [hashed, existing.rows[0].id],
          );
          console.log(`[admin] reset password for ${ADMIN_EMAIL}`);
        }
        console.log(`[admin] ensured role for ${ADMIN_EMAIL}`);
      } else if (ADMIN_PASSWORD) {
        const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await getPool().query(
          'INSERT INTO users (name, email, password, role, balance) VALUES ($1, $2, $3, $4, $5)',
          [ADMIN_NAME, ADMIN_EMAIL, hashed, 'admin', 100000],
        );
        console.log(`[admin] bootstrapped admin user ${ADMIN_EMAIL}`);
      } else {
        console.log(
          `[admin] ${ADMIN_EMAIL} not yet registered; set ADMIN_PASSWORD env var to auto-create`,
        );
      }
    } catch (err: any) {
      console.warn('[admin] bootstrap failed:', err?.message || err);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
