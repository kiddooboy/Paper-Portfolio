import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/corporate-actions — Public list of upcoming/recent actions
router.get('/', async (req, res) => {
  const actions = db.prepare(`
    SELECT ca.*, s.name as stock_name
    FROM corporate_actions ca
    LEFT JOIN stocks s ON s.symbol = ca.symbol
    ORDER BY ca.ex_date DESC LIMIT 50
  `).all();
  res.json(actions);
});

// POST /api/corporate-actions — Admin: add action
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const { symbol, action_type, ratio, amount, ex_date } = req.body;
  if (!symbol || !action_type || !ex_date) return res.status(400).json({ error: 'symbol, action_type, ex_date required' });
  const result = db.prepare(`INSERT INTO corporate_actions (symbol, action_type, ratio, amount, ex_date) VALUES (?, ?, ?, ?, ?)`).run(
    symbol.toUpperCase(), action_type, ratio || null, amount || null, ex_date
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/corporate-actions/:id/apply — Admin: apply action to all holders
router.post('/:id/apply', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const id = +req.params.id;
  const action = db.prepare(`SELECT * FROM corporate_actions WHERE id = ?`).get(id) as any;
  if (!action) return res.status(404).json({ error: 'Action not found' });
  if (action.applied) return res.status(400).json({ error: 'Already applied' });

  const holders = db.prepare(`SELECT * FROM holdings WHERE symbol = ? AND quantity > 0`).all(action.symbol) as any[];
  let affected = 0;

  await db.transaction(async () => {
    for (const h of holders) {
      if (action.action_type === 'BONUS') {
        const [bonusShares, forShares] = (action.ratio || '1:1').split(':').map(Number);
        const newShares = Math.floor(h.quantity * (bonusShares / forShares));
        const newQty = h.quantity + newShares;
        const newAvg = (h.avg_buy_price * h.quantity) / newQty;
        db.prepare(`UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?`).run(newQty, newAvg, h.id);
        affected++;
      } else if (action.action_type === 'SPLIT') {
        const [newFaceValue, oldFaceValue] = (action.ratio || '1:1').split(':').map(Number);
        const multiplier = oldFaceValue / newFaceValue;
        const newQty = Math.floor(h.quantity * multiplier);
        const newAvg = h.avg_buy_price / multiplier;
        db.prepare(`UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?`).run(newQty, newAvg, h.id);
        affected++;
      } else if (action.action_type === 'DIVIDEND') {
        const dividendAmount = (action.amount || 0) * h.quantity;
        db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`).run(dividendAmount, h.user_id);
        db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount) VALUES (?, 'DEPOSIT', ?)`).run(h.user_id, dividendAmount);
        db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'system')`).run(
          h.user_id,
          `Dividend Credited: ${action.symbol}`,
          `₹${dividendAmount.toFixed(2)} dividend credited for ${h.quantity} shares of ${action.symbol}`
        );
        affected++;
      }
    }
    db.prepare(`UPDATE corporate_actions SET applied = 1 WHERE id = ?`).run(id);
  });

  res.json({ success: true, affected });
});

// DELETE /api/corporate-actions/:id — Admin: remove action
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM corporate_actions WHERE id = ? AND applied = 0`).run(+req.params.id);
  res.json({ success: true });
});

export default router;
