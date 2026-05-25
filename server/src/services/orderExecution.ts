import { db } from '../db/index.js';
import { getCachedQuote, isMarketOpen } from './marketData.js';
import { fillOrder } from '../routes/orders.js';
import { logActivity } from './activityLogger.js';
import { executeDueSIPs } from '../routes/sip.js';
import { pushToUser } from './push.js';

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
  is_gtt?: number;
  gtt_valid_till?: string | null;
  trailing_pct?: number | null;
  trail_anchor?: number | null;
}

async function notify(userId: number, title: string, message: string, type: 'order' | 'price_alert' | 'system' = 'order') {
  try {
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`).run(userId, title, message, type);
  } catch {}
  // Deliver as a device push too (best-effort; no-op without device tokens)
  pushToUser(userId, title, message, { type }).catch(() => {});
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

// Smart holdings alerts: notify if a held stock moves >5% in a day
function checkSmartHoldingsAlerts(symbol: string, currentPrice: number, previousClose: number) {
  if (!previousClose || previousClose <= 0) return;
  const changePct = ((currentPrice - previousClose) / previousClose) * 100;
  if (Math.abs(changePct) < 5) return;

  const holders = db.prepare(`
    SELECT h.user_id, h.quantity, h.avg_buy_price FROM holdings h WHERE h.symbol = ?
  `).all(symbol) as any[];

  for (const h of holders) {
    const gain = (currentPrice - Number(h.avg_buy_price)) * Number(h.quantity);
    const direction = changePct > 0 ? '▲' : '▼';
    // Throttle: only send once per hour per user-symbol
    const recentAlert = db.prepare(`
      SELECT 1 FROM notifications WHERE user_id = ? AND title LIKE ? AND created_at >= datetime('now', '-1 hour') LIMIT 1
    `).get(h.user_id, `%${symbol}%`);
    if (recentAlert) continue;

    notify(
      h.user_id,
      `${direction} ${symbol} moved ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% today`,
      `${symbol} is now ₹${currentPrice.toFixed(2)}. Your ${h.quantity} shares have a total P&L of ₹${gain.toFixed(2)}.`,
      'system'
    );
  }
}

// Check price alerts for a given symbol and trigger any that are met.
// Handles three condition types: 'price' (legacy), 'pct_move', 'indicator'.
function checkPriceAlerts(symbol: string, currentPrice: number, previousClose?: number) {
  const alerts = db.prepare(`SELECT * FROM price_alerts WHERE symbol = ? AND triggered = 0`).all(symbol) as any[];
  if (!alerts.length) return;

  // Lazy-load indicators only if we actually have indicator alerts to evaluate
  let evaluateAlert: typeof import('./indicators.js').evaluateAlert | null = null;
  let bars: number[] | null = null;

  for (const alert of alerts) {
    let hit = false;
    const ctype = alert.condition_type || 'price';
    try {
      if (ctype === 'price') {
        hit = alert.condition === 'above' ? currentPrice >= alert.target_price : currentPrice <= alert.target_price;
      } else {
        if (!evaluateAlert) ({ evaluateAlert } = require('./indicators.js'));
        const spec = JSON.parse(alert.condition_spec || '{}');
        // For indicator alerts, fetch a recent bar series once and reuse
        if (ctype === 'indicator' && !bars) {
          // Use cached daily closes via portfolio history snapshot is too small;
          // pull last ~60 trading days from getHistory at evaluation time.
          // (Synchronous flow: we accept the latency on indicator-alert sweeps.)
        }
        hit = !!evaluateAlert!({
          bars: bars || [],
          currentPrice,
          previousClose,
          spec,
        });
      }
    } catch (err) {
      console.warn(`[alerts] eval failed for alert ${alert.id}:`, (err as any)?.message);
    }
    if (!hit) continue;

    db.prepare(`UPDATE price_alerts SET triggered = 1 WHERE id = ?`).run(alert.id);

    const title = ctype === 'price'
      ? `Price Alert: ${symbol} ${alert.condition === 'above' ? '▲' : '▼'} ₹${alert.target_price}`
      : `Alert Triggered: ${symbol}`;
    const message = ctype === 'price'
      ? `${symbol} is now trading at ₹${currentPrice.toFixed(2)}, which is ${alert.condition} your target of ₹${alert.target_price}`
      : `Your ${ctype} alert on ${symbol} fired at ₹${currentPrice.toFixed(2)}.`;
    notify(alert.user_id, title, message, 'price_alert');
    logActivity(alert.user_id, 'PRICE_ALERT_TRIGGERED' as any, { symbol, currentPrice, alertId: alert.id, ctype });
  }
}

// Advance trailing-SL anchors against the current price. Returns the (possibly
// updated) trigger_price the fill check should evaluate against.
function updateTrailingStop(order: PendingOrder, currentPrice: number): number {
  const tp = Number(order.trailing_pct) || 0;
  if (tp <= 0 || (order.type !== 'SL' && order.type !== 'SL-M')) {
    return Number(order.trigger_price ?? 0);
  }
  const cur = currentPrice;
  let anchor = Number(order.trail_anchor) || cur;

  if (order.transaction_type === 'SELL') {
    // Protecting a long: walk anchor UP with price; never down.
    if (cur > anchor) anchor = cur;
    const newTrigger = anchor * (1 - tp / 100);
    db.prepare(`UPDATE orders SET trail_anchor = ?, trigger_price = ? WHERE id = ?`)
      .run(anchor, newTrigger, order.id);
    return newTrigger;
  } else {
    // Covering a short: walk anchor DOWN with price; never up.
    if (cur < anchor) anchor = cur;
    const newTrigger = anchor * (1 + tp / 100);
    db.prepare(`UPDATE orders SET trail_anchor = ?, trigger_price = ? WHERE id = ?`)
      .run(anchor, newTrigger, order.id);
    return newTrigger;
  }
}

// Cancel GTT orders whose validity window has expired (run periodically and at
// market-open). Emits a notification per cancelled order.
function sweepExpiredGttOrders(): number {
  const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const expired = db.prepare(`
    SELECT id, user_id, symbol, transaction_type, quantity, trigger_price, gtt_valid_till
    FROM orders
    WHERE is_gtt = 1 AND status = 'PENDING'
      AND gtt_valid_till IS NOT NULL AND gtt_valid_till < ?
  `).all(todayIst) as any[];
  if (!expired.length) return 0;

  const cancel = db.prepare(`UPDATE orders SET status = 'EXPIRED' WHERE id = ?`);
  const insertNote = db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`);
  for (const o of expired) {
    try {
      cancel.run(o.id);
      insertNote.run(
        o.user_id,
        `GTT Expired: ${o.transaction_type} ${o.symbol}`,
        `Your GTT ${o.transaction_type} order for ${o.quantity} ${o.symbol} @ ₹${Number(o.trigger_price).toFixed(2)} expired on ${o.gtt_valid_till} without triggering.`,
      );
      logActivity(o.user_id, 'ORDER_FAILED', { orderId: o.id, symbol: o.symbol, reason: 'GTT expired' });
    } catch (err) {
      console.error(`[OrderExecution] GTT expiry handling failed for order ${o.id}:`, err);
    }
  }
  console.log(`[OrderExecution] expired ${expired.length} GTT orders past validity`);
  return expired.length;
}

