import { db } from '../db/index.js';
import { getQuote } from './marketData.js';
import { fillOrder } from '../routes/orders.js';

/**
 * Execute all pending orders at market close
 * This should be scheduled to run at 3:30 PM IST daily
 */
export async function executePendingOrdersAtClose() {
  console.log('[OrderExecution] Starting end-of-day order execution...');

  // Get all pending orders
  const pendingOrders = (await db.prepare(`
    SELECT * FROM orders WHERE status = 'PENDING'
  `).all()) as any[];

  if (pendingOrders.length === 0) {
    console.log('[OrderExecution] No pending orders to execute');
    return;
  }

  console.log(`[OrderExecution] Found ${pendingOrders.length} pending orders`);

  let executed = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    try {
      // Get current market price
      const quote = await getQuote(order.symbol, order.exchange || 'NSE');
      if (!quote) {
        console.error(`[OrderExecution] Failed to get quote for ${order.symbol}`);
        failed++;
        // Mark as failed
        await db.prepare("UPDATE orders SET status = 'FAILED' WHERE id = ?").run(order.id);
        continue;
      }

      const currentPrice = quote.price;

      // For LIMIT orders, check if price is favorable
      if (order.type === 'LIMIT') {
        const shouldExecute = order.transaction_type === 'BUY'
          ? currentPrice <= (order.limit_price || Infinity)
          : currentPrice >= (order.limit_price || 0);

        if (!shouldExecute) {
          console.log(`[OrderExecution] LIMIT order ${order.id} not executed - price not favorable`);
          // Keep as pending for next day or cancel
          await db.prepare("UPDATE orders SET status = 'EXPIRED' WHERE id = ?").run(order.id);
          continue;
        }
      }

      // Execute the order
      await fillOrder(order.id, order.user_id, order.symbol, order.transaction_type, order.quantity, currentPrice);
      executed++;
      console.log(`[OrderExecution] Executed order ${order.id}: ${order.transaction_type} ${order.quantity} ${order.symbol} @ ${currentPrice}`);

      // Create notification for the user
      await db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, 'order')
      `).run(
        order.user_id,
        `Order Filled: ${order.transaction_type} ${order.symbol}`,
        `Your ${order.transaction_type} order for ${order.quantity} shares of ${order.symbol} has been executed at ₹${currentPrice.toFixed(2)}`
      );
    } catch (error) {
      console.error(`[OrderExecution] Failed to execute order ${order.id}:`, error);
      failed++;
      await db.prepare("UPDATE orders SET status = 'FAILED' WHERE id = ?").run(order.id);
    }
  }

  console.log(`[OrderExecution] Execution complete: ${executed} executed, ${failed} failed`);
}

/**
 * Start the scheduled order execution job
 * Runs daily at 3:30 PM IST
 */
let executionTimer: NodeJS.Timeout | null = null;

export function startOrderExecutionScheduler() {
  if (executionTimer) {
    console.log('[OrderExecution] Scheduler already running');
    return;
  }

  console.log('[OrderExecution] Starting scheduler for 3:30 PM IST execution');

  // Calculate time until next 3:30 PM IST
  function scheduleNextExecution() {
    const now = new Date();
    const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // UTC+5:30
    
    const targetTime = new Date(istTime);
    targetTime.setHours(15, 30, 0, 0); // 3:30 PM

    // If target time has passed today, schedule for tomorrow
    if (istTime > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const delay = targetTime.getTime() - istTime.getTime();
    const delayMs = delay > 0 ? delay : 24 * 60 * 60 * 1000; // Default to 24 hours

    console.log(`[OrderExecution] Next execution scheduled for ${targetTime.toISOString()} (in ${Math.round(delayMs / 1000 / 60)} minutes)`);

    executionTimer = setTimeout(async () => {
      await executePendingOrdersAtClose();
      // Schedule next day
      scheduleNextExecution();
    }, delayMs);
  }

  scheduleNextExecution();
}

export function stopOrderExecutionScheduler() {
  if (executionTimer) {
    clearTimeout(executionTimer);
    executionTimer = null;
    console.log('[OrderExecution] Scheduler stopped');
  }
}
