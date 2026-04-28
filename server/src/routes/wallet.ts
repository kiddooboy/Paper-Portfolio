import express from 'express';
import { db } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// GET /api/wallet/balance - Get user's wallet balance
router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const user = await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  res.json({ balance: user?.balance || 0 });
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

// POST /api/wallet/deposit - Deposit funds
router.post('/deposit', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    // Update user balance
    await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
    
    // Record transaction
    await db.prepare(`
      INSERT INTO wallet_transactions (user_id, type, amount, created_at)
      VALUES (?, 'DEPOSIT', ?, CURRENT_TIMESTAMP)
    `).run(userId, amount);
    
    const user = await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
    res.json({ balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: 'Deposit failed' });
  }
});

// POST /api/wallet/withdraw - Withdraw funds
router.post('/withdraw', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const user = await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  if (!user || user.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  try {
    // Update user balance
    await db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, userId);
    
    // Record transaction
    await db.prepare(`
      INSERT INTO wallet_transactions (user_id, type, amount, created_at)
      VALUES (?, 'WITHDRAW', ?, CURRENT_TIMESTAMP)
    `).run(userId, amount);
    
    const updatedUser = await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
    res.json({ balance: updatedUser.balance });
  } catch (error) {
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});

export default router;
