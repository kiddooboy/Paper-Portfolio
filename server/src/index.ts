// Dev-only: allow corporate proxy / self-signed intermediates (SSL MITM).
// Must be set before any HTTPS agent is created.
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema, db } from './db/index.js';
import cron from 'node-cron';
import { fillOrder } from './routes/orders.js';
import { getQuote, getQuotes, getIndices, isMarketOpen, NIFTY50 } from './services/marketData.js';
import { ingestSymbols } from './services/symbolIngest.js';
import { startOrderExecutionScheduler } from './services/orderExecution.js';

import authRoutes from './routes/auth.js';
import stockRoutes from './routes/stocks.js';
import orderRoutes from './routes/orders.js';
import portfolioRoutes from './routes/portfolio.js';
import watchlistRoutes from './routes/watchlist.js';
import notificationRoutes from './routes/notifications.js';
import leaderboardRoutes from './routes/leaderboard.js';
import adminRoutes from './routes/admin.js';
import insightsRoutes from './routes/insights.js';
import aiRoutes from './routes/ai.js';
import walletRoutes from './routes/wallet.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  await initSchema();

  // Kick off symbol ingestion in background; don't block server start.
  ingestSymbols().catch((e) => console.warn('[symbols] ingest failed:', e?.message || e));

  // Start order execution scheduler for end-of-day order processing
  startOrderExecutionScheduler();

  const app = express();
  const PORT = process.env.PORT || 5000;

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/stocks', stockRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/watchlists', watchlistRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/wallet', walletRoutes);

  // Serve static client build and SPA fallback in production (registered AFTER api routes)
  if (process.env.NODE_ENV === 'production') {
    const clientDistPath = path.join(process.cwd(), 'client', 'dist');
    app.use(express.static(clientDistPath));

    // SPA fallback: any non-API GET returns index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  async function checkLimitOrders() {
    const pending = db
      .prepare(`SELECT * FROM orders WHERE status = 'PENDING' AND type = 'LIMIT'`)
      .all() as any[];
    if (!pending.length) return;

    const uniqueSymbols = Array.from(new Set(pending.map((o) => o.symbol)));
    const quotes = await getQuotes(
      uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const }))
    );
    const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

    for (const order of pending) {
      const currentPrice = priceMap.get(order.symbol);
      if (currentPrice == null) continue;
      const shouldFill =
        (order.transaction_type === 'BUY' && currentPrice <= order.limit_price) ||
        (order.transaction_type === 'SELL' && currentPrice >= order.limit_price);
      if (shouldFill) {
        fillOrder(
          order.id,
          order.user_id,
          order.symbol,
          order.transaction_type,
          order.quantity,
          currentPrice
        );
      }
    }
  }

  async function checkPriceAlerts() {
    const alerts = db
      .prepare('SELECT * FROM price_alerts WHERE triggered = 0')
      .all() as any[];
    if (!alerts.length) return;

    const uniqueSymbols = Array.from(new Set(alerts.map((a) => a.symbol)));
    const quotes = await getQuotes(
      uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const }))
    );
    const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

    for (const alert of alerts) {
      const price = priceMap.get(alert.symbol);
      if (price == null) continue;
      const triggered =
        (alert.condition === 'above' && price >= alert.target_price) ||
        (alert.condition === 'below' && price <= alert.target_price);
      if (triggered) {
        db.prepare('UPDATE price_alerts SET triggered = 1 WHERE id = ?').run(alert.id);
        db.prepare(
          `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'price_alert')`
        ).run(
          alert.user_id,
          `Price Alert: ${alert.symbol}`,
          `${alert.symbol} is now ${alert.condition === 'above' ? 'above' : 'below'} ₹${alert.target_price}`
        );
      }
    }
  }

  async function recordPortfolioHistory() {
    const users = db.prepare('SELECT id, balance FROM users').all() as any[];
    if (!users.length) return;

    const allHoldings = db.prepare('SELECT * FROM holdings').all() as any[];
    const uniqueSymbols = Array.from(new Set(allHoldings.map((h) => h.symbol)));
    const quotes = uniqueSymbols.length
      ? await getQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })))
      : [];
    const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

    for (const user of users) {
      const holdings = allHoldings.filter((h) => h.user_id === user.id);
      let totalValue = user.balance;
      for (const h of holdings) {
        const price = priceMap.get(h.symbol) ?? h.avg_buy_price;
        totalValue += price * h.quantity;
      }
      db.prepare(
        `INSERT INTO portfolio_history (user_id, total_value, cash_balance) VALUES (?, ?, ?)`
      ).run(user.id, totalValue, user.balance);
    }
  }

  // Every minute during market hours: check pending limit orders and price alerts.
  cron.schedule('*/60 * * * * *', () => {
    if (!isMarketOpen()) return;
    checkLimitOrders().catch(() => {});
    checkPriceAlerts().catch(() => {});
  });

  // Hourly portfolio snapshot.
  cron.schedule('0 * * * *', () => {
    recordPortfolioHistory().catch(() => {});
  });

  // ── Continuous market data poller ──
  // Keeps yfinance data flowing all the time by refreshing quotes for
  // popular symbols (Nifty50) plus any symbols users actively hold or watch.
  // Cache is warmed in background so client requests are always fast.
  async function pollMarketData() {
    try {
      const heldSymbols = (db.prepare(
        `SELECT DISTINCT symbol FROM holdings UNION SELECT DISTINCT symbol FROM watchlist_items`
      ).all() as any[]).map((r) => r.symbol).filter(Boolean);

      const symbols = Array.from(new Set([...NIFTY50, ...heldSymbols]));
      const items = symbols.map((s) => ({ symbol: s, exchange: 'NSE' as const }));

      // Yahoo allows large batches; chunk to avoid url-length issues.
      const CHUNK = 40;
      let total = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        const quotes = await getQuotes(slice);
        total += quotes.length;
      }
      // Also keep indices (NIFTY/SENSEX/BANKNIFTY) cache fresh
      await getIndices();
      const stamp = new Date().toISOString();
      console.log(`[market] poll ok @ ${stamp} — refreshed ${total}/${items.length} symbols (open=${isMarketOpen()})`);
    } catch (err: any) {
      console.warn('[market] poll error:', err?.message || err);
    }
  }

  function schedulePoll() {
    const delay = isMarketOpen() ? 15_000 : 120_000; // 15s live, 2min closed
    setTimeout(async () => {
      await pollMarketData();
      schedulePoll();
    }, delay);
  }

  // Run once immediately, then keep polling.
  pollMarketData().then(() => {
    getQuote('RELIANCE', 'NSE').then((q) => {
      if (q) console.log(`[market] live sample: RELIANCE.NS ₹${q.price} (${q.change_percent.toFixed(2)}%)`);
      else console.warn('[market] live sample failed — check network');
    });
    schedulePoll();
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main();
