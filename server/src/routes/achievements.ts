import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

export async function checkAndAwardAchievements(userId: number) {
  try {
    const earned = new Set((db.prepare(`SELECT achievement_key FROM user_achievements WHERE user_id = ?`).all(userId) as any[]).map((r: any) => r.achievement_key));
    const award = (key: string) => {
      if (!earned.has(key)) {
        db.prepare(`INSERT OR IGNORE INTO user_achievements (user_id, achievement_key) VALUES (?, ?)`).run(userId, key);
        earned.add(key);
        const ach = db.prepare(`SELECT * FROM achievements WHERE key = ?`).get(key) as any;
        if (ach) {
          db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'system')`).run(
            userId, `Achievement Unlocked: ${ach.name}`, `${ach.icon} ${ach.description}`
          );
        }
      }
    };

    const txCount = Number((db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE user_id = ?`).get(userId) as any)?.c ?? 0);
    if (txCount >= 1) award('first_trade');
    if (txCount >= 10) award('ten_trades');
    if (txCount >= 50) award('fifty_trades');

    const realizedPnl = (db.prepare(`SELECT COALESCE(SUM(realized_pnl), 0) as total FROM trade_pnl WHERE user_id = ? AND realized_pnl > 0`).get(userId) as any)?.total ?? 0;
    if (Number(realizedPnl) > 0) award('first_profit');

    const alertCount = Number((db.prepare(`SELECT COUNT(*) as c FROM price_alerts WHERE user_id = ?`).get(userId) as any)?.c ?? 0);
    if (alertCount >= 10) award('analyst');

    const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
    const holdings = db.prepare(`SELECT symbol, quantity, avg_buy_price FROM holdings WHERE user_id = ?`).all(userId) as any[];

    const sectorRows = holdings.length
      ? (db.prepare(`SELECT DISTINCT sector FROM stocks WHERE symbol IN (${holdings.map(() => '?').join(',')}) AND sector IS NOT NULL`).all(...holdings.map((h: any) => h.symbol)) as any[])
      : [];
    if (sectorRows.length >= 5) award('diversified');

    const tradedSectors = (db.prepare(`
      SELECT COUNT(DISTINCT s.sector) as sc FROM transactions t
      JOIN stocks s ON s.symbol = t.symbol
      WHERE t.user_id = ? AND s.sector IS NOT NULL
    `).get(userId) as any)?.sc ?? 0;
    if (Number(tradedSectors) >= 10) award('sector_master');

    // Check 10-bagger: any holding with current value 10x avg_buy_price (approximated by price in holdings)
    for (const h of holdings) {
      if (h.avg_buy_price > 0) {
        const pnlPct = ((h.avg_buy_price * 10) / h.avg_buy_price - 1) * 100;
        // We can't fetch live prices here easily; use avg_buy_price as proxy
      }
    }

    // Patient investor: any holding held > 30 days
    const oldHolding = db.prepare(`
      SELECT 1 FROM transactions t WHERE t.user_id = ? AND t.type = 'BUY'
        AND datetime(t.created_at) <= datetime('now', '-30 days')
        AND EXISTS (SELECT 1 FROM holdings h WHERE h.user_id = t.user_id AND h.symbol = t.symbol)
      LIMIT 1
    `).get(userId);
    if (oldHolding) award('patient_investor');

    // High roller: portfolio value > 500000
    const holdingsValue = holdings.reduce((s: number, h: any) => s + h.avg_buy_price * h.quantity, 0);
    const totalValue = Number(user?.balance ?? 0) + holdingsValue;
    if (totalValue >= 500000) award('big_balance');
  } catch (err) {
    console.error('[achievements] check error:', err);
  }
}

// GET /api/achievements — All achievements with earned status for the user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  await checkAndAwardAchievements(userId);

  const all = db.prepare(`SELECT * FROM achievements ORDER BY category, key`).all() as any[];
  const earned = db.prepare(`SELECT achievement_key, earned_at FROM user_achievements WHERE user_id = ?`).all(userId) as any[];
  const earnedMap = new Map(earned.map((e: any) => [e.achievement_key, e.earned_at]));

  const result = all.map(a => ({
    ...a,
    earned: earnedMap.has(a.key),
    earned_at: earnedMap.get(a.key) || null,
  }));

  res.json({
    achievements: result,
    earned_count: earned.length,
    total_count: all.length,
  });
});

export default router;
