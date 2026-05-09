import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuote } from '../services/marketData.js';
import { z } from 'zod';

const router = Router();

const gttSchema = z.object({
  symbol: z.string(),
  transaction_type: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  trigger_price: z.number().positive(),
  limit_price: z.number().positive().optional(),
  valid_till: z.string().optional(), // ISO date string
});

// POST /api/gtt — Create GTT order
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, transaction_type, quantity, trigger_price, limit_price, valid_till } = gttSchema.parse(req.body);
    const userId = req.user!.id;
    const upperSymbol = symbol.toUpperCase();

    const known = await db.prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`).get(upperSymbol);
    if (!known) return res.status(400).json({ error: 'Unknown symbol' });

    const q = getCachedQuote(upperSymbol, 'NSE');
    if (!q) return res.status(404).json({ error: 'Quote not available' });

    const validTill = valid_till || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const result = db.prepare(`
      INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, trigger_price, is_gtt, gtt_valid_till, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING')
    `).run(userId, upperSymbol, limit_price ? 'SL' : 'SL-M', transaction_type, quantity, q.price, limit_price || null, trigger_price, validTill);

    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid GTT data' });
  }
});

// GET /api/gtt — List user's active GTT orders
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE user_id = ? AND is_gtt = 1 AND status = 'PENDING' ORDER BY created_at DESC
  `).all(req.user!.id);
  res.json(orders);
});

// DELETE /api/gtt/:id — Cancel GTT
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND user_id = ? AND is_gtt = 1`).get(id, req.user!.id) as any;
  if (!order) return res.status(404).json({ error: 'GTT order not found' });
  if (order.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });
  db.prepare(`UPDATE orders SET status = 'CANCELLED' WHERE id = ?`).run(id);
  res.json({ success: true });
});

export default router;
