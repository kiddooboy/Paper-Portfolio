import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuotes } from '../services/marketData.js';

const router = Router();

// GET /api/collections — List all public collections
router.get('/', async (req, res) => {
  const collections = db.prepare(`
    SELECT c.*, COUNT(ci.id) as stock_count
    FROM collections c
    LEFT JOIN collection_items ci ON ci.collection_id = c.id
    WHERE c.is_public = 1
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(collections);
});

// GET /api/collections/:id — Get collection with live prices
router.get('/:id', async (req, res) => {
  try {
    const collectionId = +req.params.id;
    const collection = db.prepare(`SELECT * FROM collections WHERE id = ?`).get(collectionId) as any;
    if (!collection) return res.status(404).json({ error: 'Collection not found' });

    const items = db.prepare(`
      SELECT ci.symbol, s.name, s.sector, s.market_cap
      FROM collection_items ci
      LEFT JOIN stocks s ON s.symbol = ci.symbol
      WHERE ci.collection_id = ?
    `).all(collectionId) as any[];

    if (items.length) {
      const quotes = getCachedQuotes(items.map(i => ({ symbol: i.symbol, exchange: 'NSE' as const })));
      const qMap = new Map(quotes.map(q => [q.symbol, q]));
      for (const item of items) {
        const q = qMap.get(item.symbol);
        item.price = q?.price ?? 0;
        item.change_percent = q?.change_percent ?? 0;
        item.market_cap = q?.market_cap ?? item.market_cap;
      }
    }

    res.json({ ...collection, items });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /api/collections — Admin: create collection
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const { name, description, icon, color, symbols } = req.body;
  if (!name || !Array.isArray(symbols)) return res.status(400).json({ error: 'name and symbols required' });

  const result = db.prepare(`INSERT INTO collections (name, description, icon, color, created_by) VALUES (?, ?, ?, ?, ?)`).run(
    name, description || null, icon || '📊', color || '#00B386', req.user!.id
  );
  const collId = result.lastInsertRowid;
  for (const sym of symbols) {
    db.prepare(`INSERT OR IGNORE INTO collection_items (collection_id, symbol) VALUES (?, ?)`).run(collId, sym.toUpperCase());
  }
  res.json({ success: true, id: collId });
});

// PUT /api/collections/:id — Admin: update collection
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const { name, description, icon, color, symbols } = req.body;
  db.prepare(`UPDATE collections SET name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ?`).run(
    name || null, description || null, icon || null, color || null, id
  );
  if (Array.isArray(symbols)) {
    db.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).run(id);
    for (const sym of symbols) {
      db.prepare(`INSERT OR IGNORE INTO collection_items (collection_id, symbol) VALUES (?, ?)`).run(id, sym.toUpperCase());
    }
  }
  res.json({ success: true });
});

// DELETE /api/collections/:id — Admin: delete collection
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM collections WHERE id = ?`).run(+req.params.id);
  res.json({ success: true });
});

// POST /api/collections/seed — Admin: seed default collections
router.post('/seed', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const defaults = [
    { name: 'Nifty 50', icon: '🇮🇳', color: '#00B386', description: 'Top 50 companies by market cap on NSE', symbols: ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','ITC','SBIN','BHARTIARTL','KOTAKBANK','LT','BAJFINANCE','HCLTECH','ASIANPAINT','MARUTI','AXISBANK','SUNPHARMA','TITAN','WIPRO','ULTRACEMCO'] },
    { name: 'IT Giants', icon: '💻', color: '#6366f1', description: 'Top Indian IT & Technology companies', symbols: ['TCS','INFY','HCLTECH','WIPRO','TECHM','MPHASIS','LTTS','PERSISTENT','COFORGE','HEXAWARE'] },
    { name: 'Banking & Finance', icon: '🏦', color: '#0ea5e9', description: 'Leading banks and NBFCs', symbols: ['HDFCBANK','ICICIBANK','SBIN','KOTAKBANK','AXISBANK','BAJFINANCE','BAJAJFINSV','INDUSINDBK','FEDERALBNK','BANDHANBNK'] },
    { name: 'EV & Clean Energy', icon: '⚡', color: '#22c55e', description: 'Electric vehicles and renewable energy', symbols: ['TATAMOTORS','MAHINDRA','TATAPOWER','ADANIGREEN','CESC','TORNTPOWER','SUZLON','RTNPOWER','GREENPANEL','OLECTRA'] },
    { name: 'Defence PSUs', icon: '🛡️', color: '#dc2626', description: 'Indian defence sector companies', symbols: ['HAL','BEL','BHEL','BEML','MIDHANI','MAZDOCK','COCHINSHIP','GRSE','PARAS','BHARAT'] },
    { name: 'FMCG Leaders', icon: '🛒', color: '#f59e0b', description: 'Fast-moving consumer goods', symbols: ['HINDUNILVR','ITC','NESTLEIND','BRITANNIA','DABUR','MARICO','GODREJCP','EMAMILTD','TATACONSUM','COLPAL'] },
    { name: 'Pharma & Healthcare', icon: '💊', color: '#8b5cf6', description: 'Pharmaceuticals and healthcare', symbols: ['SUNPHARMA','DRREDDY','CIPLA','DIVISLAB','BIOCON','TORNTPHARM','AUROPHARMA','LUPIN','ALKEM','IPCALAB'] },
    { name: 'Dividend Aristocrats', icon: '💰', color: '#f97316', description: 'Consistent high dividend yielders', symbols: ['ITC','COALINDIA','ONGC','POWERGRID','NTPC','HINDUNILVR','BPCL','IOC','NMDC','GAIL'] },
  ];

  let created = 0;
  for (const col of defaults) {
    const existing = db.prepare(`SELECT id FROM collections WHERE name = ?`).get(col.name);
    if (existing) continue;
    const result = db.prepare(`INSERT INTO collections (name, description, icon, color, created_by) VALUES (?, ?, ?, ?, ?)`).run(
      col.name, col.description, col.icon, col.color, req.user!.id
    );
    for (const sym of col.symbols) {
      db.prepare(`INSERT OR IGNORE INTO collection_items (collection_id, symbol) VALUES (?, ?)`).run(result.lastInsertRowid, sym);
    }
    created++;
  }
  res.json({ success: true, created });
});

export default router;
