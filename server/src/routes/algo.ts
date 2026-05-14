import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote } from '../services/marketData.js';

const router = Router();

// Top NIFTY50 symbols for AI scanning
const AI_SCAN_SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'BHARTIARTL', 'ITC', 'BAJFINANCE', 'HCLTECH',
  'WIPRO', 'AXISBANK', 'KOTAKBANK', 'LT', 'ASIANPAINT',
  'MARUTI', 'TITAN', 'NESTLEIND', 'SUNPHARMA', 'POWERGRID',
];

// ── GET /api/algo/strategies ──────────────────────────────────────────────────
router.get('/strategies', authMiddleware, (req: AuthRequest, res) => {
  const rows = db.prepare(
    `SELECT * FROM algo_strategies WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.user!.id) as any[];
  res.json(rows.map(r => ({ ...r, entry_conditions: JSON.parse(r.entry_conditions || '[]'), exit_conditions: JSON.parse(r.exit_conditions || '{}') })));
});

// ── POST /api/algo/strategies ─────────────────────────────────────────────────
router.post('/strategies', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { name, symbol, product_type = 'CNC', entry_conditions = [], exit_conditions = {}, quantity = 1 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Strategy name is required' });
  if (!symbol?.trim()) return res.status(400).json({ error: 'Symbol is required' });
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be ≥ 1' });

  const result = db.prepare(`
    INSERT INTO algo_strategies (user_id, name, symbol, product_type, entry_conditions, exit_conditions, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, name.trim(), symbol.toUpperCase().trim(), product_type, JSON.stringify(entry_conditions), JSON.stringify(exit_conditions), quantity);

  const row = db.prepare(`SELECT * FROM algo_strategies WHERE id = ?`).get(result.lastInsertRowid) as any;
  res.status(201).json({ ...row, entry_conditions: JSON.parse(row.entry_conditions), exit_conditions: JSON.parse(row.exit_conditions) });
});

// ── PUT /api/algo/strategies/:id ──────────────────────────────────────────────
router.put('/strategies/:id', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const strat = db.prepare(`SELECT * FROM algo_strategies WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as any;
  if (!strat) return res.status(404).json({ error: 'Strategy not found' });

  const { name, symbol, product_type, entry_conditions, exit_conditions, quantity } = req.body;
  db.prepare(`
    UPDATE algo_strategies SET name=?, symbol=?, product_type=?, entry_conditions=?, exit_conditions=?, quantity=? WHERE id=?
  `).run(
    name ?? strat.name,
    (symbol ?? strat.symbol).toUpperCase(),
    product_type ?? strat.product_type,
    JSON.stringify(entry_conditions ?? JSON.parse(strat.entry_conditions)),
    JSON.stringify(exit_conditions ?? JSON.parse(strat.exit_conditions)),
    quantity ?? strat.quantity,
    strat.id,
  );
  const updated = db.prepare(`SELECT * FROM algo_strategies WHERE id = ?`).get(strat.id) as any;
  res.json({ ...updated, entry_conditions: JSON.parse(updated.entry_conditions), exit_conditions: JSON.parse(updated.exit_conditions) });
});

// ── DELETE /api/algo/strategies/:id ──────────────────────────────────────────
router.delete('/strategies/:id', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const strat = db.prepare(`SELECT id FROM algo_strategies WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as any;
  if (!strat) return res.status(404).json({ error: 'Strategy not found' });
  db.prepare(`DELETE FROM algo_strategies WHERE id = ?`).run(strat.id);
  res.json({ success: true });
});

// ── POST /api/algo/strategies/:id/toggle ─────────────────────────────────────
router.post('/strategies/:id/toggle', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const strat = db.prepare(`SELECT * FROM algo_strategies WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as any;
  if (!strat) return res.status(404).json({ error: 'Strategy not found' });
  const newState = strat.is_active ? 0 : 1;
  db.prepare(`UPDATE algo_strategies SET is_active = ? WHERE id = ?`).run(newState, strat.id);
  res.json({ is_active: newState });
});

// ── GET /api/algo/ai-config ───────────────────────────────────────────────────
router.get('/ai-config', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  let cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any;
  if (!cfg) {
    db.prepare(`INSERT OR IGNORE INTO ai_trader_config (user_id) VALUES (?)`).run(userId);
    cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any;
  }
  res.json(cfg);
});

// ── PUT /api/algo/ai-config ───────────────────────────────────────────────────
router.put('/ai-config', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { is_enabled, allocation_pct, risk_level, max_positions } = req.body;

  db.prepare(`INSERT OR IGNORE INTO ai_trader_config (user_id) VALUES (?)`).run(userId);
  db.prepare(`
    UPDATE ai_trader_config SET
      is_enabled = COALESCE(?, is_enabled),
      allocation_pct = COALESCE(?, allocation_pct),
      risk_level = COALESCE(?, risk_level),
      max_positions = COALESCE(?, max_positions),
      updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    is_enabled !== undefined ? (is_enabled ? 1 : 0) : null,
    allocation_pct ?? null,
    risk_level ?? null,
    max_positions ?? null,
    userId,
  );

  const cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any;
  res.json(cfg);
});

