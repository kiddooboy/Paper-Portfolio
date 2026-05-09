import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuote, isMarketOpen } from '../services/marketData.js';
import { fillOrder } from './orders.js';
import { z } from 'zod';

const router = Router();

const sipSchema = z.object({
  symbol: z.string(),
  quantity: z.number().int().positive(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(28).optional(),
});

function computeNextRun(frequency: string, dayOfWeek?: number, dayOfMonth?: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 30, 0, 0); // 9:30 AM
  if (next <= now) next.setDate(next.getDate() + 1);

  if (frequency === 'daily') {
    // Already set to tomorrow 9:30
  } else if (frequency === 'weekly') {
    const targetDay = dayOfWeek ?? 1; // Monday default
    while (next.getDay() !== targetDay) next.setDate(next.getDate() + 1);
  } else if (frequency === 'monthly') {
    const targetDate = dayOfMonth ?? 1;
    next.setDate(targetDate);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    next.setDate(targetDate);
  }
  return next.toISOString();
}

// GET /api/sip — List user's SIP schedules
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const schedules = db.prepare(`SELECT * FROM sip_schedules WHERE user_id = ? ORDER BY created_at DESC`).all(req.user!.id) as any[];
  const enriched = schedules.map(s => {
    const q = getCachedQuote(s.symbol, 'NSE');
    return { ...s, current_price: q?.price ?? 0, estimated_monthly_cost: (q?.price ?? 0) * s.quantity * (s.frequency === 'weekly' ? 4 : 1) };
  });
  res.json(enriched);
});

// POST /api/sip — Create SIP schedule
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, quantity, frequency, day_of_week, day_of_month } = sipSchema.parse(req.body);
    const userId = req.user!.id;
    const upperSymbol = symbol.toUpperCase();

    const known = db.prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`).get(upperSymbol);
    if (!known) return res.status(400).json({ error: 'Unknown symbol' });

    const next_run = computeNextRun(frequency, day_of_week, day_of_month);
    const result = db.prepare(`
      INSERT INTO sip_schedules (user_id, symbol, quantity, frequency, day_of_week, day_of_month, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, upperSymbol, quantity, frequency, day_of_week ?? null, day_of_month ?? null, next_run);

    res.json({ success: true, id: result.lastInsertRowid, next_run });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid SIP data' });
  }
});

// PUT /api/sip/:id/toggle — Pause/resume
router.put('/:id/toggle', authMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const sip = db.prepare(`SELECT * FROM sip_schedules WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as any;
  if (!sip) return res.status(404).json({ error: 'SIP not found' });
  const newActive = sip.is_active ? 0 : 1;
  db.prepare(`UPDATE sip_schedules SET is_active = ? WHERE id = ?`).run(newActive, id);
  res.json({ success: true, is_active: newActive === 1 });
});

// DELETE /api/sip/:id — Cancel SIP
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM sip_schedules WHERE id = ? AND user_id = ?`).run(+req.params.id, req.user!.id);
  res.json({ success: true });
});

// Cron-triggered execution — called from the scheduler
export async function executeDueSIPs() {
  const now = new Date().toISOString();
  const due = db.prepare(`SELECT * FROM sip_schedules WHERE is_active = 1 AND next_run <= ? `).all(now) as any[];
  if (!due.length) return;

  for (const sip of due) {
    const q = getCachedQuote(sip.symbol, 'NSE');
    if (!q || !q.price) continue;

    try {
      const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(sip.user_id) as any;
      const required = q.price * sip.quantity;
      if (!user || Number(user.balance) < required) {
        console.log(`[SIP] Skipping ${sip.symbol} for user ${sip.user_id}: insufficient balance`);
      } else {
        const r = db.prepare(`INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, product_type, status) VALUES (?, ?, 'MARKET', 'BUY', ?, ?, 'CNC', 'PENDING')`).run(sip.user_id, sip.symbol, sip.quantity, q.price);
        await fillOrder(Number(r.lastInsertRowid), sip.user_id, sip.symbol, 'BUY', sip.quantity, q.price);
        console.log(`[SIP] Executed: BUY ${sip.quantity} ${sip.symbol} @ ₹${q.price} for user ${sip.user_id}`);
      }
    } catch (err) {
      console.error(`[SIP] Error executing ${sip.symbol}:`, err);
    }

    const nextRun = computeNextRun(sip.frequency, sip.day_of_week, sip.day_of_month);
    db.prepare(`UPDATE sip_schedules SET next_run = ?, total_runs = total_runs + 1 WHERE id = ?`).run(nextRun, sip.id);
  }
}

export default router;
