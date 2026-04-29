import express from 'express';
import { db } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = express.Router();

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

// POST /api/wallet/deposit - Deposit funds (atomic)
router.post('/deposit', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    await db.transaction(async () => {
      await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
      await db.prepare(`
        INSERT INTO wallet_transactions (user_id, type, amount)
        VALUES (?, 'DEPOSIT', ?)
      `).run(userId, amount);
    });
    
    const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
    res.json({ balance: Number(user.balance) });
  } catch (error) {
    console.error('[wallet] deposit failed:', error);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

// POST /api/wallet/withdraw - Withdraw funds (atomic)
router.post('/withdraw', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    await db.transaction(async () => {
      const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
      if (!user || Number(user.balance) < amount) {
        throw new Error('Insufficient balance');
      }

      await db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, userId);
      await db.prepare(`
        INSERT INTO wallet_transactions (user_id, type, amount)
        VALUES (?, 'WITHDRAW', ?)
      `).run(userId, amount);
    });
    
    const updatedUser = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
    res.json({ balance: Number(updatedUser.balance) });
  } catch (error: any) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    console.error('[wallet] withdrawal failed:', error);
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});

export default router;
