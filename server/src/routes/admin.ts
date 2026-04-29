import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuotes } from '../services/marketData.js';

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// ---------------------------------------------------------------------------
// GET /api/admin/users — List all users with portfolio summary
// ---------------------------------------------------------------------------
router.get('/users', async (req: AuthRequest, res) => {
  const users = (await db.prepare(`
    SELECT id, name, email, role, balance, created_at FROM users ORDER BY created_at DESC
  `).all()) as any[];

  // Gather holdings for all users
  const allHoldings = (await db.prepare('SELECT * FROM holdings').all()) as any[];
  const uniqueSymbols = Array.from(new Set(allHoldings.map((h: any) => h.symbol)));

  const priceMap = new Map<string, number>();
  if (uniqueSymbols.length) {
    const quotes = await getQuotes(uniqueSymbols.map((s) => ({ symbol: s, exchange: 'NSE' as const })));
    for (const q of quotes) priceMap.set(q.symbol, q.price);
  }

  const enriched = await Promise.all(users.map(async (u: any) => {
    const holdings = allHoldings.filter((h: any) => h.user_id === u.id);
    let investedValue = 0;
    let currentValue = 0;
    for (const h of holdings) {
      const price = priceMap.get(h.symbol) ?? h.avg_buy_price;
      investedValue += h.avg_buy_price * h.quantity;
      currentValue += price * h.quantity;
    }
    const totalPnl = currentValue - investedValue;
    const totalValue = u.balance + currentValue;

    const txCount = ((await db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(u.id)) as any)?.c || 0;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      balance: u.balance,
      investedValue: +investedValue.toFixed(2),
      currentValue: +currentValue.toFixed(2),
      totalValue: +totalValue.toFixed(2),
      totalPnl: +totalPnl.toFixed(2),
      holdingsCount: holdings.length,
      transactionCount: txCount,
      created_at: u.created_at,
    };
  }));

  res.json({ users: enriched, total: enriched.length });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id — Detailed user view
// ---------------------------------------------------------------------------
router.get('/users/:id', async (req: AuthRequest, res) => {
  const userId = +req.params.id;
  const user = (await db.prepare('SELECT id, name, email, role, balance, created_at FROM users WHERE id = ?').get(userId)) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const holdings = (await db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId)) as any[];
  const transactions = (await db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId)) as any[];
  const orders = (await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId)) as any[];

  // Enrich holdings with live prices
  if (holdings.length) {
    const quotes = await getQuotes(holdings.map((h: any) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
    const pm = new Map(quotes.map((q) => [q.symbol, q.price]));
    for (const h of holdings) {
      const price = pm.get(h.symbol) ?? h.avg_buy_price;
      h.current_price = price;
      h.current_value = price * h.quantity;
      h.pnl = (price - h.avg_buy_price) * h.quantity;
    }
  }

  res.json({ user, holdings, transactions, orders });
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
    await db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, req.params.id);
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
    // Get current balance
    const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(req.params.id)) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Add amount to current balance
    const newBalance = user.balance + amount;
    await db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, req.params.id);
    res.json({ success: true, newBalance });
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

  const user = (await db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  // FK ON DELETE CASCADE handles all child rows automatically
  await db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats — Platform-wide stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req: AuthRequest, res) => {
  const userCount = ((await db.prepare('SELECT COUNT(*) as c FROM users').get()) as any)?.c || 0;
  const txCount = ((await db.prepare('SELECT COUNT(*) as c FROM transactions').get()) as any)?.c || 0;
  const orderCount = ((await db.prepare('SELECT COUNT(*) as c FROM orders').get()) as any)?.c || 0;
  const totalBalance = ((await db.prepare('SELECT SUM(balance) as s FROM users').get()) as any)?.s || 0;
  const holdingsCount = ((await db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM holdings WHERE quantity > 0').get()) as any)?.c || 0;

  res.json({
    userCount,
    activeTraders: holdingsCount,
    totalTransactions: txCount,
    totalOrders: orderCount,
    totalCashInSystem: +totalBalance.toFixed(2),
  });
});

export default router;
