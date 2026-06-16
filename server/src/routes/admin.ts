import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes } from '../services/marketData.js';
import { logActivity, getClientIp } from '../services/activityLogger.js';
import { manualMisSquareOff } from '../services/orderExecution.js';

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// ---------------------------------------------------------------------------
// GET /api/admin/users — List all users with portfolio summary
// ---------------------------------------------------------------------------
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const users = (await db.prepare(`
      SELECT id, name, email, role, balance, mpin_hash, last_login, created_at FROM users ORDER BY created_at DESC
    `).all()) as any[];

    // Gather holdings for all users
    const allHoldings = (await db.prepare('SELECT * FROM holdings').all()) as any[];
    const uniqueSymbols = Array.from(new Set(allHoldings.map((h: any) => h.symbol)));

    const priceMap = new Map<string, number>();
    if (uniqueSymbols.length) {
      const quotes = getCachedQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
      for (const q of quotes) priceMap.set(q.symbol, q.price);
    }

    // Batch-fetch all transaction counts in one query to avoid N+1
    const txCounts = (await db.prepare(
      `SELECT user_id, COUNT(*) as c FROM transactions GROUP BY user_id`
    ).all()) as any[];
    const txCountMap = new Map<number, number>();
    for (const row of txCounts) txCountMap.set(Number(row.user_id), Number(row.c));

    const enriched = users.map((u: any) => {
      const holdings = allHoldings.filter((h: any) => Number(h.user_id) === Number(u.id));
      let investedValue = 0;
      let currentValue = 0;
      for (const h of holdings) {
        const price = priceMap.get(h.symbol) ?? Number(h.avg_buy_price);
        investedValue += Number(h.avg_buy_price) * Number(h.quantity);
        currentValue += price * Number(h.quantity);
      }
      const totalPnl = currentValue - investedValue;
      const balance = Number(u.balance);
      const totalValue = balance + currentValue;

      return {
        id: Number(u.id),
        name: u.name,
        email: u.email,
        role: u.role,
        balance,
        has_mpin: !!u.mpin_hash,
        last_login: u.last_login || null,
        investedValue: +investedValue.toFixed(2),
        currentValue: +currentValue.toFixed(2),
        totalValue: +totalValue.toFixed(2),
        totalPnl: +totalPnl.toFixed(2),
        holdingsCount: holdings.length,
        transactionCount: txCountMap.get(Number(u.id)) ?? 0,
        created_at: u.created_at,
      };
    });

    res.json({ users: enriched, total: enriched.length });
  } catch (err: any) {
    console.error('[admin/users] error:', err);
    res.status(500).json({ error: 'Failed to fetch users', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id — Detailed user view
// ---------------------------------------------------------------------------
router.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const userId = +req.params.id;
    const user = (await db.prepare('SELECT id, name, email, role, balance, created_at FROM users WHERE id = ?').get(userId)) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const holdings = (await db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId)) as any[];
    const transactions = (await db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId)) as any[];
    const orders = (await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId)) as any[];

    // Enrich holdings with live prices
    if (holdings.length) {
      const quotes = getCachedQuotes(holdings.map((h: any) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
      const pm = new Map(quotes.map((q) => [q.symbol, q.price]));
      for (const h of holdings) {
        const price = pm.get(h.symbol) ?? Number(h.avg_buy_price);
        h.current_price = price;
        h.current_value = +(price * Number(h.quantity)).toFixed(2);
        h.pnl = +((price - Number(h.avg_buy_price)) * Number(h.quantity)).toFixed(2);
        h.avg_buy_price = Number(h.avg_buy_price);
        h.quantity = Number(h.quantity);
      }
    }

    res.json({
      user: { ...user, balance: Number(user.balance) },
      holdings,
      transactions,
      orders,
    });
  } catch (err: any) {
    console.error('[admin/users/:id] error:', err);
    res.status(500).json({ error: 'Failed to fetch user', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reset-balance — Reset user balance
// ---------------------------------------------------------------------------
router.post('/users/:id/reset-balance', async (req: AuthRequest, res) => {
  const { balance } = req.body;
  if (typeof balance !== 'number' || balance < 0) {
    return res.status(400).json({ error: 'Invalid balance amount' });
  }
  try {
    const targetId = +req.params.id;
    const prev = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(targetId)) as any;
    const prevBalance = Number(prev?.balance ?? 0);
    await db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, targetId);
    // Record as wallet transaction so P&L capital basis stays accurate
    const diff = balance - prevBalance;
    if (diff !== 0) {
      await db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount) VALUES (?, ?, ?)`)
        .run(targetId, diff > 0 ? 'DEPOSIT' : 'WITHDRAW', Math.abs(diff));
    }
    logActivity(req.user!.id, 'BALANCE_RESET', { targetUserId: targetId, prevBalance, newBalance: balance }, getClientIp(req));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset balance' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/topup — Add funds to user balance
// ---------------------------------------------------------------------------
router.post('/users/:id/topup', async (req: AuthRequest, res) => {
  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid top-up amount' });
  }
  try {
    const targetId = +req.params.id;
    await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, targetId);
    await db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount) VALUES (?, 'DEPOSIT', ?)`)
      .run(targetId, amount);
    const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(targetId)) as any;
    logActivity(req.user!.id, 'BALANCE_TOPUP' as any, { targetUserId: targetId, topupAmount: amount, newBalance: Number(user?.balance ?? 0) }, getClientIp(req));
    res.json({ success: true, newBalance: Number(user?.balance ?? 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to top up balance' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/mis-squareoff — Force-cover all open MIS short/long
// positions for a specific user (or omit :id path for all users).
// Used to resolve positions stuck from a missed auto-squareoff.
// ---------------------------------------------------------------------------
router.post('/users/:id/mis-squareoff', async (req: AuthRequest, res) => {
  const userId = +req.params.id;
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const result = await manualMisSquareOff(userId);
    logActivity(req.user!.id, 'ADMIN_MIS_SQUAREOFF' as any, { targetUserId: userId, ...result }, getClientIp(req));
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[admin/mis-squareoff] error:', err);
    res.status(500).json({ error: 'Square-off failed', detail: err?.message });
  }
});

// POST /api/admin/mis-squareoff — Force-cover all open MIS positions across all users
router.post('/mis-squareoff', async (req: AuthRequest, res) => {
  try {
    const result = await manualMisSquareOff();
    logActivity(req.user!.id, 'ADMIN_MIS_SQUAREOFF_ALL' as any, result, getClientIp(req));
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[admin/mis-squareoff-all] error:', err);
    res.status(500).json({ error: 'Square-off failed', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id — Delete a user (not self)
// ---------------------------------------------------------------------------
router.delete('/users/:id', async (req: AuthRequest, res) => {
  const userId = +req.params.id;
  if (userId === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  const user = (await db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId)) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  // FK ON DELETE CASCADE handles all child rows automatically
  await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  logActivity(req.user!.id, 'USER_DELETED', {
    deletedUserId: userId,
    deletedEmail: user.email,
  }, getClientIp(req));
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats — Platform-wide stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const userCount  = Number(((await db.prepare('SELECT COUNT(*) as c FROM users').get()) as any)?.c ?? 0);
    const txCount    = Number(((await db.prepare('SELECT COUNT(*) as c FROM transactions').get()) as any)?.c ?? 0);
    const orderCount = Number(((await db.prepare('SELECT COUNT(*) as c FROM orders').get()) as any)?.c ?? 0);
    const totalBalance = Number(((await db.prepare('SELECT SUM(balance) as s FROM users').get()) as any)?.s ?? 0);
    const holdingsCount = Number(((await db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM holdings WHERE quantity > 0').get()) as any)?.c ?? 0);
    const activityCount = Number(((await db.prepare('SELECT COUNT(*) as c FROM activity_log').get()) as any)?.c ?? 0);
    const todayActivityCount = Number(((await db.prepare(
      `SELECT COUNT(*) as c FROM activity_log WHERE created_at >= datetime('now', '-1 day')`
    ).get()) as any)?.c ?? 0);

    res.json({
      userCount,
      activeTraders: holdingsCount,
      totalTransactions: txCount,
      totalOrders: orderCount,
      totalCashInSystem: +totalBalance.toFixed(2),
      totalActivities: activityCount,
      todayActivities: todayActivityCount,
    });
  } catch (err: any) {
    console.error('[admin/stats] error:', err);
    res.status(500).json({ error: 'Failed to fetch stats', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/activity — Paginated activity feed
// ---------------------------------------------------------------------------
router.get('/activity', async (req: AuthRequest, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || '1')) || 1, 1);
    const limit = Math.min(parseInt(String(req.query.limit || '50')) || 50, 200);
    const offset = (page - 1) * limit;
    const userId = req.query.userId ? +req.query.userId : null;
    const action = req.query.action ? String(req.query.action) : null;

    const where: string[] = [];
    const params: any[] = [];

    if (userId) {
      where.push('a.user_id = ?');
      params.push(userId);
    }
    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = (await db.prepare(
      `SELECT COUNT(*) as total FROM activity_log a ${whereSql}`
    ).get(...params)) as any;
    const total = Number(countResult?.total ?? 0);

    const rows = (await db.prepare(`
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)) as any[];

    // Parse JSON details for each row
    const activities = rows.map(r => {
      let details = r.details;
      if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch {}
      }
      return {
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name || 'Unknown',
        user_email: r.user_email || '',
        action: r.action,
        details,
        ip_address: r.ip_address,
        created_at: r.created_at,
      };
    });

    // Get distinct action types for filter dropdown
    const actionTypes = ((await db.prepare(
      'SELECT DISTINCT action FROM activity_log ORDER BY action'
    ).all()) as any[]).map(r => r.action);

    res.json({
      activities,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      actionTypes,
    });
  } catch (err: any) {
    console.error('[admin/activity] error:', err);
    res.status(500).json({ error: 'Failed to fetch activity', detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/analytics — Platform-wide analytics with date-range filter
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to last 30 days)
// ---------------------------------------------------------------------------
router.get('/analytics', async (req: AuthRequest, res) => {
  try {
    // ── Parse date range ──
    const toRaw = String(req.query.to || '').trim();
    const fromRaw = String(req.query.from || '').trim();
    const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    const today = new Date();
    const defaultTo = today.toISOString().slice(0, 10);
    const defaultFromDate = new Date(today);
    defaultFromDate.setDate(defaultFromDate.getDate() - 29);
    const defaultFrom = defaultFromDate.toISOString().slice(0, 10);

    const from = isISO(fromRaw) ? fromRaw : defaultFrom;
    const to = isISO(toRaw) ? toRaw : defaultTo;
    // SQLite datetime() comparison: use inclusive end-of-day for `to`
    const fromTs = `${from} 00:00:00`;
    const toTs = `${to} 23:59:59`;

    // ── KPIs in range ──
    const newUsers = Number(((await db.prepare(
      `SELECT COUNT(*) as c FROM users WHERE created_at BETWEEN ? AND ?`
    ).get(fromTs, toTs)) as any)?.c ?? 0);

    const activeUsers = Number(((await db.prepare(
      `SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at BETWEEN ? AND ?`
    ).get(fromTs, toTs)) as any)?.c ?? 0);

    const tradeAgg = ((await db.prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(total_amount), 0) as volume,
         COALESCE(SUM(CASE WHEN type='BUY' THEN 1 ELSE 0 END), 0) as buys,
         COALESCE(SUM(CASE WHEN type='SELL' THEN 1 ELSE 0 END), 0) as sells,
         COALESCE(SUM(CASE WHEN type='BUY' THEN total_amount ELSE 0 END), 0) as buy_volume,
         COALESCE(SUM(CASE WHEN type='SELL' THEN total_amount ELSE 0 END), 0) as sell_volume
       FROM transactions WHERE created_at BETWEEN ? AND ?`
    ).get(fromTs, toTs)) as any) || {};

    const realizedAgg = ((await db.prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(realized_pnl), 0) as total,
         COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
         COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END), 0) as losses
       FROM trade_pnl WHERE closed_at BETWEEN ? AND ?`
    ).get(fromTs, toTs)) as any) || {};

    const loginsInRange = Number(((await db.prepare(
      `SELECT COUNT(*) as c FROM activity_log
       WHERE action IN ('USER_LOGIN','MPIN_LOGIN') AND created_at BETWEEN ? AND ?`
    ).get(fromTs, toTs)) as any)?.c ?? 0);

    const largestTrade = ((await db.prepare(
      `SELECT t.symbol, t.type, t.quantity, t.price, t.total_amount, t.created_at,
              u.name as user_name, u.email as user_email
       FROM transactions t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.created_at BETWEEN ? AND ?
       ORDER BY t.total_amount DESC LIMIT 1`
    ).get(fromTs, toTs)) as any) || null;

    // ── Current/all-time snapshot KPIs ──
    const totalUsers = Number(((await db.prepare('SELECT COUNT(*) as c FROM users').get()) as any)?.c ?? 0);
    const totalCash = Number(((await db.prepare('SELECT COALESCE(SUM(balance),0) as s FROM users').get()) as any)?.s ?? 0);
    const distinctHolders = Number(((await db.prepare(
      `SELECT COUNT(DISTINCT user_id) as c FROM holdings WHERE quantity > 0`
    ).get()) as any)?.c ?? 0);

    // Live holdings valuation (snapshot, today)
    const allHoldings = (await db.prepare(`SELECT user_id, symbol, quantity, avg_buy_price FROM holdings WHERE quantity > 0`).all()) as any[];
    let investedValueAll = 0;
    let currentValueAll = 0;
    if (allHoldings.length) {
      const symbols = Array.from(new Set(allHoldings.map((h: any) => h.symbol)));
      const quotes = getCachedQuotes(symbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
      const pm = new Map(quotes.map((q) => [q.symbol, q.price]));
      for (const h of allHoldings) {
        const price = pm.get(h.symbol) ?? Number(h.avg_buy_price);
        investedValueAll += Number(h.avg_buy_price) * Number(h.quantity);
        currentValueAll += price * Number(h.quantity);
      }
    }
    const unrealizedPnlAll = currentValueAll - investedValueAll;
    const aum = totalCash + currentValueAll;

    // ── Time-series (daily) ──
    const dailyTrades = (await db.prepare(
      `SELECT date(created_at) as day,
              COUNT(*) as count,
              COALESCE(SUM(CASE WHEN type='BUY' THEN 1 ELSE 0 END), 0) as buys,
              COALESCE(SUM(CASE WHEN type='SELL' THEN 1 ELSE 0 END), 0) as sells,
              COALESCE(SUM(total_amount), 0) as volume
       FROM transactions
       WHERE created_at BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`
    ).all(fromTs, toTs)) as any[];

    const dailyRealized = (await db.prepare(
      `SELECT date(closed_at) as day,
              COALESCE(SUM(realized_pnl), 0) as realized,
              COUNT(*) as trades
       FROM trade_pnl
       WHERE closed_at BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`
    ).all(fromTs, toTs)) as any[];

    const dailyNewUsers = (await db.prepare(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM users WHERE created_at BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`
    ).all(fromTs, toTs)) as any[];

    const dailyActiveUsers = (await db.prepare(
      `SELECT date(created_at) as day, COUNT(DISTINCT user_id) as count
       FROM activity_log WHERE created_at BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`
    ).all(fromTs, toTs)) as any[];

    // ── Top lists ──
    const topStocks = (await db.prepare(
      `SELECT symbol,
              COUNT(*) as trades,
              COALESCE(SUM(total_amount), 0) as volume,
              COALESCE(SUM(CASE WHEN type='BUY' THEN total_amount ELSE 0 END), 0) as buy_volume,
              COALESCE(SUM(CASE WHEN type='SELL' THEN total_amount ELSE 0 END), 0) as sell_volume
       FROM transactions WHERE created_at BETWEEN ? AND ?
       GROUP BY symbol ORDER BY volume DESC LIMIT 10`
    ).all(fromTs, toTs)) as any[];

    const topTraders = (await db.prepare(
      `SELECT u.id as user_id, u.name, u.email,
              COUNT(t.id) as trades,
              COALESCE(SUM(t.total_amount), 0) as volume
       FROM transactions t JOIN users u ON u.id = t.user_id
       WHERE t.created_at BETWEEN ? AND ?
       GROUP BY u.id ORDER BY volume DESC LIMIT 10`
    ).all(fromTs, toTs)) as any[];

    const topWinners = (await db.prepare(
      `SELECT u.id as user_id, u.name, u.email,
              COALESCE(SUM(p.realized_pnl), 0) as realized,
              COUNT(p.id) as closed_trades
       FROM trade_pnl p JOIN users u ON u.id = p.user_id
       WHERE p.closed_at BETWEEN ? AND ?
       GROUP BY u.id HAVING realized > 0 ORDER BY realized DESC LIMIT 10`
    ).all(fromTs, toTs)) as any[];

    const topLosers = (await db.prepare(
      `SELECT u.id as user_id, u.name, u.email,
              COALESCE(SUM(p.realized_pnl), 0) as realized,
              COUNT(p.id) as closed_trades
       FROM trade_pnl p JOIN users u ON u.id = p.user_id
       WHERE p.closed_at BETWEEN ? AND ?
       GROUP BY u.id HAVING realized < 0 ORDER BY realized ASC LIMIT 10`
    ).all(fromTs, toTs)) as any[];

    const actionBreakdown = (await db.prepare(
      `SELECT action, COUNT(*) as count FROM activity_log
       WHERE created_at BETWEEN ? AND ?
       GROUP BY action ORDER BY count DESC LIMIT 15`
    ).all(fromTs, toTs)) as any[];

    // Sector volume distribution — joins on stocks.sector when available
    const sectorBreakdown = (await db.prepare(
      `SELECT COALESCE(s.sector, 'Other') as sector,
              COUNT(t.id) as trades,
              COALESCE(SUM(t.total_amount), 0) as volume
       FROM transactions t
       LEFT JOIN stocks s ON s.symbol = t.symbol
       WHERE t.created_at BETWEEN ? AND ?
       GROUP BY sector ORDER BY volume DESC LIMIT 12`
    ).all(fromTs, toTs)) as any[];

    res.json({
      range: { from, to },
      kpis: {
        // In-range
        newUsers,
        activeUsers,
        loginsInRange,
        tradesCount: Number(tradeAgg.count || 0),
        tradesBuy: Number(tradeAgg.buys || 0),
        tradesSell: Number(tradeAgg.sells || 0),
        tradeVolume: +Number(tradeAgg.volume || 0).toFixed(2),
        buyVolume: +Number(tradeAgg.buy_volume || 0).toFixed(2),
        sellVolume: +Number(tradeAgg.sell_volume || 0).toFixed(2),
        realizedPnl: +Number(realizedAgg.total || 0).toFixed(2),
        closedTrades: Number(realizedAgg.count || 0),
        winningTrades: Number(realizedAgg.wins || 0),
        losingTrades: Number(realizedAgg.losses || 0),
        avgTradeSize: tradeAgg.count ? +((Number(tradeAgg.volume || 0) / Number(tradeAgg.count)).toFixed(2)) : 0,
        // Snapshot (current)
        totalUsers,
        activeHolders: distinctHolders,
        totalCash: +totalCash.toFixed(2),
        investedValue: +investedValueAll.toFixed(2),
        currentValue: +currentValueAll.toFixed(2),
        unrealizedPnl: +unrealizedPnlAll.toFixed(2),
        aum: +aum.toFixed(2),
      },
      largestTrade: largestTrade ? {
        symbol: largestTrade.symbol,
        type: largestTrade.type,
        quantity: Number(largestTrade.quantity),
        price: Number(largestTrade.price),
        total: +Number(largestTrade.total_amount).toFixed(2),
        createdAt: largestTrade.created_at,
        userName: largestTrade.user_name,
        userEmail: largestTrade.user_email,
      } : null,
      series: {
        dailyTrades: dailyTrades.map((r: any) => ({
          day: r.day,
          count: Number(r.count),
          buys: Number(r.buys),
          sells: Number(r.sells),
          volume: +Number(r.volume).toFixed(2),
        })),
        dailyRealized: dailyRealized.map((r: any) => ({
          day: r.day,
          realized: +Number(r.realized).toFixed(2),
          trades: Number(r.trades),
        })),
        dailyNewUsers: dailyNewUsers.map((r: any) => ({ day: r.day, count: Number(r.count) })),
        dailyActiveUsers: dailyActiveUsers.map((r: any) => ({ day: r.day, count: Number(r.count) })),
      },
      topStocks: topStocks.map((r: any) => ({
        symbol: r.symbol,
        trades: Number(r.trades),
        volume: +Number(r.volume).toFixed(2),
        buyVolume: +Number(r.buy_volume).toFixed(2),
        sellVolume: +Number(r.sell_volume).toFixed(2),
      })),
      topTraders: topTraders.map((r: any) => ({
        userId: Number(r.user_id),
        name: r.name,
        email: r.email,
        trades: Number(r.trades),
        volume: +Number(r.volume).toFixed(2),
      })),
      topWinners: topWinners.map((r: any) => ({
        userId: Number(r.user_id),
        name: r.name,
        email: r.email,
        realized: +Number(r.realized).toFixed(2),
        closedTrades: Number(r.closed_trades),
      })),
      topLosers: topLosers.map((r: any) => ({
        userId: Number(r.user_id),
        name: r.name,
        email: r.email,
        realized: +Number(r.realized).toFixed(2),
        closedTrades: Number(r.closed_trades),
      })),
      actionBreakdown: actionBreakdown.map((r: any) => ({ action: r.action, count: Number(r.count) })),
      sectorBreakdown: sectorBreakdown.map((r: any) => ({
        sector: r.sector,
        trades: Number(r.trades),
        volume: +Number(r.volume).toFixed(2),
      })),
    });
  } catch (err: any) {
    console.error('[admin/analytics] error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics', detail: err?.message });
  }
});

export default router;
