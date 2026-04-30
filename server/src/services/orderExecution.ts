import { db } from '../db/index.js';
import { getQuote, isMarketOpen } from './marketData.js';
import { fillOrder } from '../routes/orders.js';
import { logActivity } from './activityLogger.js';

// ────────────────────────────────────────────────────────────────────────────
// Order execution engine for queued / pending orders.
//
// Behavioural rules:
//   • Orders placed AFTER hours are inserted as PENDING (no balance debit,
//     no holdings change). They sit waiting for the market to reopen.
//   • At MARKET OPEN (9:15 AM IST), `executePendingOrdersAtOpen` runs and:
//        – fills every PENDING MARKET order at the current (open) price
//        – fills every PENDING LIMIT order whose price condition is met
//        – leaves un-met LIMIT orders as PENDING (user can cancel them)
//   • DURING market hours, a periodic sweep (every 60s) re-checks PENDING
//     LIMIT orders so they fill the moment their threshold is touched.
//   • If a queued order can no longer be filled (insufficient balance /
//     no holdings) at execution time, it is marked FAILED and a
//     notification is created for the user.
// ────────────────────────────────────────────────────────────────────────────

interface PendingOrder {
  id: number;
  user_id: number;
  symbol: string;
  type: 'MARKET' | 'LIMIT';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  limit_price: number | null;
  status: string;
}

async function notify(userId: number, title: string, message: string) {
  try {
    await db.prepare(
      `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`,
    ).run(userId, title, message);
  } catch (err) {
    console.error('[OrderExecution] notify failed:', err);
  }
}

async function failOrder(order: PendingOrder, reason: string) {
  await db.prepare(`UPDATE orders SET status = 'FAILED' WHERE id = ?`).run(order.id);
  await notify(
    order.user_id,
    `Order Failed: ${order.transaction_type} ${order.symbol}`,
    `Your queued ${order.type} ${order.transaction_type} order for ${order.quantity} ${order.symbol} share(s) could not be executed: ${reason}`,
  );
  logActivity(order.user_id, 'ORDER_FAILED', {
    orderId: order.id,
    symbol: order.symbol,
    type: order.type,
    transactionType: order.transaction_type,
    quantity: order.quantity,
    reason,
  });
}

/**
 * Try to fill one pending order at `currentPrice`. Returns true if filled.
 *  - For MARKET orders: always fills (after re-validation).
 *  - For LIMIT orders: only fills if the limit condition is met.
 *  - Re-validates balance (BUY) / holdings (SELL); marks FAILED if not.
 */
async function tryFillOrder(order: PendingOrder, currentPrice: number): Promise<boolean> {
  // For LIMIT orders, check the condition first.
  if (order.type === 'LIMIT') {
    const limit = order.limit_price ?? 0;
    const ok = order.transaction_type === 'BUY' ? currentPrice <= limit : currentPrice >= limit;
    if (!ok) return false; // keep PENDING — sweep will retry next tick
  }

  // Re-validate balance/holdings at the moment of execution.
  const totalAmount = currentPrice * order.quantity;
  if (order.transaction_type === 'BUY') {
    const user = (await db.prepare('SELECT balance FROM users WHERE id = ?').get(order.user_id)) as any;
    if (!user || Number(user.balance) < totalAmount) {
      await failOrder(order, 'Insufficient balance at execution time');
      return false;
    }
  } else {
    const holding = (await db
      .prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?')
      .get(order.user_id, order.symbol)) as any;
    if (!holding || Number(holding.quantity) < order.quantity) {
      await failOrder(order, 'Insufficient holdings at execution time');
      return false;
    }
  }

  // fillOrder handles balance/holdings/transaction/notification atomically.
  await fillOrder(
    order.id,
    order.user_id,
    order.symbol,
    order.transaction_type,
    order.quantity,
    currentPrice,
  );
  console.log(
    `[OrderExecution] Filled order ${order.id}: ${order.transaction_type} ${order.quantity} ${order.symbol} @ ₹${currentPrice.toFixed(2)}`,
  );
  logActivity(order.user_id, 'ORDER_FILLED', {
    orderId: order.id,
    symbol: order.symbol,
    type: order.type,
    transactionType: order.transaction_type,
    quantity: order.quantity,
    price: currentPrice,
    total: currentPrice * order.quantity,
  });
  return true;
}

