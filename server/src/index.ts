// Dev-only: allow corporate proxy / self-signed intermediates (SSL MITM).
// Must be set before any HTTPS agent is created.
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load .env from server directory (go up one level from src/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[config] Loaded .env from:', envPath);
} else {
  console.warn('[config] .env file not found at:', envPath);
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { initSchema, db, shutdownPool } from './db/index.js';
import cron from 'node-cron';
import { getQuote, getQuotes, getHistory, getIndices, isMarketOpen, NIFTY50 } from './services/marketData.js';
import { ingestSymbols } from './services/symbolIngest.js';
import { startOrderExecutionScheduler } from './services/orderExecution.js';
import { recordIndexHistory, backfillIndexHistory } from './services/indexHistory.js';
import { refreshNseHolidays } from './services/nseHolidays.js';
import { generateDailyRecommendations } from './services/dailyRecommendations.js';
import { logActivity } from './services/activityLogger.js';
import { evaluateAlert } from './services/indicators.js';

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
import monteCarloRoutes from './routes/monteCarlo.js';
import newsRoutes from './routes/news.js';
import marketRoutes from './routes/market.js';
import gttRoutes from './routes/gtt.js';
import collectionsRoutes from './routes/collections.js';
import contestsRoutes from './routes/contests.js';
import achievementsRoutes from './routes/achievements.js';
import sipRoutes from './routes/sip.js';
import basketsRoutes from './routes/baskets.js';
import corporateActionsRoutes from './routes/corporateActions.js';
import researchRoutes from './routes/research.js';
import strategiesRoutes from './routes/strategies.js';
import communityRoutes from './routes/community.js';
import foRoutes from './routes/fo.js';
import algoRoutes from './routes/algo.js';
import learnRoutes from './routes/learn.js';

import recommendationsRoutes from './routes/recommendations.js';

const PORT = process.env.PORT || 5000;

async function main() {
  await initSchema();

  // Kick off symbol ingestion in background; don't block server start.
  ingestSymbols().catch((e) => console.warn('[symbols] ingest failed:', e?.message || e));

  // Phase 2: ensure ~1y of Nifty/Sensex closes are available for benchmarking
  backfillIndexHistory(400).catch((e) => console.warn('[indexHistory] backfill failed:', e?.message || e));

  // Seed + live-fetch NSE trading-holiday calendar so isMarketOpen() honors holidays.
  refreshNseHolidays().catch((e) => console.warn('[nseHolidays] initial refresh failed:', e?.message || e));



  // Start order execution scheduler for end-of-day order processing
  startOrderExecutionScheduler();

  const app = express();

  // Gzip all responses (JS, CSS, JSON, HTML) — cuts transfer size by ~70%
  app.use(compression());

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  // Serve uploaded community images (always, not just in production)
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(path.join(uploadsDir, 'community'), { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

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
  app.use('/api/monte-carlo', monteCarloRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/gtt', gttRoutes);
  app.use('/api/collections', collectionsRoutes);
  app.use('/api/contests', contestsRoutes);
  app.use('/api/achievements', achievementsRoutes);
  app.use('/api/sip', sipRoutes);
  app.use('/api/baskets', basketsRoutes);
  app.use('/api/corporate-actions', corporateActionsRoutes);
  app.use('/api/research', researchRoutes);
  app.use('/api/strategies', strategiesRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/fo', foRoutes);
  app.use('/api/algo', algoRoutes);
  app.use('/api/learn', learnRoutes);

  app.use('/api/recommendations', recommendationsRoutes);

  // Serve static client build and SPA fallback in production (registered AFTER api routes)
  if (process.env.NODE_ENV === 'production') {
    const clientDistPath = path.join(process.cwd(), 'client', 'dist');

    // Hashed assets (JS/CSS chunks from Vite) — cache forever, filename changes on update
    app.use('/assets', express.static(path.join(clientDistPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Everything else (fonts, favicon, manifest) — cache 1 day
    app.use(express.static(clientDistPath, { maxAge: '1d' }));

    // SPA fallback: any non-API GET returns index.html (never cached)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  async function checkPriceAlerts() {
    const alerts = (await db
      .prepare('SELECT * FROM price_alerts WHERE triggered = FALSE')
      .all()) as any[];
    if (!alerts.length) return;

    const uniqueSymbols = Array.from(new Set(alerts.map((a) => a.symbol)));
    const quotes = await getQuotes(
      uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const }))
    );
    const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));
    const prevCloseMap = new Map(quotes.map((q) => [q.symbol, q.previous_close]));

    for (const alert of alerts) {
      const price = priceMap.get(alert.symbol);
      if (price == null) continue;

      let triggered = false;

      if (alert.condition_type === 'price' || !alert.condition_type) {
        triggered =
          (alert.condition === 'above' && price >= alert.target_price) ||
          (alert.condition === 'below' && price <= alert.target_price);
      } else {
        try {
          const spec = JSON.parse(alert.condition_spec);
          if (!spec.type) {
            spec.type = alert.condition_type;
          }

          if (alert.condition_type === 'pct_move') {
            const previousClose = prevCloseMap.get(alert.symbol);
            triggered = evaluateAlert({
              bars: [],
              currentPrice: price,
              previousClose,
              spec,
            });
          } else if (alert.condition_type === 'indicator') {
            const historicalBars = await getHistory(
              alert.symbol,
              'NSE',
              new Date(Date.now() - 90 * 24 * 3600 * 1000),
              '1d'
            );
            const closes = historicalBars.map((b: any) => b.close).filter((c: any) => c != null);

            triggered = evaluateAlert({
              bars: closes,
              currentPrice: price,
              previousClose: prevCloseMap.get(alert.symbol),
              spec,
            });
          }
        } catch (err: any) {
          console.warn('[alerts] advanced eval failed for alert ID:', alert.id, err?.message);
        }
      }

      if (triggered) {
        await db.prepare('UPDATE price_alerts SET triggered = TRUE WHERE id = ?').run(alert.id);

        let message = `${alert.symbol} is now ${alert.condition === 'above' ? 'above' : 'below'} ₹${alert.target_price}`;
        if (alert.condition_type === 'indicator') {
          try {
            const spec = JSON.parse(alert.condition_spec);
            message = `${alert.symbol} ${spec.indicator}(${spec.period}) is now ${spec.op.replace('_', ' ')} ${spec.value ?? ''}`;
          } catch {}
        } else if (alert.condition_type === 'pct_move') {
          try {
            const spec = JSON.parse(alert.condition_spec);
            message = `${alert.symbol} moved ${spec.direction} by ${spec.threshold}%`;
          } catch {}
        }

        await db.prepare(
          `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'price_alert')`
        ).run(
          alert.user_id,
          `Alert Triggered: ${alert.symbol}`,
          message
        );
        logActivity(alert.user_id, 'PRICE_ALERT_TRIGGERED', {
          symbol: alert.symbol,
          targetPrice: alert.target_price,
          condition: alert.condition,
          condition_type: alert.condition_type,
          currentPrice: price,
        });
      }
    }
  }

  async function recordPortfolioHistory() {
    const users = (await db.prepare('SELECT id, balance FROM users').all()) as any[];
    if (!users.length) return;

    const allHoldings = (await db.prepare('SELECT * FROM holdings').all()) as any[];
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
      await db.prepare(
        `INSERT INTO portfolio_history (user_id, total_value, cash_balance) VALUES (?, ?, ?)`
      ).run(user.id, totalValue, user.balance);
    }
  }

  // Daily 6:00 AM IST (00:30 UTC) — refresh NSE trading-holiday calendar so
  // isMarketOpen() stays accurate as new holidays are published.
  cron.schedule('30 0 * * *', () => {
    refreshNseHolidays().catch(err => console.error('[cron] nseHolidays error:', err));
  });

  // Daily 8:45 AM IST (3:15 AM UTC) on weekdays — generate AI market recommendations
  cron.schedule('15 3 * * 1-5', () => {
    generateDailyRecommendations().catch(err => console.error('[cron] dailyRecommendations error:', err));
  });

  // 15:35 IST (10:05 UTC) — persist today's Nifty / Sensex close for benchmarking
  cron.schedule('5 10 * * 1-5', () => {
    recordIndexHistory().catch(err => console.error('[cron] indexHistory error:', err));
  });

  // Every minute during market hours: check price alerts.
  // Pending order sweeps (MARKET + LIMIT) are handled by the orderExecution scheduler.
  cron.schedule('*/60 * * * * *', () => {
    if (!isMarketOpen()) return;
    checkPriceAlerts().catch(err => console.error('[cron] checkPriceAlerts error:', err));
  });

  // Hourly portfolio snapshot — only during market hours (9:15–15:30 IST).
  // Off-hours snapshots are stale (prices frozen), so we skip them.
  cron.schedule('0 * * * *', () => {
    if (!isMarketOpen()) return;
    recordPortfolioHistory().catch(err => console.error('[cron] recordPortfolioHistory error:', err));
  });

  // ── Two-tier market data poller ──
  // Tier 1 (fast): Nifty50 + user-held + user-watched symbols every 5s during
  //                market hours, every 2min when closed.
  // Tier 2 (slow): All NSE stocks from DB (~2 000) every 5min during market
  //                hours, every 30min when closed.
  //
  // Stale-while-revalidate in marketData.ts means old data is served when
  // Yahoo is temporarily unavailable — data never vanishes.
  async function pollTier1() {
    try {
      const heldOrWatched = ((await db.prepare(
        `SELECT DISTINCT symbol FROM holdings UNION SELECT DISTINCT symbol FROM watchlist_items`
      ).all()) as any[]).map((r) => r.symbol).filter(Boolean);

      const symbols = Array.from(new Set([...NIFTY50, ...heldOrWatched]));
      const quotes = await getQuotes(symbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })), true);
      await getIndices(true);
      console.log(`[market] tier1 poll — ${quotes.length}/${symbols.length} symbols (open=${isMarketOpen()})`);
    } catch (err: any) {
      console.warn('[market] tier1 poll error:', err?.message ?? err);
    }
  }

  async function pollTier2() {
    try {
      const nifty500 = ((await db.prepare(`SELECT symbol FROM stocks WHERE exchange = 'NSE'`).all()) as any[]).map((r) => r.symbol);
      if (!nifty500.length) return;
      const quotes = await getQuotes(nifty500.map((s) => ({ symbol: s, exchange: 'NSE' as const })), true);
      console.log(`[market] tier2 sweep — ${quotes.length}/${nifty500.length} NSE stocks cached`);
    } catch (err: any) {
      console.warn('[market] tier2 poll error:', err?.message ?? err);
    }
  }

  function scheduleTier1() {
    const delay = isMarketOpen() ? 5_000 : 120_000; // 5s live, 2min closed
    setTimeout(async () => {
      await pollTier1();
      scheduleTier1();
    }, delay);
  }

  function scheduleTier2() {
    const delay = isMarketOpen() ? 300_000 : 1_800_000; // 5min live, 30min closed
    setTimeout(async () => {
      await pollTier2();
      scheduleTier2();
    }, delay);
  }

  // Warm the cache immediately on startup, then start both schedulers.
  pollTier1().then(() => {
    getQuote('RELIANCE', 'NSE', true).then((q) => {
      if (q) console.log(`[market] live sample: RELIANCE.NS ₹${q.price} (${q.change_percent.toFixed(2)}%)`);
      else console.warn('[market] live sample failed — check network / Yahoo availability');
    });
    scheduleTier1();
    // Delay tier2 by 30s so it doesn't pile on top of tier1 startup
    setTimeout(() => {
      pollTier2().then(() => scheduleTier2());
    }, 30_000);
  });

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // ── Graceful shutdown ──
  async function shutdown(signal: string) {
    console.log(`\n[shutdown] ${signal} received — shutting down gracefully…`);
    server.close(() => console.log('[shutdown] HTTP server closed'));
    await shutdownPool();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
