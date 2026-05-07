import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes } from '../services/marketData.js';
import { logActivity, getClientIp } from '../services/activityLogger.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const watchlists = (await db.prepare('SELECT * FROM watchlists WHERE user_id = ?').all(userId)) as any[];

  const allItems: any[] = [];
  for (const wl of watchlists) {
    const items = (await db
      .prepare('SELECT * FROM watchlist_items WHERE watchlist_id = ?')
      .all(wl.id)) as any[];
    wl.items = items;
    allItems.push(...items);
  }

  if (allItems.length) {
    const quotes = getCachedQuotes(
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

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { name } = req.body;
  const result = await db.prepare('INSERT INTO watchlists (user_id, name) VALUES (?, ?)').run(req.user!.id, name);
  res.json({ id: result.lastInsertRowid, name, items: [] });
});

router.post('/:id/items', authMiddleware, async (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const { symbol } = req.body;
  const upperSymbol = String(symbol || '').toUpperCase();

  const existing = await db.prepare('SELECT id FROM watchlists WHERE id = ? AND user_id = ?').get(watchlistId, req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Watchlist not found' });

  const known = await db.prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`).get(upperSymbol);
  if (!known) return res.status(400).json({ error: 'Only NIFTY 500 stocks can be added to watchlist' });

  await db.prepare('INSERT INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)').run(watchlistId, upperSymbol);
  logActivity(req.user!.id, 'WATCHLIST_ADD', { symbol: upperSymbol }, getClientIp(req));
  res.json({ success: true });
});

// Helper: get or create the user's default watchlist
async function getOrCreateDefaultWatchlist(userId: number): Promise<number> {
  const existing = (await db
    .prepare('SELECT id FROM watchlists WHERE user_id = ? ORDER BY id ASC LIMIT 1')
    .get(userId)) as any;
  if (existing) return existing.id;
  const result = await db
    .prepare('INSERT INTO watchlists (user_id, name) VALUES (?, ?)')
    .run(userId, 'My Watchlist');
  return result.lastInsertRowid as number;
}

// GET /api/watchlists/contains/:symbol — is this symbol in any of user's watchlists?
router.get('/contains/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const row = await db
    .prepare(
      `SELECT 1 FROM watchlist_items wi
       JOIN watchlists w ON w.id = wi.watchlist_id
       WHERE w.user_id = ? AND wi.symbol = ? LIMIT 1`
    )
    .get(req.user!.id, symbol);
  res.json({ inWatchlist: !!row });
});

// POST /api/watchlists/toggle — add or remove a symbol from default watchlist
router.post('/toggle', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const symbol = String(req.body?.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const known = await db
    .prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`)
    .get(symbol);
  if (!known) return res.status(400).json({ error: 'Only NIFTY 500 stocks can be bookmarked' });

  // Check if already in any of the user's watchlists
  const existingItem = (await db
    .prepare(
      `SELECT wi.id, wi.watchlist_id FROM watchlist_items wi
       JOIN watchlists w ON w.id = wi.watchlist_id
       WHERE w.user_id = ? AND wi.symbol = ? LIMIT 1`
    )
    .get(userId, symbol)) as any;

  if (existingItem) {
    await db.prepare('DELETE FROM watchlist_items WHERE id = ?').run(existingItem.id);
    logActivity(userId, 'WATCHLIST_REMOVE', { symbol }, getClientIp(req));
    return res.json({ inWatchlist: false, action: 'removed' });
  }

  const watchlistId = await getOrCreateDefaultWatchlist(userId);
  await db.prepare('INSERT INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)').run(
    watchlistId,
    symbol
  );
  logActivity(userId, 'WATCHLIST_ADD', { symbol }, getClientIp(req));
  res.json({ inWatchlist: true, action: 'added', watchlistId });
});

router.delete('/:id/items/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const symbol = req.params.symbol;

  await db.prepare('DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?').run(watchlistId, symbol);
  logActivity(req.user!.id, 'WATCHLIST_REMOVE', { symbol, watchlistId }, getClientIp(req));
  res.json({ success: true });
});

router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const wl = db.prepare('SELECT id FROM watchlists WHERE id = ? AND user_id = ?').get(watchlistId, req.user!.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE watchlists SET name = ? WHERE id = ?').run(name.trim(), watchlistId);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const watchlistId = parseInt(req.params.id);
  const wl = db.prepare('SELECT id FROM watchlists WHERE id = ? AND user_id = ?').get(watchlistId, req.user!.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM watchlist_items WHERE watchlist_id = ?').run(watchlistId);
  db.prepare('DELETE FROM watchlists WHERE id = ?').run(watchlistId);
  res.json({ success: true });
});

export default router;