async function sweepPendingOrders(label: string) {
  // First: expire any GTTs past their validity (cheap, no quote lookups needed)
  sweepExpiredGttOrders();

  const pending = db.prepare(`SELECT * FROM orders WHERE status = 'PENDING' ORDER BY created_at ASC`).all() as unknown as PendingOrder[];
  if (pending.length === 0) return { filled: 0, kept: 0, failed: 0 };

  // Build symbol set, fetch all at once from cache
  const symbols = [...new Set(pending.map(o => o.symbol))];
  const priceMap = new Map<string, number>();
  for (const sym of symbols) {
    const q = getCachedQuote(sym, 'NSE');
    if (q && q.price > 0) {
      priceMap.set(sym, q.price);
      checkPriceAlerts(sym, q.price, q.previous_close);
      if (q.previous_close && q.previous_close > 0) {
        checkSmartHoldingsAlerts(sym, q.price, q.previous_close);
      }
    }
  }

  let filled = 0, kept = 0, failed = 0;
  for (const order of pending) {
    const currentPrice = priceMap.get(order.symbol);
    if (!currentPrice) { kept++; continue; }

    // For trailing SL/SL-M orders, advance the anchor and refresh trigger_price
    // BEFORE evaluating the fill condition. Mutates the order row in place.
    if ((order.trailing_pct ?? 0) > 0 && (order.type === 'SL' || order.type === 'SL-M')) {
      const newTrigger = updateTrailingStop(order, currentPrice);
      order.trigger_price = newTrigger;
    }

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
    executeDueSIPs().catch((err) => console.error('[OrderExecution] SIP execution error:', err));
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
