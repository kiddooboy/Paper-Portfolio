import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_URL || path.join(__dirname, '..', '..', 'data', 'papertrading.db');

let SQL: any;
let innerDb: any;
let saveScheduled = false;
let lastInsertId = 0;
let lastChanges = 0;

function saveDb() {
  if (!innerDb || saveScheduled) return;
  saveScheduled = true;
  setImmediate(() => {
    try {
      const data = innerDb.export();
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, Buffer.from(data));
    } finally {
      saveScheduled = false;
    }
  });
}

function loadDb() {
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    return new SQL.Database(filebuffer);
  }
  return new SQL.Database();
}

class Statement {
  private sql: string;
  constructor(sql: string) {
    this.sql = sql;
  }

  run(...params: any[]) {
    const stmt = innerDb.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const idRes = innerDb.exec('SELECT last_insert_rowid()');
    const chRes = innerDb.exec('SELECT changes()');
    lastInsertId = idRes[0]?.values?.[0]?.[0] ?? 0;
    lastChanges = chRes[0]?.values?.[0]?.[0] ?? 0;
    saveDb();
    return { lastInsertRowid: lastInsertId, changes: lastChanges };
  }

  get(...params: any[]) {
    const stmt = innerDb.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  all(...params: any[]) {
    const stmt = innerDb.prepare(this.sql);
    const results: any[] = [];
    try {
      if (params.length) stmt.bind(params);
      while (stmt.step()) results.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return results;
  }

  pluck() { return this; }
}

class WrappedDatabase {
  prepare(sql: string) {
    return new Statement(sql);
  }

  exec(sql: string) {
    innerDb.exec(sql);
    saveDb();
  }

  pragma(_sql: string) {
    return [];
  }

  // better-sqlite3 compatibility shim. Returns a callable that executes `fn`
  // within BEGIN/COMMIT. sql.js is synchronous so this is sufficient.
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      innerDb.run('BEGIN');
      try {
        const result = fn(...args);
        innerDb.run('COMMIT');
        saveDb();
        return result;
      } catch (err) {
        try { innerDb.run('ROLLBACK'); } catch {}
        throw err;
      }
    }) as T;
  }
}

export const db = new WrappedDatabase();

export async function initSchema() {
  SQL = await initSqlJs();
  innerDb = loadDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      balance REAL NOT NULL DEFAULT 100000,
      mpin_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      exchange TEXT NOT NULL,
      sector TEXT,
      isin TEXT,
      market_cap REAL,
      pe_ratio REAL,
      high_52w REAL,
      low_52w REAL,
      eps REAL,
      volume REAL,
      about TEXT,
      category TEXT DEFAULT 'stock',
      UNIQUE(symbol, exchange)
    );
    CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
    CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name);

    CREATE TABLE IF NOT EXISTS stock_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      change REAL NOT NULL DEFAULT 0,
      change_percent REAL NOT NULL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      avg_buy_price REAL NOT NULL DEFAULT 0,
      UNIQUE(user_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('MARKET','LIMIT')),
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      limit_price REAL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','FILLED','CANCELLED')),
      created_at TEXT DEFAULT (datetime('now')),
      filled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id INTEGER,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total_amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system' CHECK(type IN ('order','price_alert','system')),
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      target_price REAL NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('above','below')),
      triggered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_value REAL NOT NULL,
      cash_balance REAL NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Migrations (idempotent) ──
  // Add role column to users table if missing (existing DBs)
  try {
    innerDb.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))`);
    saveDb();
  } catch {
    // Column already exists — ignore
  }

  // Add mpin_hash column to users table if missing (existing DBs)
  try {
    innerDb.exec(`ALTER TABLE users ADD COLUMN mpin_hash TEXT`);
    saveDb();
  } catch {
    // Column already exists — ignore
  }

  // Ensure admin role for the designated admin email
  const ADMIN_EMAIL = 'yogesh.nithyanandam@gmail.com';
  try {
    db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run(ADMIN_EMAIL);
  } catch {}
}
