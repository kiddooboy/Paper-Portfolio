import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote } from '../services/marketData.js';
import { z } from 'zod';

const router = Router();

const orderSchema = z.object({
  symbol: z.string(),
  exchange: z.enum(['NSE', 'BSE']).optional(),
  type: z.enum(['MARKET', 'LIMIT']),
  transactionType: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  limitPrice: z.number().optional(),
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, exchange, type, transactionType, quantity, limitPrice } = orderSchema.parse(req.body);
    const userId = req.user!.id;
    const ex = exchange ?? 'NSE';
    const upperSymbol = symbol.toUpperCase();

    // Guard: only allow trading NIFTY 500 constituents (present in our master)
    const known = db
      .prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`)
      .get(upperSymbol);
    if (!known) {
      return res.status(400).json({ error: 'Trading restricted to NIFTY 500 stocks only' });
    }

    const quote = await getQuote(upperSymbol, ex);
    if (!quote) return res.status(404).json({ error: 'Stock not found or market data unavailable' });

    const currentPrice = quote.price;
    const orderPrice = type === 'MARKET' ? currentPrice : (limitPrice || currentPrice);
    const totalAmount = orderPrice * quantity;

    if (transactionType === 'BUY') {
      const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as any;
      if (user.balance < totalAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
    }

    if (transactionType === 'SELL') {
      const holding = db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, upperSymbol) as any;
      if (!holding || holding.quantity < quantity) {
        return res.status(400).json({ error: `You don't own enough shares of ${upperSymbol} to sell. Buy first or check your holdings.` });
      }
    }

    const result = db.prepare(`
      INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, upperSymbol, type, transactionType, quantity, orderPrice, limitPrice || null, 'PENDING');

    const orderId = result.lastInsertRowid as number;

    if (type === 'MARKET') {
      fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
    }

    res.json({ success: true, orderId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

export function fillOrder(orderId: number, userId: number, symbolRaw: string, transactionType: string, quantity: number, price: number) {
  const symbol = symbolRaw.toUpperCase();
  const totalAmount = price * quantity;

  db.transaction(() => {
    if (transactionType === 'BUY') {
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(totalAmount, userId);

      const holding = db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as any;
      if (holding) {
        const newQty = holding.quantity + quantity;
        const newAvg = ((holding.avg_buy_price * holding.quantity) + totalAmount) / newQty;
        db.prepare('UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?').run(newQty, newAvg, holding.id);
      } else {
        db.prepare('INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)')
          .run(userId, symbol, quantity, price);
      }
    } else {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalAmount, userId);

      const holding = db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as any;
      if (holding) {
        const newQty = holding.quantity - quantity;
        if (newQty <= 0) {
          db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
        } else {
          db.prepare('UPDATE holdings SET quantity = ? WHERE id = ?').run(newQty, holding.id);
        }
      }
    }

    db.prepare(`
      INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orderId, symbol, transactionType, quantity, price, totalAmount);

    db.prepare(`
      UPDATE orders SET status = 'FILLED', filled_at = datetime('now') WHERE id = ?
    `).run(orderId);

    // Create notification for the user
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, 'order')
      `).run(
        userId,
        `Order Filled: ${transactionType} ${symbol}`,
        `Your ${transactionType} order for ${quantity} shares of ${symbol} has been executed at ₹${price.toFixed(2)}`
      );
      console.log(`[Notification] Created for user ${userId}: ${transactionType} ${symbol}`);
    } catch (err) {
      console.error('[Notification] Failed to create notification:', err);
    }
  })();
}

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user!.id);
  res.json(orders);
});

router.post('/:id/cancel', authMiddleware, (req: AuthRequest, res) => {
  const orderId = parseInt(req.params.id);
  const userId = req.user!.id;

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'PENDING') return res.status(400).json({ error: 'Order already processed' });

  db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
  res.json({ success: true });
});

export default router;
