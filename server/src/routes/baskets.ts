import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuote, getCachedQuotes } from '../services/marketData.js';
import { fillOrder } from './orders.js';

const router = Router();

// GET /api/baskets — List user's baskets
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const baskets = db.prepare(`SELECT * FROM baskets WHERE user_id = ? ORDER BY created_at DESC`).all(req.user!.id) as any[];
  const enriched = baskets.map(b => {
    const items = db.prepare(`SELECT bi.*, s.name as stock_name FROM basket_items bi LEFT JOIN stocks s ON s.symbol = bi.symbol WHERE bi.basket_id = ?`).all(b.id) as any[];
    const symbols = items.map((i: any) => i.symbol);
    const quotes = symbols.length ? getCachedQuotes(symbols.map((s: string) => ({ symbol: s, exchange: 'NSE' as const }))) : [];
    const qMap = new Map(quotes.map(q => [q.symbol, q]));
    let estimatedValue = 0;
    const enrichedItems = items.map((i: any) => {
      const q = qMap.get(i.symbol);
      const price = q?.price ?? 0;
      estimatedValue += price * i.quantity;
      return { ...i, price, change_percent: q?.change_percent ?? 0 };
    });
    return { ...b, items: enrichedItems, estimated_value: +estimatedValue.toFixed(2), stock_count: items.length };
  });
  res.json(enriched);
});

// POST /api/baskets — Create basket
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { name, description, items } = req.body;
  if (!name) return res.status(400).json({ error: 'Basket name required' });
  const result = db.prepare(`INSERT INTO baskets (user_id, name, description) VALUES (?, ?, ?)`).run(req.user!.id, name, description || null);
  const basketId = result.lastInsertRowid;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.symbol && item.quantity > 0) {
        db.prepare(`INSERT OR IGNORE INTO basket_items (basket_id, symbol, quantity, transaction_type) VALUES (?, ?, ?, ?)`).run(
          basketId, item.symbol.toUpperCase(), item.quantity, item.transaction_type || 'BUY'
        );
      }
    }
  }
  res.json({ success: true, id: basketId });
});

// PUT /api/baskets/:id — Update basket
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const basket = db.prepare(`SELECT * FROM baskets WHERE id = ? AND user_id = ?`).get(id, req.user!.id);
  if (!basket) return res.status(404).json({ error: 'Basket not found' });
  const { name, description, items } = req.body;
  if (name) db.prepare(`UPDATE baskets SET name = ?, description = ? WHERE id = ?`).run(name, description || null, id);
  if (Array.isArray(items)) {
    db.prepare(`DELETE FROM basket_items WHERE basket_id = ?`).run(id);
    for (const item of items) {
      if (item.symbol && item.quantity > 0) {
        db.prepare(`INSERT OR IGNORE INTO basket_items (basket_id, symbol, quantity, transaction_type) VALUES (?, ?, ?, ?)`).run(
          id, item.symbol.toUpperCase(), item.quantity, item.transaction_type || 'BUY'
        );
      }
    }
  }
  res.json({ success: true });
});

// DELETE /api/baskets/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM baskets WHERE id = ? AND user_id = ?`).run(+req.params.id, req.user!.id);
  res.json({ success: true });
});

// POST /api/baskets/:id/execute — Execute all orders in basket
router.post('/:id/execute', authMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const userId = req.user!.id;
  const basket = db.prepare(`SELECT * FROM baskets WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!basket) return res.status(404).json({ error: 'Basket not found' });

  const items = db.prepare(`SELECT * FROM basket_items WHERE basket_id = ?`).all(id) as any[];
  if (!items.length) return res.status(400).json({ error: 'Basket is empty' });

  const results: any[] = [];
  let totalCost = 0;

  // Pre-check balance
  for (const item of items) {
    if (item.transaction_type === 'BUY') {
      const q = getCachedQuote(item.symbol, 'NSE');
      if (!q) { results.push({ symbol: item.symbol, success: false, error: 'Quote not available' }); continue; }
      totalCost += q.price * item.quantity;
    }
  }

  const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
  if (Number(user?.balance ?? 0) < totalCost) {
    return res.status(400).json({ error: `Insufficient balance. Need ₹${totalCost.toFixed(2)}, have ₹${Number(user?.balance ?? 0).toFixed(2)}` });
  }

  for (const item of items) {
    const q = getCachedQuote(item.symbol, 'NSE');
    if (!q || !q.price) { results.push({ symbol: item.symbol, success: false, error: 'Quote unavailable' }); continue; }
    try {
      if (item.transaction_type === 'SELL') {
        const holding = db.prepare(`SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?`).get(userId, item.symbol) as any;
        if (!holding || Number(holding.quantity) < item.quantity) {
          results.push({ symbol: item.symbol, success: false, error: 'Insufficient holdings' });
          continue;
        }
      }
      const r = db.prepare(`INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, product_type, status) VALUES (?, ?, 'MARKET', ?, ?, ?, 'CNC', 'PENDING')`).run(userId, item.symbol, item.transaction_type, item.quantity, q.price);
      await fillOrder(Number(r.lastInsertRowid), userId, item.symbol, item.transaction_type, item.quantity, q.price);
      results.push({ symbol: item.symbol, success: true, price: q.price, quantity: item.quantity });
    } catch (err: any) {
      results.push({ symbol: item.symbol, success: false, error: err?.message });
    }
  }

  const filled = results.filter(r => r.success).length;
  res.json({ success: true, filled, total: results.length, results });
});

export default router;
