import { db } from '../db/index.js';
import { getCachedQuote, isMarketOpen } from './marketData.js';
import { fillOrder } from '../routes/orders.js';
import { logActivity } from './activityLogger.js';

interface PendingOrder {
  id: number;
  user_id: number;
  symbol: string;
  type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  limit_price: number | null;
  trigger_price: number | null;
  target_price: number | null;
  product_type: 'CNC' | 'MIS';
  status: string;
}

async function notify(userId: number, title: string, message: string, type: 'order' | 'price_alert' | 'system' = 'order') {
  try {
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`).run(userId, title, message, type);
  } catch {}
}

async function failOrder(order: PendingOrder, reason: string) {
  db.prepare(`UPDATE orders SET status = 'FAILED' WHERE id = ?`).run(order.id);
  await notify(
    order.user_id,
    `Order Failed: ${order.transaction_type} ${order.symbol}`,
    `Your ${order.type} ${order.transaction_type} order for ${order.quantity} ${order.symbol} could not be executed: ${reason}`,
  );
  logActivity(order.user_id, 'ORDER_FAILED', { orderId: order.id, symbol: order.symbol, reason });
}

async function tryFillOrder(order: PendingOrder, currentPrice: number): Promise<boolean> {
  // Determine fill condition based on order type
  if (order.type === 'LIMIT') {
    const limit = order.limit_price ?? 0;
    const ok = order.transaction_type === 'BUY' ? currentPrice <= limit : currentPrice >= limit;
    if (!ok) return false;
  } else if (order.type === 'SL' || order.type === 'SL-M') {
    const trigger = order.trigger_price ?? 0;
    // SL/SL-M: for SELL, triggers when price drops TO or BELOW trigger; for BUY, triggers when price rises TO or ABOVE trigger
    const triggered = order.transaction_type === 'SELL' ? currentPrice <= trigger : currentPrice >= trigger;
    if (!triggered) return false;
    // SL (not SL-M): additionally check limit price condition after trigger
    if (order.type === 'SL' && order.limit_price) {
      const limitOk = order.transaction_type === 'SELL' ? currentPrice >= order.limit_price : currentPrice <= order.limit_price;
      if (!limitOk) return false;
    }
  }

  const fillPrice = currentPrice;
  const totalAmount = fillPrice * order.quantity;

  if (order.transaction_type === 'BUY') {
    const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(order.user_id) as any;
    if (!user || Number(user.balance) < totalAmount) {
      await failOrder(order, 'Insufficient balance at execution time');
      return false;
    }
  } else {
    const holding = db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(order.user_id, order.symbol) as any;
    if (!holding || Number(holding.quantity) < order.quantity) {
      await failOrder(order, 'Insufficient holdings at execution time');
      return false;
    }
  }

  await fillOrder(order.id, order.user_id, order.symbol, order.transaction_type, order.quantity, fillPrice);
  console.log(`[OrderExecution] Filled order ${order.id}: ${order.transaction_type} ${order.quantity} ${order.symbol} @ ₹${fillPrice.toFixed(2)} (${order.type})`);
  logActivity(order.user_id, 'ORDER_FILLED', { orderId: order.id, symbol: order.symbol, type: order.type, price: fillPrice });
  return true;
}

// Check price alerts for a given symbol and trigger any that are met
function checkPriceAlerts(symbol: string, currentPrice: number) {
  const alerts = db.prepare(`SELECT * FROM price_alerts WHERE symbol = ? AND triggered = 0`).all(symbol) as any[];
  for (const alert of alerts) {
    const hit = alert.condition === 'above' ? currentPrice >= alert.target_price : currentPrice <= alert.target_price;
    if (!hit) continue;
    db.prepare(`UPDATE price_alerts SET triggered = 1 WHERE id = ?`).run(alert.id);
    notify(alert.user_id,
      `Price Alert: ${symbol} ${alert.condition === 'above' ? '▲' : '▼'} ₹${alert.target_price}`,
      `${symbol} is now trading at ₹${currentPrice.toFixed(2)}, which is ${alert.condition} your target of ₹${alert.target_price}`,
      'price_alert',
    );
    logActivity(alert.user_id, 'PRICE_ALERT_TRIGGERED' as any, { symbol, currentPrice, targetPrice: alert.target_price, condition: alert.condition });
  }
}

async function sweepPendingOrders(label: string) {
  const pending = db.prepare(`SELECT * FROM orders WHERE status = 'PENDING' ORDER BY created_at ASC`).all() as unknown as PendingOrder[];
  if (pending.length === 0) return { filled: 0, kept: 0, failed: 0 };

  // Build symbol set, fetch all at once from cache
  const symbols = [...new Set(pending.map(o => o.symbol))];
  const priceMap = new Map<string, number>();
  for (const sym of symbols) {
    const q = getCachedQuote(sym, 'NSE');
    if (q && q.price > 0) {
      priceMap.set(sym, q.price);
      checkPriceAlerts(sym, q.price);
    }
  }

  let filled = 0, kept = 0, failed = 0;
  for (const order of pending) {
    const currentPrice = priceMap.get(order.symbol);
    if (!currentPrice) { kept++; continue; }
    try {
      const ok = await tryFillOrder(order, currentPrice);
      if (ok) filled++; else kept++;
    } catch (err) {
      console.error(`[OrderExecution] order ${order.id} sweep error:`, err);
      try { await failOrder(order, 'Internal error during execution'); failed++; } catch {}
    }
  }
  if (filled || failed) console.log(`[OrderExecution:${label}] ${filled} filled, ${kept} kept, ${failed} failed`);
  return { filled, kept, failed };
}

// Auto square-off MIS positions at 3:20 PM IST
async function squareOffMisPositions() {
  console.log('[OrderExecution] MIS square-off starting');
  const today = new Date().toISOString().slice(0, 10);

  // Find all FILLED MIS orders from today
  const misOrders = db.prepare(`
    SELECT DISTINCT user_id, symbol FROM orders
    WHERE product_type = 'MIS' AND status = 'FILLED'
      AND date(filled_at) = ?
      AND transaction_type = 'BUY'
  `).all(today) as any[];

  for (const { user_id, symbol } of misOrders) {
    const holding = db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(user_id, symbol) as any;
    if (!holding || holding.quantity <= 0) continue;

    const q = getCachedQuote(symbol, 'NSE');
    const price = q?.price;
    if (!price) continue;

    try {
      const result = db.prepare(`
        INSERT INTO orders (user_id, symbol, type, transaction_type, quantity, price, product_type, status)
        VALUES (?, ?, 'MARKET', 'SELL', ?, ?, 'MIS', 'PENDING')
      `).run(user_id, symbol, holding.quantity, price);
      await fillOrder(Number(result.lastInsertRowid), user_id, symbol, 'SELL', holding.quantity, price);
      console.log(`[OrderExecution] MIS square-off: ${symbol} user ${user_id} @ ₹${price}`);
    } catch (err) {
      console.error(`[OrderExecution] MIS square-off failed for ${symbol}:`, err);
    }
  }
}

// Record end-of-day portfolio snapshots for all active users
async function recordPortfolioSnapshots() {
  console.log('[OrderExecution] Recording portfolio snapshots');
  const users = db.prepare(`SELECT id, balance FROM users`).all() as any[];
  const allHoldings = db.prepare(`SELECT user_id, symbol, quantity, avg_buy_price FROM holdings WHERE quantity > 0`).all() as any[];

  // Group holdings by user
  const holdingsByUser = new Map<number, any[]>();
  for (const h of allHoldings) {
    if (!holdingsByUser.has(h.user_id)) holdingsByUser.set(h.user_id, []);
    holdingsByUser.get(h.user_id)!.push(h);
  }

  for (const user of users) {
    const holdings = holdingsByUser.get(user.id) || [];
    let holdingsValue = 0;
    for (const h of holdings) {
      const q = getCachedQuote(h.symbol, 'NSE');
      const price = q?.price ?? h.avg_buy_price;
      holdingsValue += price * h.quantity;
    }
    const totalValue = user.balance + holdingsValue;
    try {
      db.prepare(`INSERT INTO portfolio_history (user_id, total_value, cash_balance) VALUES (?, ?, ?)`).run(user.id, totalValue, user.balance);
    } catch {}
  }
  console.log(`[OrderExecution] Snapshots recorded for ${users.length} users`);
}

export async function executePendingOrdersAtOpen() {
  console.log('[OrderExecution] === Market open sweep ===');
  await sweepPendingOrders('open');
}

export async function executePendingOrdersIntraday() {
  if (!isMarketOpen()) return;
  await sweepPendingOrders('intraday');
}

// ── Scheduler ──
let openTimer: NodeJS.Timeout | null = null;
let intradayInterval: NodeJS.Timeout | null = null;
let misTimer: NodeJS.Timeout | null = null;
let snapshotTimer: NodeJS.Timeout | null = null;

/** Next 9:15 AM IST = 3:45 AM UTC */
function nextMarketOpen(): Date {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 45, 0, 0));
  if (now.getTime() >= target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  while (true) {
    const istDay = new Date(target.getTime() + 5.5 * 3600000).getUTCDay();
    if (istDay === 0 || istDay === 6) target.setUTCDate(target.getUTCDate() + 1);
    else break;
  }
  return target;
}

/** Next 3:20 PM IST = 9:50 AM UTC (MIS square-off) */
function nextMisSquareOff(): Date {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 50, 0, 0));
  if (now.getTime() >= target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  while (true) {
    const istDay = new Date(target.getTime() + 5.5 * 3600000).getUTCDay();
    if (istDay === 0 || istDay === 6) target.setUTCDate(target.getUTCDate() + 1);
    else break;
  }
  return target;
}

/** Next 3:31 PM IST = 10:01 AM UTC (end-of-day snapshot) */
function nextSnapshotTime(): Date {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 1, 0, 0));
  if (now.getTime() >= target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  while (true) {
    const istDay = new Date(target.getTime() + 5.5 * 3600000).getUTCDay();
    if (istDay === 0 || istDay === 6) target.setUTCDate(target.getUTCDate() + 1);
    else break;
  }
  return target;
}

function scheduleNextOpen() {
  const next = nextMarketOpen();
  const delay = Math.max(1000, next.getTime() - Date.now());
  console.log(`[OrderExecution] Next market-open execution: ${next.toISOString()} (in ${Math.round(delay / 60000)} min)`);
  openTimer = setTimeout(async () => {
    try { await executePendingOrdersAtOpen(); } catch (err) { console.error('[OrderExecution] open sweep error:', err); }
    scheduleNextOpen();
  }, delay);
}

function scheduleMisSquareOff() {
  const next = nextMisSquareOff();
  const delay = Math.max(1000, next.getTime() - Date.now());
  misTimer = setTimeout(async () => {
    try { await squareOffMisPositions(); } catch (err) { console.error('[OrderExecution] MIS square-off error:', err); }
    scheduleMisSquareOff();
  }, delay);
}

function scheduleSnapshot() {
  const next = nextSnapshotTime();
  const delay = Math.max(1000, next.getTime() - Date.now());
  snapshotTimer = setTimeout(async () => {
    try { await recordPortfolioSnapshots(); } catch (err) { console.error('[OrderExecution] snapshot error:', err); }
    scheduleSnapshot();
  }, delay);
}

export function startOrderExecutionScheduler() {
  if (openTimer || intradayInterval) { console.log('[OrderExecution] Scheduler already running'); return; }
  console.log('[OrderExecution] Starting scheduler — open=9:15, MIS=3:20, snapshot=3:31, sweep=60s');

  scheduleNextOpen();
  scheduleMisSquareOff();
  scheduleSnapshot();

  intradayInterval = setInterval(() => {
    executePendingOrdersIntraday().catch((err) => console.error('[OrderExecution] intraday error:', err));
  }, 60_000);

  if (isMarketOpen()) {
    executePendingOrdersAtOpen().catch((err) => console.error('[OrderExecution] startup sweep error:', err));
  }
}

export function stopOrderExecutionScheduler() {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (intradayInterval) { clearInterval(intradayInterval); intradayInterval = null; }
  if (misTimer) { clearTimeout(misTimer); misTimer = null; }
  if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
  console.log('[OrderExecution] Scheduler stopped');
}
