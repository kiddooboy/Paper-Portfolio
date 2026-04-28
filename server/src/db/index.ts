import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/papertrading';
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
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

  async run(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const [sql, convertedParams] = this.convertPlaceholders(this.sql, mergedParams);
    const result = await getPool().query(sql, convertedParams);
    return {
      lastInsertRowid: result.rows[0]?.id || 0,
      changes: result.rowCount || 0,
    };
  }

  async get(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const [sql, convertedParams] = this.convertPlaceholders(this.sql, mergedParams);
    const result = await getPool().query(sql, convertedParams);
    return result.rows[0];
  }

  async all(...params: any[]) {
    const mergedParams = [...this.params, ...params];
    const [sql, convertedParams] = this.convertPlaceholders(this.sql, mergedParams);
    const result = await getPool().query(sql, convertedParams);
    return result.rows;
  }
}

class WrappedDatabase {
  prepare(sql: string, params: any[] = []) {
    return new Statement(sql, params);
  }

  async exec(sql: string) {
    await getPool().query(sql);
  }

  pragma(_sql: string) {
    return [];
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return (async (...args: any[]) => {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await fn(...args);
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

export async function initSchema() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
        balance NUMERIC NOT NULL DEFAULT 100000,
        mpin_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stocks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        exchange TEXT NOT NULL,
        sector TEXT,
        isin TEXT,
        market_cap NUMERIC,
        pe_ratio NUMERIC,
        high_52w NUMERIC,
        low_52w NUMERIC,
        eps NUMERIC,
        volume NUMERIC,
        about TEXT,
        category TEXT DEFAULT 'stock',
        UNIQUE(symbol, exchange)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name)`);

    // Stock prices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_prices (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        price NUMERIC NOT NULL,
        change NUMERIC NOT NULL DEFAULT 0,
        change_percent NUMERIC NOT NULL DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Holdings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS holdings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        avg_buy_price NUMERIC NOT NULL DEFAULT 0,
        UNIQUE(user_id, symbol)
      )
    `);

    // Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT')),
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
        quantity INTEGER NOT NULL,
        price NUMERIC NOT NULL,
        limit_price NUMERIC,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','FILLED','CANCELLED')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        filled_at TIMESTAMP
      )
    `);

    // Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        order_id INTEGER,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
        quantity INTEGER NOT NULL,
        price NUMERIC NOT NULL,
        total_amount NUMERIC NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Watchlists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL
      )
    `);

    // Watchlist items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id SERIAL PRIMARY KEY,
        watchlist_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system' CHECK(type IN ('order','price_alert','system')),
        read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Price alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        target_price NUMERIC NOT NULL,
        condition TEXT NOT NULL CHECK(condition IN ('above','below')),
        triggered BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Portfolio history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total_value NUMERIC NOT NULL,
        cash_balance NUMERIC NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Wallet transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
        amount NUMERIC NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Migrations (idempotent) ──
    // Add role column to users table if missing (existing DBs)
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))`);
    } catch {
      // Column already exists — ignore
    }

    // Add mpin_hash column to users table if missing (existing DBs)
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mpin_hash TEXT`);
    } catch {
      // Column already exists — ignore
    }

    await client.query('COMMIT');

    // ── Admin bootstrap ──
    // To make admin login reliable, recreate/upgrade the admin user from environment variables on
    // every startup (idempotent).
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'yogesh.nithyanandam@gmail.com').toLowerCase().trim();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // optional: only sets/resets if provided
    const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
    try {
      const existing = await getPool().query('SELECT id FROM users WHERE LOWER(email) = $1', [ADMIN_EMAIL]);
      if (existing.rows.length > 0) {
        // Always promote to admin
        await getPool().query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.rows[0].id]);
        // Reset password if ADMIN_PASSWORD is provided
        if (ADMIN_PASSWORD) {
          const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
          await getPool().query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, existing.rows[0].id]);
          console.log(`[admin] reset password for ${ADMIN_EMAIL}`);
        }
        console.log(`[admin] ensured role for ${ADMIN_EMAIL}`);
      } else if (ADMIN_PASSWORD) {
        // Create admin from scratch (only if password env var is set)
        const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await getPool().query(
          'INSERT INTO users (name, email, password, role, balance) VALUES ($1, $2, $3, $4, $5)',
          [ADMIN_NAME, ADMIN_EMAIL, hashed, 'admin', 100000]
        );
        console.log(`[admin] bootstrapped admin user ${ADMIN_EMAIL}`);
      } else {
        console.log(`[admin] ${ADMIN_EMAIL} not yet registered; set ADMIN_PASSWORD env var to auto-create`);
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
