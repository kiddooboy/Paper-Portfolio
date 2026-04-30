import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getQuote, isMarketOpen } from '../services/marketData.js';
import { z } from 'zod';
import { logActivity, getClientIp } from '../services/activityLogger.js';

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
    const known = await db
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
    const marketOpen = isMarketOpen();

    // Validate + place + (maybe) fill inside ONE transaction.
    // This prevents a user from over-buying / over-selling when two
    // requests (e.g. two browser tabs) hit the server concurrently.
    //
    // Rules:
    //   • Market OPEN  + MARKET order → fill immediately at current price.
    //   • Market OPEN  + LIMIT  order → leave PENDING; the periodic sweep
    //     fills it as soon as the price condition is met.
    //   • Market CLOSED + any order   → queue as PENDING. It will be filled
    //     by the open-time scheduler at 9:15 AM IST on the next trading day
    //     (MARKET orders fill at the open price; LIMIT orders fill if
    //     conditions are met, otherwise stay PENDING).
    let orderId = 0;
    let queued = false;
    try {
      await db.transaction(async () => {
        if (transactionType === 'BUY') {
          const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
          if (!user) throw new Error('User not found');
          if (Number(user.balance) < totalAmount) {
            throw new Error('Insufficient balance');
          }
        }

        if (transactionType === 'SELL') {
          const holding = (await db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, upperSymbol)) as any;
          if (!holding || Number(holding.quantity) < quantity) {
            throw new Error(`You don't own enough shares of ${upperSymbol} to sell. Buy first or check your holdings.`);
          }
        }

        const result = await db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, upperSymbol, type, transactionType, quantity, orderPrice, limitPrice || null, 'PENDING');

        orderId = result.lastInsertRowid as number;

        if (marketOpen && type === 'MARKET') {
          // Live fill at current price
          await fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
        } else if (!marketOpen) {
          queued = true;
          // Notify the user that the order has been queued for next open
          await db.prepare(`
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, ?, ?, 'order')
          `).run(
            userId,
            `Order Queued: ${transactionType} ${upperSymbol}`,
            `Markets are closed. Your ${type} ${transactionType} order for ${quantity} ${upperSymbol} share(s) will be executed when markets reopen at 9:15 AM IST on the next trading day.`,
          );
        }
      });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Order failed' });
    }

    res.json({
      success: true,
      orderId,
      queued,
      status: queued ? 'PENDING' : (marketOpen && type === 'MARKET' ? 'FILLED' : 'PENDING'),
      message: queued
        ? 'Markets are closed. Order queued for execution at next market open (9:15 AM IST).'
        : undefined,
    });

    // Activity logging (fire-and-forget, after response)
    const action = transactionType === 'BUY' ? 'BUY_ORDER' : 'SELL_ORDER';
    logActivity(userId, action as any, {
      orderId,
      symbol: upperSymbol,
      type,
      quantity,
      price: orderPrice,
      total: totalAmount,
      queued,
      status: queued ? 'QUEUED' : (marketOpen && type === 'MARKET' ? 'FILLED' : 'PENDING'),
    }, getClientIp(req));
    if (queued) {
      logActivity(userId, 'ORDER_QUEUED', { orderId, symbol: upperSymbol, type, quantity }, getClientIp(req));
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

export async function fillOrder(orderId: number, userId: number, symbolRaw: string, transactionType: string, quantity: number, price: number) {
  const symbol = symbolRaw.toUpperCase();
  const totalAmount = price * quantity;

  await db.transaction(async () => {
    if (transactionType === 'BUY') {
      await db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(totalAmount, userId);

      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity + quantity;
        const newAvg = ((holding.avg_buy_price * holding.quantity) + totalAmount) / newQty;
        await db.prepare('UPDATE holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?').run(newQty, newAvg, holding.id);
      } else {
        await db.prepare('INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)')
          .run(userId, symbol, quantity, price);
      }
    } else {
      await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalAmount, userId);

      const holding = (await db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol)) as any;
      if (holding) {
        const newQty = holding.quantity - quantity;
        if (newQty <= 0) {
          await db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
        } else {
          await db.prepare('UPDATE holdings SET quantity = ? WHERE id = ?').run(newQty, holding.id);
        }
      }
    }

    await db.prepare(`
      INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orderId, symbol, transactionType, quantity, price, totalAmount);

    await db.prepare(`
      UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(orderId);

    // Create notification for the user
    try {
      await db.prepare(`
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
  });
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const orders = await db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user!.id);
  res.json(orders);
});

router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  const orderId = parseInt(req.params.id);
  const userId = req.user!.id;

  const order = (await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId)) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'PENDING') return res.status(400).json({ error: 'Order already processed' });

  await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);

  logActivity(userId, 'CANCEL_ORDER', {
    orderId,
    symbol: order.symbol,
    type: order.type,
    transactionType: order.transaction_type,
    quantity: order.quantity,
  }, getClientIp(req));

  res.json({ success: true });
});

export default router;
