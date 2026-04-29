import express from 'express';
import { db } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// Wallet routes — READ-ONLY for end users.
//
// Regular users cannot deposit or withdraw funds themselves. All wallet
// adjustments are done by an admin via the admin panel:
//   POST /api/admin/users/:id/topup           — credit a user's balance
//   POST /api/admin/users/:id/reset-balance   — set a user's balance
//
// This keeps the paper-trading game integrity (everyone starts with the same
// allotment, only admin can adjust) while still letting users view their
// own balance and historical wallet transactions.
// ────────────────────────────────────────────────────────────────────────────

// GET /api/wallet/balance - Get user's wallet balance
router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
  res.json({ balance: Number(user?.balance ?? 0) });
});

// GET /api/wallet/transactions - Get transaction history
router.get('/transactions', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const transactions = await db.prepare(`
    SELECT * FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId);
  res.json(transactions);
});

export default router;