/**
 * Sweep all PENDING orders, filling those whose conditions are satisfied.
 * Used both at market-open (where MARKET orders are also filled) and
 * during the periodic intra-day sweep (LIMIT orders only — but MARKET
 * orders are also processed defensively).
 */
async function sweepPendingOrders(label: string) {
  const pending = (await db
    .prepare(`SELECT * FROM orders WHERE status = 'PENDING' ORDER BY created_at ASC`)
    .all()) as unknown as PendingOrder[];

  if (pending.length === 0) return { filled: 0, kept: 0, failed: 0 };

  let filled = 0, kept = 0, failed = 0;
  for (const order of pending) {
    try {
      const quote = await getQuote(order.symbol, 'NSE');
      if (!quote) {
        kept++;
        continue; // try again next sweep
      }
      const ok = await tryFillOrder(order, quote.price);
      if (ok) filled++; else kept++;
    } catch (err) {
      console.error(`[OrderExecution] order ${order.id} sweep error:`, err);
      try {
        await failOrder(order, 'Internal error during execution');
        failed++;
      } catch {}
    }
  }
  if (filled || failed) {
    console.log(`[OrderExecution:${label}] ${filled} filled, ${kept} kept pending, ${failed} failed (of ${pending.length})`);
  }
  return { filled, kept, failed };
}

/** Public: full sweep at market open. */
export async function executePendingOrdersAtOpen() {
  console.log('[OrderExecution] === Market open sweep starting ===');
  await sweepPendingOrders('open');
}

/** Public: periodic sweep during market hours (cheap — no-ops if nothing pending). */
export async function executePendingOrdersIntraday() {
  if (!isMarketOpen()) return;
  await sweepPendingOrders('intraday');
}

// ────────────────────────────────────────────────────────────────────────────
// Scheduler
// ────────────────────────────────────────────────────────────────────────────
let openTimer: NodeJS.Timeout | null = null;
let intradayInterval: NodeJS.Timeout | null = null;

/** Returns the next 9:15 AM IST (skipping weekends) as a UTC Date.
 *  9:15 AM IST  ==  3:45 AM UTC (IST = UTC + 5:30). */
function nextMarketOpen(): Date {
  const now = new Date();
  // Build today's 9:15 IST in UTC terms.
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 45, 0, 0),
  );
  if (now.getTime() >= target.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  // Skip weekends — compute the day-of-week of `target` AS SEEN IN IST.
  while (true) {
    const istDay = new Date(target.getTime() + 5.5 * 3600000).getUTCDay();
    if (istDay === 0 || istDay === 6) {
      target.setUTCDate(target.getUTCDate() + 1);
    } else {
      break;
    }
  }
  return target;
}

function scheduleNextOpen() {
  const nextOpenUtc = nextMarketOpen();
  const delayMs = Math.max(1000, nextOpenUtc.getTime() - Date.now());
  console.log(
    `[OrderExecution] Next market-open execution scheduled for ${nextOpenUtc.toISOString()} (in ${Math.round(delayMs / 60000)} minutes)`,
  );
  openTimer = setTimeout(async () => {
    try {
      await executePendingOrdersAtOpen();
    } catch (err) {
      console.error('[OrderExecution] open sweep failed:', err);
    }
    scheduleNextOpen();
  }, delayMs);
}

export function startOrderExecutionScheduler() {
  if (openTimer || intradayInterval) {
    console.log('[OrderExecution] Scheduler already running');
    return;
  }
  console.log('[OrderExecution] Starting scheduler — open=9:15 IST, intraday sweep every 60s');

  // 1) Market-open one-shot timer (re-arms each day).
  scheduleNextOpen();

  // 2) Periodic intra-day sweep (every 60s, no-op when market is closed).
  intradayInterval = setInterval(() => {
    executePendingOrdersIntraday().catch((err) =>
      console.error('[OrderExecution] intraday sweep failed:', err),
    );
  }, 60_000);

  // 3) If the server happens to be started while market is already open,
  //    immediately run a sweep so any leftover PENDING orders from a previous
  //    after-hours session don't have to wait an extra minute.
  if (isMarketOpen()) {
    executePendingOrdersAtOpen().catch((err) =>
      console.error('[OrderExecution] startup sweep failed:', err),
    );
  }
}

export function stopOrderExecutionScheduler() {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (intradayInterval) { clearInterval(intradayInterval); intradayInterval = null; }
  console.log('[OrderExecution] Scheduler stopped');
}
