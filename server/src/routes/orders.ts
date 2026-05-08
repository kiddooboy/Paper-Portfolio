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
  type: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  transactionType: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  productType: z.enum(['CNC', 'MIS']).optional().default('CNC'),
});

const modifySchema = z.object({
  quantity: z.number().int().positive().optional(),
  limitPrice: z.number().optional(),
  triggerPrice: z.number().optional(),
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, exchange, type, transactionType, quantity, limitPrice, triggerPrice, targetPrice, productType } = orderSchema.parse(req.body);
    const userId = req.user!.id;
    const ex = exchange ?? 'NSE';
    const upperSymbol = symbol.toUpperCase();

    // Guard: only allow trading known NSE stocks
    const known = await db
      .prepare(`SELECT 1 FROM stocks WHERE symbol = ? AND exchange = 'NSE' LIMIT 1`)
      .get(upperSymbol);
    if (!known) return res.status(400).json({ error: 'Trading restricted to NSE-listed stocks only' });

    // SL/SL-M require a trigger price
    if ((type === 'SL' || type === 'SL-M') && !triggerPrice) {
      return res.status(400).json({ error: 'Trigger price required for SL/SL-M orders' });
    }

    const quote = await getQuote(upperSymbol, ex);
    if (!quote) return res.status(404).json({ error: 'Stock not found or market data unavailable' });

    const currentPrice = quote.price;

    // ── Target price semantics ──
    // SELL + target (no SL trigger): treat as a LIMIT SELL at target price.
    //   User wants to sell only when price rises to target — hold the order until then.
    // BUY + target: buy normally; on fill a child SELL LIMIT at target is auto-created (take-profit).
    let effectiveType = type;
    let effectiveLimitPrice = limitPrice;
    if (transactionType === 'SELL' && targetPrice && !triggerPrice) {
      effectiveType = 'LIMIT';
      effectiveLimitPrice = targetPrice;
    }

    const orderPrice = effectiveType === 'MARKET' ? currentPrice : (effectiveLimitPrice || triggerPrice || currentPrice);
    const totalAmount = orderPrice * quantity;
    const marketOpen = isMarketOpen();

    let orderId = 0;
    let queued = false;
    let filledNow = false;
    try {
      await db.transaction(async () => {
        if (transactionType === 'BUY') {
          const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
          if (!user) throw new Error('User not found');
          if (Number(user.balance) < totalAmount) throw new Error('Insufficient balance');
        }

        if (transactionType === 'SELL') {
          const holding = (await db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, upperSymbol)) as any;
          if (!holding || Number(holding.quantity) < quantity) {
            throw new Error(`You don't own enough shares of ${upperSymbol} to sell`);
          }
        }

        const result = await db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, trigger_price, target_price, product_type, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, upperSymbol, effectiveType, transactionType, quantity, orderPrice,
               effectiveLimitPrice || null, triggerPrice || null, targetPrice || null, productType, 'PENDING');

        orderId = result.lastInsertRowid as number;

        if (marketOpen && effectiveType === 'MARKET') {
          // MARKET orders: fill immediately at current price
          await fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
          filledNow = true;
        } else if (marketOpen && (effectiveType === 'LIMIT' || effectiveType === 'SL' || effectiveType === 'SL-M')) {
          // LIMIT/SL orders: check if condition is already met; fill now if so, otherwise leave PENDING for sweep
          const conditionMet = checkFillCondition(effectiveType, transactionType, currentPrice, effectiveLimitPrice || null, triggerPrice || null);
          if (conditionMet) {
            await fillOrder(orderId, userId, upperSymbol, transactionType, quantity, currentPrice);
            filledNow = true;
          }
        } else if (!marketOpen) {
          queued = true;
          await db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
            userId,
            `Order Queued: ${transactionType} ${upperSymbol}`,
            `Markets are closed. Your ${effectiveType} ${transactionType} order for ${quantity} ${upperSymbol} share(s) will execute at next market open (9:15 AM IST).`,
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
      status: queued ? 'PENDING' : (filledNow ? 'FILLED' : 'PENDING'),
      message: queued
        ? 'Markets are closed. Order queued for execution at next market open (9:15 AM IST).'
        : undefined,
    });

    logActivity(userId, transactionType === 'BUY' ? 'BUY_ORDER' : 'SELL_ORDER' as any, {
      orderId, symbol: upperSymbol, type: effectiveType, quantity, price: orderPrice,
      total: totalAmount, queued, productType, targetPrice,
    }, getClientIp(req));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// Pure function: returns true if a LIMIT/SL/SL-M order's fill condition is already met at currentPrice
function checkFillCondition(
  type: string,
  transactionType: string,
  currentPrice: number,
  limitPrice: number | null,
  triggerPrice: number | null,
): boolean {
  if (type === 'LIMIT') {
    const limit = limitPrice ?? 0;
    return transactionType === 'BUY' ? currentPrice <= limit : currentPrice >= limit;
  }
  if (type === 'SL' || type === 'SL-M') {
    const trigger = triggerPrice ?? 0;
    const triggered = transactionType === 'SELL' ? currentPrice <= trigger : currentPrice >= trigger;
    if (!triggered) return false;
    if (type === 'SL' && limitPrice) {
      return transactionType === 'SELL' ? currentPrice >= limitPrice : currentPrice <= limitPrice;
    }
    return true;
  }
  return false;
}

// PUT /api/orders/:id — modify a PENDING order
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.user!.id;
    const updates = modifySchema.parse(req.body);

    const order = (await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId)) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING') return res.status(400).json({ error: 'Only PENDING orders can be modified' });

    const newQty = updates.quantity ?? order.quantity;
    const newLimitPrice = updates.limitPrice ?? order.limit_price;
    const newTriggerPrice = updates.triggerPrice ?? order.trigger_price;
    const newPrice = newLimitPrice || newTriggerPrice || order.price;

    // Re-validate balance/holdings if quantity changed
    if (updates.quantity) {
      if (order.transaction_type === 'BUY') {
        const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)) as any;
        const required = newPrice * newQty;
        if (Number(user.balance) < required) return res.status(400).json({ error: 'Insufficient balance for new quantity' });
      } else {
        const holding = (await db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, order.symbol)) as any;
        if (!holding || Number(holding.quantity) < newQty) return res.status(400).json({ error: 'Insufficient holdings for new quantity' });
      }
    }

    await db.prepare(`
      UPDATE orders SET quantity = ?, price = ?, limit_price = ?, trigger_price = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newQty, newPrice, newLimitPrice || null, newTriggerPrice || null, orderId);

    logActivity(userId, 'MODIFY_ORDER' as any, { orderId, symbol: order.symbol, newQty, newLimitPrice, newTriggerPrice }, getClientIp(req));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// Avg-cost P&L helper — records realized P&L using the holding's weighted average buy price.
// This keeps realized + unrealized consistent (both use avg_buy_price as cost basis).
async function recordAvgCostPnl(userId: number, sellOrderId: number, symbol: string, quantity: number, avgBuyPrice: number, sellPrice: number) {
  const pnl = (sellPrice - avgBuyPrice) * quantity;
  await db.prepare(`
    INSERT INTO trade_pnl (user_id, symbol, sell_order_id, quantity, buy_price, sell_price, realized_pnl)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, symbol, sellOrderId, quantity, avgBuyPrice, sellPrice, pnl);
}

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
        if (newQty <= 0) await db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
        else await db.prepare('UPDATE holdings SET quantity = ? WHERE id = ?').run(newQty, holding.id);
        await recordAvgCostPnl(userId, orderId, symbol, quantity, holding.avg_buy_price, price);
      }
    }

    await db.prepare(`
      INSERT INTO transactions (user_id, order_id, symbol, type, quantity, price, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orderId, symbol, transactionType, quantity, price, totalAmount);

    await db.prepare(`UPDATE orders SET status = 'FILLED', filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);

    // Auto-create take-profit child order: when a BUY with target_price fills,
    // place a PENDING SELL LIMIT at target so profit books automatically.
    let targetNote = '';
    if (transactionType === 'BUY') {
      const parentOrder = db.prepare('SELECT target_price, product_type FROM orders WHERE id = ?').get(orderId) as any;
      if (parentOrder?.target_price) {
        db.prepare(`
          INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, limit_price, product_type, status)
          VALUES (?, ?, 'LIMIT', 'SELL', ?, ?, ?, ?, 'PENDING')
        `).run(userId, symbol, quantity, parentOrder.target_price, parentOrder.target_price, parentOrder.product_type || 'CNC');
        targetNote = ` · Take-profit SELL set at ₹${Number(parentOrder.target_price).toFixed(2)}`;
      }
    }

    try {
      db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`).run(
        userId,
        `Order Filled: ${transactionType} ${symbol}`,
        `Your ${transactionType} order for ${quantity} shares of ${symbol} has been executed at ₹${price.toFixed(2)}${targetNote}`,
      );
    } catch {}
  });
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const orders = await db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`).all(req.user!.id);
  res.json(orders);
});

router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  const orderId = parseInt(req.params.id);
  const userId = req.user!.id;

  const order = (await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId)) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'PENDING') return res.status(400).json({ error: 'Order already processed' });

  await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
  logActivity(userId, 'CANCEL_ORDER', { orderId, symbol: order.symbol, type: order.type }, getClientIp(req));
  res.json({ success: true });
});

export default router;
