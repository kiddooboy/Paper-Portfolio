import { getRawDb, initSchema, shutdownPool } from '../db/index.js';
import bcrypt from 'bcryptjs';

// ────────────────────────────────────────────────────────────────────────────
// Paper Portfolio — minimal user seed.
//
// Creates ONLY the user accounts. No demo holdings, orders, transactions,
// watchlists, notifications, or wallet entries — every user starts with a
// clean slate so the trading ecosystem produces fully authentic data:
//
//   • Stocks (NIFTY 500) are auto-ingested from the NSE master list on
//     server start (services/symbolIngest.ts).
//   • Live prices come from Yahoo Finance via the centralised market-data
//     poller (services/marketData.ts).
//   • Holdings, orders, transactions, notifications, watchlists, and wallet
//     entries are produced by real user activity through the trading
//     routes (routes/orders.ts, routes/watchlist.ts, etc.).
//
// Users seeded:
//   • Admin   — yogesh.nithyanandam@gmail.com / admin123
//   • 6 team  — teammate1..6@papertrade.in    / password123
//   • MPIN    — 1234 (everyone)
//
// Each user is given the standard ₹1,00,000 starting balance.
//
// Usage:
//   npm run seed              # additive (creates users only if missing)
//   npm run reset-db          # WIPES all data then re-creates users
// ────────────────────────────────────────────────────────────────────────────

const RESET = process.argv.includes('--reset');

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
const ADMIN_PASSWORD = 'admin123';
const MPIN = '1234';

async function seed() {
  await initSchema();
  console.log('\n[seed] starting' + (RESET ? ' (RESET mode — wiping all data)' : ''));

  const raw = getRawDb();

  if (RESET) {
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
    console.log('[seed] all user-data tables cleared');
  }

  const pwHash = await bcrypt.hash(PASSWORD, 10);
  const adminPwHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const mpinHash = await bcrypt.hash(MPIN, 10);

  const findUser = raw.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE');
  const insertUser = raw.prepare(
    `INSERT INTO users (name, email, password, role, balance, mpin_hash) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateUser = raw.prepare(
    `UPDATE users SET name = ?, password = ?, role = ?, balance = ?, mpin_hash = ? WHERE id = ?`,
  );

  // ── Admin ──
  const ADMIN_EMAIL = 'yogesh.nithyanandam@gmail.com';
  const adminRow = findUser.get(ADMIN_EMAIL) as any;
  if (adminRow) {
    if (RESET) {
      updateUser.run('Yogesh Nithyanandam', adminPwHash, 'admin', STARTING_BALANCE * 5, mpinHash, adminRow.id);
      console.log(`[seed] admin: refreshed (${ADMIN_EMAIL})`);
    } else {
      console.log(`[seed] admin: already exists, leaving as-is (${ADMIN_EMAIL})`);
    }
  } else {
    insertUser.run('Yogesh Nithyanandam', ADMIN_EMAIL, adminPwHash, 'admin', STARTING_BALANCE * 5, mpinHash);
    console.log(`[seed] admin: created (${ADMIN_EMAIL} / ${ADMIN_PASSWORD})`);
  }

  // ── Team users ──
  let created = 0;
  let refreshed = 0;
  for (const t of TEAM) {
    const existing = findUser.get(t.email) as any;
    if (existing) {
      if (RESET) {
        updateUser.run(t.name, pwHash, 'user', STARTING_BALANCE, mpinHash, existing.id);
        refreshed++;
      }
    } else {
      insertUser.run(t.name, t.email, pwHash, 'user', STARTING_BALANCE, mpinHash);
      created++;
    }
  }
  console.log(`[seed] team users: ${created} new, ${refreshed} refreshed (total ${TEAM.length})`);

  // ── Summary ──
  const userCount = (raw.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const stockCount = (raw.prepare('SELECT COUNT(*) as c FROM stocks').get() as any).c;

  console.log('\n────────────────────────────────────────');
  console.log(' Seed complete');
  console.log('────────────────────────────────────────');
  console.log(` Users:           ${userCount}  (1 admin + ${TEAM.length} teammates)`);
  console.log(` Stocks:          ${stockCount}  (auto-ingested from NSE on server start)`);
  console.log(' Holdings/Orders/Watchlists/etc: 0 (created by real trading activity)');
  console.log('────────────────────────────────────────');
  console.log(' Login credentials');
  console.log('────────────────────────────────────────');
  console.log(` Admin:    ${ADMIN_EMAIL.padEnd(28)} / ${ADMIN_PASSWORD}`);
  for (const t of TEAM) {
    console.log(`           ${t.email.padEnd(28)} / ${PASSWORD}`);
  }
  console.log(` MPIN:     ${MPIN} (everyone)`);
  console.log(` Balance:  ₹${STARTING_BALANCE.toLocaleString('en-IN')} per user (admin gets 5x)`);
  console.log('────────────────────────────────────────\n');

  await shutdownPool();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
