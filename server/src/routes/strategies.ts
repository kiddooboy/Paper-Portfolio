import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes } from '../services/marketData.js';
import { fillOrder } from './orders.js';

const router = Router();

// Strategies are public portfolio snapshots that other users can view and clone.
// Schema: we reuse leaderboard data + a flag on users table is not needed —
// we store a separate strategies table.

// Ensure strategies table exists (inline migration)
db.exec(`CREATE TABLE IF NOT EXISTS strategies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_public   INTEGER NOT NULL DEFAULT 1,
  clones      INTEGER NOT NULL DEFAULT 0,
  snapshot    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_strategies_public ON strategies(is_public)`);

// GET /api/strategies — Public strategies feed
router.get('/', async (req, res) => {
  const strategies = db.prepare(`
    SELECT s.*, u.name as author_name FROM strategies s
    JOIN users u ON u.id = s.user_id
    WHERE s.is_public = 1
    ORDER BY s.clones DESC, s.created_at DESC LIMIT 50
  `).all() as any[];

  const enriched = strategies.map(s => {
    let snapshot: any[] = [];
    try { snapshot = JSON.parse(s.snapshot); } catch {}
    return { ...s, snapshot, snapshot_count: snapshot.length };
  });

  res.json(enriched);
});

// GET /api/strategies/mine — User's own strategies
router.get('/mine', authMiddleware, async (req: AuthRequest, res) => {
  const strategies = db.prepare(`SELECT * FROM strategies WHERE user_id = ? ORDER BY created_at DESC`).all(req.user!.id) as any[];
  res.json(strategies.map(s => {
    let snapshot: any[] = [];
    try { snapshot = JSON.parse(s.snapshot); } catch {}
    return { ...s, snapshot };
  }));
});

// POST /api/strategies — Publish current portfolio as a strategy
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { name, description, is_public } = req.body;
  if (!name) return res.status(400).json({ error: 'Strategy name required' });

  const holdings = db.prepare(`SELECT symbol, quantity, avg_buy_price FROM holdings WHERE user_id = ? AND quantity > 0`).all(userId) as any[];
  if (!holdings.length) return res.status(400).json({ error: 'No holdings to publish' });

  const quotes = getCachedQuotes(holdings.map((h: any) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
  const qMap = new Map(quotes.map(q => [q.symbol, q]));

  let totalValue = 0;
  for (const h of holdings as any[]) totalValue += (qMap.get(h.symbol)?.price ?? h.avg_buy_price) * h.quantity;

  const snapshot = (holdings as any[]).map(h => {
    const price = qMap.get(h.symbol)?.price ?? h.avg_buy_price;
    return {
      symbol: h.symbol,
      quantity: h.quantity,
      weight: totalValue > 0 ? +(price * h.quantity / totalValue * 100).toFixed(1) : 0,
      avg_buy_price: h.avg_buy_price,
    };
  });

  const result = db.prepare(`INSERT INTO strategies (user_id, name, description, is_public, snapshot) VALUES (?, ?, ?, ?, ?)`).run(
    userId, name, description || null, is_public !== false ? 1 : 0, JSON.stringify(snapshot)
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/strategies/:id/clone — Copy a strategy's holdings into user's portfolio
router.post('/:id/clone', authMiddleware, async (req: AuthRequest, res) => {
  const strategyId = +req.params.id;
  const userId = req.user!.id;

  const strategy = db.prepare(`SELECT * FROM strategies WHERE id = ? AND is_public = 1`).get(strategyId) as any;
  if (!strategy) return res.status(404).json({ error: 'Strategy not found' });

  let snapshot: any[] = [];
  try { snapshot = JSON.parse(strategy.snapshot); } catch { return res.status(400).json({ error: 'Invalid strategy' }); }
  if (!snapshot.length) return res.status(400).json({ error: 'Empty strategy' });

  const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
  const quotes = getCachedQuotes(snapshot.map(s => ({ symbol: s.symbol, exchange: 'NSE' as const })));
  const qMap = new Map(quotes.map(q => [q.symbol, q]));

  // Scale quantities to user's available balance (use 50% of balance)
  const deployCapital = Number(user?.balance ?? 0) * 0.5;
  let estimatedCost = snapshot.reduce((s, h) => s + (qMap.get(h.symbol)?.price ?? h.avg_buy_price) * h.quantity, 0);
  const scaleFactor = estimatedCost > 0 ? Math.min(1, deployCapital / estimatedCost) : 1;

  const results: any[] = [];
  for (const item of snapshot) {
    const price = qMap.get(item.symbol)?.price ?? item.avg_buy_price;
    const scaledQty = Math.floor(item.quantity * scaleFactor);
    if (scaledQty <= 0) continue;
    try {
      const r = db.prepare(`INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, product_type, status) VALUES (?, ?, 'MARKET', 'BUY', ?, ?, 'CNC', 'PENDING')`).run(userId, item.symbol, scaledQty, price);
      await fillOrder(Number(r.lastInsertRowid), userId, item.symbol, 'BUY', scaledQty, price);
      results.push({ symbol: item.symbol, quantity: scaledQty, price, success: true });
    } catch (err: any) {
      results.push({ symbol: item.symbol, success: false, error: err?.message });
    }
  }

  db.prepare(`UPDATE strategies SET clones = clones + 1 WHERE id = ?`).run(strategyId);
  res.json({ success: true, filled: results.filter(r => r.success).length, results });
});

// DELETE /api/strategies/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM strategies WHERE id = ? AND user_id = ?`).run(+req.params.id, req.user!.id);
  res.json({ success: true });
});

export default router;
