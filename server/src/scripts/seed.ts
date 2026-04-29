import { db, getRawDb, initSchema, shutdownPool } from '../db/index.js';
import bcrypt from 'bcryptjs';

// ────────────────────────────────────────────────────────────────────────────
// Paper Portfolio — full demo seed.
//
// Creates:
//   • Admin (yogesh.nithyanandam@gmail.com)
//   • 6 team members (teammate1..6@papertrade.in)
//     – password: password123
//     – MPIN:     1234
//     – balance:  ₹1,00,000 each
//   • ~25 curated NIFTY stocks (full 500 populate from NSE on server boot)
//   • Sample holdings, watchlists, filled orders, transactions, and a
//     starting deposit wallet entry per user, so the UI looks "alive"
//     immediately after first launch.
//
// Usage:
//   npm run seed              # additive (won't overwrite existing data)
//   npm run reset-db          # drops user-data tables then seeds fresh
// ────────────────────────────────────────────────────────────────────────────

const RESET = process.argv.includes('--reset');

const DEMO_STOCKS = [
  { symbol: 'RELIANCE',  name: 'Reliance Industries Ltd',           sector: 'Energy',             marketCap: 1980000, peRatio: 28.5, high52w: 3220, low52w: 2220, eps: 98.5,  volume: 4500000 },
  { symbol: 'TCS',       name: 'Tata Consultancy Services Ltd',     sector: 'IT',                 marketCap: 1450000, peRatio: 32.1, high52w: 4250, low52w: 3150, eps: 123.4, volume: 2100000 },
  { symbol: 'HDFCBANK',  name: 'HDFC Bank Ltd',                     sector: 'Financial Services', marketCap: 1200000, peRatio: 22.3, high52w: 1780, low52w: 1360, eps: 72.5,  volume: 3800000 },
  { symbol: 'INFY',      name: 'Infosys Ltd',                       sector: 'IT',                 marketCap: 780000,  peRatio: 26.8, high52w: 1850, low52w: 1230, eps: 56.2,  volume: 3200000 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd',                    sector: 'Financial Services', marketCap: 820000,  peRatio: 20.5, high52w: 1150, low52w: 860,  eps: 48.3,  volume: 4100000 },
  { symbol: 'HINDUNILVR',name: 'Hindustan Unilever Ltd',            sector: 'Consumer Staples',   marketCap: 650000,  peRatio: 65.2, high52w: 2800, low52w: 2200, eps: 38.5,  volume: 1200000 },
  { symbol: 'SBIN',      name: 'State Bank of India',               sector: 'Financial Services', marketCap: 720000,  peRatio: 12.8, high52w: 820,  low52w: 520,  eps: 52.1,  volume: 5600000 },
  { symbol: 'BHARTIARTL',name: 'Bharti Airtel Ltd',                 sector: 'Telecom',            marketCap: 580000,  peRatio: 48.6, high52w: 1400, low52w: 780,  eps: 18.2,  volume: 2800000 },
  { symbol: 'ITC',       name: 'ITC Ltd',                           sector: 'Consumer Staples',   marketCap: 620000,  peRatio: 28.4, high52w: 510,  low52w: 360,  eps: 15.8,  volume: 4200000 },
  { symbol: 'BAJFINANCE',name: 'Bajaj Finance Ltd',                 sector: 'Financial Services', marketCap: 480000,  peRatio: 35.2, high52w: 8200, low52w: 5600, eps: 198.5, volume: 1500000 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd',           sector: 'Financial Services', marketCap: 360000,  peRatio: 21.0, high52w: 2050, low52w: 1620, eps: 86.0,  volume: 1800000 },
  { symbol: 'LT',        name: 'Larsen & Toubro Ltd',               sector: 'Construction',       marketCap: 480000,  peRatio: 32.4, high52w: 3900, low52w: 2700, eps: 105.0, volume: 1600000 },
  { symbol: 'AXISBANK',  name: 'Axis Bank Ltd',                     sector: 'Financial Services', marketCap: 360000,  peRatio: 13.5, high52w: 1280, low52w: 940,  eps: 87.0,  volume: 3200000 },
  { symbol: 'MARUTI',    name: 'Maruti Suzuki India Ltd',           sector: 'Automobile',         marketCap: 380000,  peRatio: 31.2, high52w: 13800,low52w: 9500, eps: 396.0, volume: 800000  },
  { symbol: 'ASIANPAINT',name: 'Asian Paints Ltd',                  sector: 'Consumer Discretionary', marketCap: 310000, peRatio: 56.5, high52w: 3550, low52w: 2680, eps: 53.8, volume: 1100000 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd', sector: 'Healthcare',         marketCap: 380000,  peRatio: 38.6, high52w: 1960, low52w: 1180, eps: 39.2,  volume: 2400000 },
  { symbol: 'WIPRO',     name: 'Wipro Ltd',                         sector: 'IT',                 marketCap: 270000,  peRatio: 24.6, high52w: 580,  low52w: 380,  eps: 21.0,  volume: 4800000 },
  { symbol: 'NTPC',      name: 'NTPC Ltd',                          sector: 'Energy',             marketCap: 360000,  peRatio: 18.0, high52w: 440,  low52w: 250,  eps: 20.6,  volume: 4400000 },
  { symbol: 'TATAMOTORS',name: 'Tata Motors Ltd',                   sector: 'Automobile',         marketCap: 320000,  peRatio: 14.8, high52w: 1180, low52w: 600,  eps: 65.6,  volume: 7200000 },
  { symbol: 'TITAN',     name: 'Titan Company Ltd',                 sector: 'Consumer Discretionary', marketCap: 310000, peRatio: 86.5, high52w: 3900, low52w: 2900, eps: 41.2, volume: 1600000 },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation of India Ltd', sector: 'Energy',           marketCap: 280000,  peRatio: 18.6, high52w: 370,  low52w: 220,  eps: 16.5,  volume: 5800000 },
  { symbol: 'HCLTECH',   name: 'HCL Technologies Ltd',              sector: 'IT',                 marketCap: 420000,  peRatio: 27.4, high52w: 1980, low52w: 1240, eps: 56.8,  volume: 1900000 },
  { symbol: 'ULTRACEMCO',name: 'UltraTech Cement Ltd',              sector: 'Materials',          marketCap: 320000,  peRatio: 42.6, high52w: 12100,low52w: 8500, eps: 257.0, volume: 600000  },
  { symbol: 'ADANIPORTS',name: 'Adani Ports and SEZ Ltd',           sector: 'Industrials',        marketCap: 290000,  peRatio: 32.4, high52w: 1620, low52w: 980,  eps: 41.8,  volume: 3200000 },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd',                  sector: 'Consumer Staples',   marketCap: 240000,  peRatio: 75.0, high52w: 2780, low52w: 2080, eps: 33.0,  volume: 700000  },
];

const TEAM = [
  { name: 'Team Member 1', email: 'teammate1@papertrade.in' },
  { name: 'Team Member 2', email: 'teammate2@papertrade.in' },
  { name: 'Team Member 3', email: 'teammate3@papertrade.in' },
  { name: 'Team Member 4', email: 'teammate4@papertrade.in' },
  { name: 'Team Member 5', email: 'teammate5@papertrade.in' },
  { name: 'Team Member 6', email: 'teammate6@papertrade.in' },
];

const STARTING_BALANCE = 100000;
const PASSWORD = 'password123';
const MPIN = '1234';

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  await initSchema();
  console.log('\n[seed] starting full demo seed' + (RESET ? ' (RESET mode)' : ''));

  const raw = getRawDb();

  if (RESET) {
    console.log('[seed] dropping user-data tables...');
    raw.exec(`
      DELETE FROM wallet_transactions;
      DELETE FROM portfolio_history;
      DELETE FROM price_alerts;
      DELETE FROM notifications;
      DELETE FROM watchlist_items;
      DELETE FROM watchlists;
      DELETE FROM transactions;
      DELETE FROM orders;
      DELETE FROM holdings;
      DELETE FROM users;
    `);
  }

  // ── Stocks ──
  const insertStock = raw.prepare(
    `INSERT INTO stocks (symbol, name, exchange, sector, market_cap, pe_ratio, high_52w, low_52w, eps, volume, about, category)
     VALUES (?, ?, 'NSE', ?, ?, ?, ?, ?, ?, ?, ?, 'stock')
     ON CONFLICT(symbol, exchange) DO NOTHING`,
  );
  let stocksAdded = 0;
  for (const s of DEMO_STOCKS) {
    const r = insertStock.run(
      s.symbol, s.name, s.sector, s.marketCap, s.peRatio,
      s.high52w, s.low52w, s.eps, s.volume,
      `${s.name} — ${s.sector} sector NIFTY 500 constituent.`,
    );
    if (r.changes) stocksAdded++;
  }
  console.log(`[seed] stocks: +${stocksAdded} new (full NIFTY 500 will be ingested on server start)`);

  // ── Admin ──
  const ADMIN_EMAIL = 'yogesh.nithyanandam@gmail.com';
  const ADMIN_PW_HASH = await bcrypt.hash('admin123', 10);
  const ADMIN_MPIN_HASH = await bcrypt.hash(MPIN, 10);
  const adminRow = raw
    .prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`)
    .get(ADMIN_EMAIL) as any;
  let adminId: number;
  if (adminRow) {
    adminId = adminRow.id;
    raw.prepare(`UPDATE users SET role = 'admin', password = ?, mpin_hash = ? WHERE id = ?`)
      .run(ADMIN_PW_HASH, ADMIN_MPIN_HASH, adminId);
    console.log(`[seed] admin: refreshed (${ADMIN_EMAIL})`);
  } else {
    const r = raw.prepare(
      `INSERT INTO users (name, email, password, role, balance, mpin_hash) VALUES (?, ?, ?, 'admin', ?, ?)`,
    ).run('Yogesh Nithyanandam', ADMIN_EMAIL, ADMIN_PW_HASH, STARTING_BALANCE * 5, ADMIN_MPIN_HASH);
    adminId = Number(r.lastInsertRowid);
    console.log(`[seed] admin: created (${ADMIN_EMAIL} / admin123)`);
  }

  // ── Team users ──
  const teamPwHash = await bcrypt.hash(PASSWORD, 10);
  const teamMpinHash = await bcrypt.hash(MPIN, 10);
  const insertUser = raw.prepare(
    `INSERT INTO users (name, email, password, role, balance, mpin_hash) VALUES (?, ?, ?, 'user', ?, ?)`,
  );
  const findUser = raw.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`);

  const teamIds: number[] = [];
  for (const t of TEAM) {
    const existing = findUser.get(t.email) as any;
    let userId: number;
    if (existing) {
      userId = existing.id;
      raw.prepare(`UPDATE users SET name = ?, password = ?, mpin_hash = ?, balance = ? WHERE id = ?`)
        .run(t.name, teamPwHash, teamMpinHash, STARTING_BALANCE, userId);
    } else {
      const r = insertUser.run(t.name, t.email, teamPwHash, STARTING_BALANCE, teamMpinHash);
      userId = Number(r.lastInsertRowid);
    }
    teamIds.push(userId);
  }
  console.log(`[seed] team users: ${teamIds.length} ready (password=${PASSWORD}, MPIN=${MPIN})`);

  // ── Per-user demo data: holdings + watchlist + sample orders/transactions + wallet ──
  const insertHolding = raw.prepare(
    `INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = excluded.quantity, avg_buy_price = excluded.avg_buy_price`,
  );
  const insertWatchlist = raw.prepare(`INSERT INTO watchlists (user_id, name) VALUES (?, ?)`);
  const insertWatchItem = raw.prepare(
    `INSERT INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)
     ON CONFLICT(watchlist_id, symbol) DO NOTHING`,
  );
  const insertOrder = raw.prepare(
    `INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, status, filled_at)
     VALUES (?, ?, 'MARKET', ?, ?, ?, 'FILLED', datetime('now'))`,
  );
  const insertTxn = raw.prepare(
    `INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateBalance = raw.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`);
  const insertWallet = raw.prepare(
    `INSERT INTO wallet_transactions (user_id, type, amount) VALUES (?, 'DEPOSIT', ?)`,
  );
  const insertWatchlistName = (uid: number, name: string): number => {
    const r = insertWatchlist.run(uid, name);
    return Number(r.lastInsertRowid);
  };

  for (const uid of teamIds) {
    // Wipe existing demo data for this user (keeps balance reset above clean)
    raw.prepare(`DELETE FROM holdings WHERE user_id = ?`).run(uid);
    raw.prepare(`DELETE FROM transactions WHERE user_id = ?`).run(uid);
    raw.prepare(`DELETE FROM orders WHERE user_id = ?`).run(uid);
    raw.prepare(`DELETE FROM watchlist_items WHERE watchlist_id IN (SELECT id FROM watchlists WHERE user_id = ?)`).run(uid);
    raw.prepare(`DELETE FROM watchlists WHERE user_id = ?`).run(uid);
    raw.prepare(`DELETE FROM wallet_transactions WHERE user_id = ?`).run(uid);

    // Initial deposit log
    insertWallet.run(uid, STARTING_BALANCE);

    // 3-5 random holdings
    const universe = [...DEMO_STOCKS];
    const numHoldings = randInt(3, 5);
    let totalSpent = 0;
    const usedSyms = new Set<string>();
    for (let i = 0; i < numHoldings; i++) {
      const s = universe.splice(randInt(0, universe.length - 1), 1)[0];
      if (!s || usedSyms.has(s.symbol)) continue;
      usedSyms.add(s.symbol);
      const qty = randInt(1, 8);
      // pick a buy price between 92%-105% of mid 52w
      const mid = (s.high52w + s.low52w) / 2;
      const px = +(mid * (0.92 + Math.random() * 0.13)).toFixed(2);
      const cost = px * qty;
      if (totalSpent + cost > STARTING_BALANCE * 0.7) break; // keep ~30% cash
      insertHolding.run(uid, s.symbol, qty, px);
      // matching order + transaction history
      const orderRes = insertOrder.run(uid, s.symbol, 'BUY', qty, px);
      insertTxn.run(uid, Number(orderRes.lastInsertRowid), s.symbol, 'BUY', qty, px, cost);
      totalSpent += cost;
    }
    updateBalance.run(totalSpent, uid);

    // Watchlist
    const wlId = insertWatchlistName(uid, 'My Watchlist');
    const wlPicks = [...DEMO_STOCKS]
      .sort(() => Math.random() - 0.5)
      .slice(0, randInt(6, 10));
    for (const w of wlPicks) insertWatchItem.run(wlId, w.symbol);

    // A pending limit order (one per user) so the Orders page has something to show
    const pendingPick = rand(DEMO_STOCKS);
    const pendingMid = (pendingPick.high52w + pendingPick.low52w) / 2;
    raw.prepare(
      `INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, status)
       VALUES (?, ?, 'LIMIT', 'BUY', ?, ?, ?, 'PENDING')`,
    ).run(uid, pendingPick.symbol, randInt(1, 5), pendingMid, +(pendingMid * 0.95).toFixed(2));

    // Welcome notification
    raw.prepare(
      `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'system')`,
    ).run(uid, 'Welcome to Paper Portfolio', 'Your demo wallet is loaded with ₹1,00,000. Start exploring the markets!');
  }

  console.log('[seed] holdings, watchlists, orders, transactions, notifications populated');

  // ── Summary ──
  const userCount = (raw.prepare(`SELECT COUNT(*) as c FROM users`).get() as any).c;
  const stockCount = (raw.prepare(`SELECT COUNT(*) as c FROM stocks`).get() as any).c;
  const holdingCount = (raw.prepare(`SELECT COUNT(*) as c FROM holdings`).get() as any).c;
  const txnCount = (raw.prepare(`SELECT COUNT(*) as c FROM transactions`).get() as any).c;
  const orderCount = (raw.prepare(`SELECT COUNT(*) as c FROM orders`).get() as any).c;
  const wlItemCount = (raw.prepare(`SELECT COUNT(*) as c FROM watchlist_items`).get() as any).c;

  console.log('\n────────────────────────────────────────');
  console.log(' Seed complete');
  console.log('────────────────────────────────────────');
  console.log(` Users:           ${userCount}  (1 admin + ${TEAM.length} teammates)`);
  console.log(` Stocks:          ${stockCount}`);
  console.log(` Holdings:        ${holdingCount}`);
  console.log(` Orders:          ${orderCount}`);
  console.log(` Transactions:    ${txnCount}`);
  console.log(` Watchlist items: ${wlItemCount}`);
  console.log('────────────────────────────────────────');
  console.log(' Login credentials');
  console.log('────────────────────────────────────────');
  console.log(` Admin:    ${ADMIN_EMAIL} / admin123`);
  for (const t of TEAM) {
    console.log(`           ${t.email.padEnd(28)} / ${PASSWORD}`);
  }
  console.log(` MPIN:     ${MPIN} (everyone)`);
  console.log('────────────────────────────────────────\n');

  await shutdownPool();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