// ── POST /api/algo/ai-scan ────────────────────────────────────────────────────
router.post('/ai-scan', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  let cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any;
  if (!cfg) { db.prepare(`INSERT OR IGNORE INTO ai_trader_config (user_id) VALUES (?)`).run(userId); cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any; }

  const risk = cfg?.risk_level ?? 'moderate';
  const maxPos = cfg?.max_positions ?? 5;

  const quotes = (await Promise.all(
    AI_SCAN_SYMBOLS.map(async sym => {
      try { const q = await getQuote(sym, 'NSE'); return q ? { ...q, symbol: sym } : null; }
      catch { return null; }
    })
  )).filter(Boolean) as any[];

  const scored = quotes.map(q => {
    let score = 0;
    const reasons: string[] = [];
    const pct = q.change_percent ?? 0;

    if (pct > 2)      { score += 3; reasons.push(`Strong gain +${pct.toFixed(1)}%`); }
    else if (pct > 0.5) { score += 2; reasons.push(`Positive +${pct.toFixed(1)}%`); }
    else if (pct > 0)   { score += 1; reasons.push(`Slight gain +${pct.toFixed(2)}%`); }
    else if (pct < -2)  { score -= 2; reasons.push(`Falling ${pct.toFixed(1)}%`); }

    if (q.high_52w && q.price > q.high_52w * 0.92)  { score += 1; reasons.push('Near 52w high'); }
    if (q.low_52w  && q.price < q.low_52w  * 1.12)  { score -= 1; reasons.push('Near 52w low');  }

    if (risk === 'aggressive' && pct > 1.5) score += 1;
    if (risk === 'conservative' && pct < 0) score -= 1;

    return { symbol: q.symbol, price: q.price, change_percent: pct, score, reasons };
  });

  const picks = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPos);

  res.json({ picks, scanTime: new Date().toISOString() });
});

// ── POST /api/algo/ai-execute ─────────────────────────────────────────────────
router.post('/ai-execute', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { picks } = req.body as { picks: { symbol: string; price: number; reasons: string[] }[] };
  if (!picks?.length) return res.status(400).json({ error: 'No picks provided' });

  const cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as any;
  if (!cfg?.is_enabled) return res.status(400).json({ error: 'AI Trader is not enabled' });

  const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
  const totalBudget = (user.balance * (cfg.allocation_pct / 100));
  const perTrade    = Math.floor(totalBudget / picks.length);
  if (perTrade < 100) return res.status(400).json({ error: 'Insufficient balance for AI trading' });

  const executed: any[] = [];
  for (const pick of picks) {
    const qty = Math.max(1, Math.floor(perTrade / pick.price));
    const cost = qty * pick.price;

    const currentUser = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
    if (currentUser.balance < cost) continue;

    db.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`).run(cost, userId);

    // Upsert holding
    const existing = db.prepare(`SELECT * FROM holdings WHERE user_id = ? AND symbol = ?`).get(userId, pick.symbol) as any;
    if (existing) {
      const totalQty = existing.quantity + qty;
      const newAvg   = (existing.avg_buy_price * existing.quantity + cost) / totalQty;
      db.prepare(`UPDATE holdings SET quantity = ?, avg_buy_price = ?, updated_at = datetime('now') WHERE user_id = ? AND symbol = ?`).run(totalQty, newAvg, userId, pick.symbol);
    } else {
      db.prepare(`INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)`).run(userId, pick.symbol, qty, pick.price);
    }

    db.prepare(`INSERT INTO algo_trades (user_id, symbol, action, quantity, price, source, reason) VALUES (?, ?, 'BUY', ?, ?, 'ai', ?)`).run(userId, pick.symbol, qty, pick.price, pick.reasons.join('; '));

    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'system')`).run(
      userId,
      `AI Trader: Bought ${pick.symbol}`,
      `AI bought ${qty} shares of ${pick.symbol} @ ₹${pick.price.toFixed(2)}. Reason: ${pick.reasons[0]}`
    );

    executed.push({ symbol: pick.symbol, qty, price: pick.price, cost });
  }

  res.json({ executed, count: executed.length });
});

// ── GET /api/algo/trades ──────────────────────────────────────────────────────
router.get('/trades', authMiddleware, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const rows  = db.prepare(`
    SELECT t.*, s.name as strategy_name
    FROM algo_trades t
    LEFT JOIN algo_strategies s ON s.id = t.strategy_id
    WHERE t.user_id = ?
    ORDER BY t.executed_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, (page - 1) * limit) as any[];
  res.json(rows);
});

export default router;
