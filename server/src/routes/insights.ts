import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/insights/daily - Get daily insights for the user
router.get('/daily', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const dateParam = req.query.date as string;
  const targetDate = dateParam || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  console.log(`[Insights] Fetching daily insights for user ${userId}, date: ${targetDate}`);

  // Get today's transactions
  const transactions = (await db.prepare(`
    SELECT * FROM transactions
    WHERE user_id = ? AND DATE(created_at, '+5 hours 30 minutes') = ?
    ORDER BY created_at DESC
  `).all(userId, targetDate)) as any[];

  // Get today's orders
  const orders = (await db.prepare(`
    SELECT * FROM orders
    WHERE user_id = ? AND DATE(created_at, '+5 hours 30 minutes') = ?
    ORDER BY created_at DESC
  `).all(userId, targetDate)) as any[];

  // Calculate daily P&L from realized transactions (sells)
  let realizedPnl = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let buyCount = 0;
  let sellCount = 0;

  for (const txn of transactions) {
    if (txn.type === 'BUY') {
      buyVolume += Number(txn.total_amount);
      buyCount++;
    } else if (txn.type === 'SELL') {
      sellVolume += Number(txn.total_amount);
      sellCount++;
      // Approximate realized P&L (sell - avg buy)
      const holding = (await db.prepare('SELECT avg_buy_price FROM holdings WHERE user_id = ? AND symbol = ?')
        .get(userId, txn.symbol)) as any;
      if (holding) {
        const costBasis = Number(holding.avg_buy_price) * txn.quantity;
        realizedPnl += Number(txn.total_amount) - costBasis;
      }
    }
  }

  // Get current portfolio value
  const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
  const holdings = (await db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId)) as any[];
  let portfolioValue = Number(user.balance);
  for (const h of holdings) {
    portfolioValue += h.quantity * Number(h.avg_buy_price);
  }

  // Get yesterday's portfolio value for comparison
  const yesterday = new Date(targetDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayHistory = (await db.prepare(`
    SELECT * FROM portfolio_history
    WHERE user_id = ? AND DATE(recorded_at, '+5 hours 30 minutes') = ?
    ORDER BY recorded_at DESC LIMIT 1
  `).all(userId, yesterdayStr)) as any[];
  const yesterdayValue = yesterdayHistory?.[0]?.total_value
    ? Number(yesterdayHistory[0].total_value)
    : portfolioValue;
  const dailyChange = portfolioValue - yesterdayValue;
  const dailyChangePercent = yesterdayValue > 0 ? (dailyChange / yesterdayValue) * 100 : 0;

  // Get active positions count
  const activePositions = holdings.length;

  // Get pending orders count
  const pendingOrders = orders.filter(o => o.status === 'PENDING').length;

  res.json({
    date: targetDate,
    portfolio: {
      currentValue: portfolioValue,
      dailyChange,
      dailyChangePercent,
      activePositions,
    },
    activity: {
      buyCount,
      sellCount,
      buyVolume,
      sellVolume,
      totalTransactions: transactions.length,
      pendingOrders,
    },
    pnl: {
      realized: realizedPnl,
    },
    recentTransactions: transactions.slice(0, 5),
    recentOrders: orders.slice(0, 5),
  });
});

export default router;
