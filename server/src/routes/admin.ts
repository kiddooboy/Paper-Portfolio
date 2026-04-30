import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes } from '../services/marketData.js';
import { logActivity, getClientIp } from '../services/activityLogger.js';

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
    await db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, +req.params.id);
    logActivity(req.user!.id, 'BALANCE_RESET', {
      targetUserId: +req.params.id,
      newBalance: balance,
    }, getClientIp(req));
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
    await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, +req.params.id);
    const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(+req.params.id)) as any;
    logActivity(req.user!.id, 'BALANCE_RESET', {
      targetUserId: +req.params.id,
      topupAmount: amount,
      newBalance: Number(user?.balance ?? 0),
    }, getClientIp(req));
    res.json({ success: true, newBalance: Number(user?.balance ?? 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to top up balance' });
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

export default router;
