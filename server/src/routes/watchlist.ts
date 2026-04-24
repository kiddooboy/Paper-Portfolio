import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuotes } from '../services/marketData.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const watchlists = db.prepare('SELECT * FROM watchlists WHERE user_id = ?').all(userId) as any[];

  const allItems: any[] = [];
  for (const wl of watchlists) {
    const items = db
      .prepare('SELECT * FROM watchlist_items WHERE watchlist_id = ?')
      .all(wl.id) as any[];
    wl.items = items;
    allItems.push(...items);
  }

  if (allItems.length) {
    const quotes = await getQuotes(
      allItems.map((i) => ({ symbol: i.symbol, exchange: 'NSE' as const }))
    );
    const priceMap = new Map(quotes.map((q) => [q.symbol, q]));
    for (const wl of watchlists) {
      for (const item of wl.items) {
        const q = priceMap.get(item.symbol);
        item.price = q?.price ?? 0;
        item.change = q?.change ?? 0;
        item.change_percent = q?.change_percent ?? 0;
      }
    }
  }

  res.json(watchlists);
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { name } = req.body;
  const result = db.prepare('INSERT INTO watchlists (user_id, name) VALUES (?, ?)').run(req.user!.id, name);
  res.json({ id: result.lastInsertRowid, name, items: [] });
});

router.post('/:id/items', authMiddleware, (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const { symbol } = req.body;

  const existing = db.prepare('SELECT id FROM watchlists WHERE id = ? AND user_id = ?').get(watchlistId, req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Watchlist not found' });

  db.prepare('INSERT INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)').run(watchlistId, symbol);
  res.json({ success: true });
});

router.delete('/:id/items/:symbol', authMiddleware, (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const symbol = req.params.symbol;

  db.prepare('DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?').run(watchlistId, symbol);
  res.json({ success: true });
});

export default router;
