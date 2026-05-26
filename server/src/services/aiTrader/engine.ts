// AI Trade engine — the autonomous brain.
//
// One tick (default every 15s while the market is open) does, for each user
// who has the AI toggle ON and the kill switch OFF:
//   1. MONITOR open AI positions → exit on stop-loss / target / trailing-stop,
//      and force square-off after the configured time.
//   2. Respect guardrails — daily loss limit, max trades/day, session window.
//   3. SCAN the watchlist → score with the signal engine → enter the best
//      candidate(s) up to max positions, sized from allocated capital + risk.
//
// Trades go through the BrokerAdapter (paper today, real broker pluggable).
// Claude narrates entries for the console; the engine never waits on it to act.

import { db } from '../../db/index.js';
import { getQuote, getHistory, isMarketOpen, getISTDate } from '../marketData.js';
import { pushToUser } from '../push.js';
import { getRiskProfile } from './riskProfiles.js';
import { analyzeSymbol } from './signals.js';
import { explainEntry } from './explain.js';
import { getBroker } from './broker/index.js';
import { logConsole } from './console.js';

const TICK_MS = 15_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

// Per-symbol intraday candle cache (shared across users) to avoid hammering the
// data source — candles only need refreshing every couple of minutes.
const candleCache = new Map<string, { at: number; bars: any[] }>();
const CANDLE_TTL_MS = 120_000;

async function getIntradayBars(symbol: string) {
  const hit = candleCache.get(symbol);
  if (hit && Date.now() - hit.at < CANDLE_TTL_MS) return hit.bars;
  const from = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const bars = await getHistory(symbol, 'NSE', from, '5m');
  candleCache.set(symbol, { at: Date.now(), bars });
  return bars;
}

function istMinutes(): number {
  const d = getISTDate();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmToMin(s: string): number {
  const [h, m] = (s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Realized P&L booked by the AI today (for the daily-loss guardrail). */
function todaysRealized(userId: number): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(realized_pnl), 0) AS pnl FROM ai_positions
     WHERE user_id = ? AND status = 'closed' AND date(closed_at) = date('now')`,
  ).get(userId) as any;
  return row?.pnl ?? 0;
}

function entriesToday(userId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_positions WHERE user_id = ? AND date(opened_at) = date('now')`,
  ).get(userId) as any;
  return row?.n ?? 0;
}

interface Cfg {
  user_id: number; is_enabled: number; kill_switch: number;
  allocation_pct: number; capital_amount: number | null; risk_level: string;
  max_positions: number; max_daily_loss: number | null; max_trades_per_day: number;
  squareoff_time: string; session_start: string; session_end: string;
  broker: string; min_confidence: number; watchlist: string;
}

// ── Exit management for one open position ────────────────────────────────────
async function managePosition(cfg: Cfg, pos: any, forceSquareOff: boolean) {
  const quote = await getQuote(pos.symbol, 'NSE').catch(() => null);
  if (!quote?.price) return;
  const price = quote.price;
  const broker = getBroker(cfg.broker);

  let exitReason: string | null = null;

  if (forceSquareOff) {
    exitReason = 'Auto square-off (session end)';
  } else if (price <= pos.stop_loss) {
    exitReason = `Stop-loss hit @ ₹${price.toFixed(2)}`;
  } else if (price >= pos.target) {
    exitReason = `Target reached @ ₹${price.toFixed(2)}`;
  } else if (pos.trailing_pct > 0) {
    // Trailing stop: walk the anchor up with price, exit if it pulls back.
    const newAnchor = Math.max(pos.trail_anchor, price);
    if (newAnchor > pos.trail_anchor) {
      db.prepare(`UPDATE ai_positions SET trail_anchor = ? WHERE id = ?`).run(newAnchor, pos.id);
      pos.trail_anchor = newAnchor;
      const trailStop = newAnchor * (1 - pos.trailing_pct / 100);
      // Ratchet the hard stop upward once we're in profit past the trail band.
      if (trailStop > pos.stop_loss) {
        db.prepare(`UPDATE ai_positions SET stop_loss = ? WHERE id = ?`).run(trailStop, pos.id);
        logConsole(cfg.user_id, 'agent', `${pos.symbol}: trailing stop raised to ₹${trailStop.toFixed(2)}`, { agent: 'Monitoring' });
      }
    }
    if (price <= pos.stop_loss) exitReason = `Trailing stop hit @ ₹${price.toFixed(2)}`;
  }

  if (!exitReason) return;

  const fill = broker.placeOrder({
    userId: cfg.user_id, symbol: pos.symbol, side: 'SELL',
    quantity: pos.quantity, price, productType: 'MIS',
  });
  if (!fill.ok) {
    logConsole(cfg.user_id, 'warn', `${pos.symbol}: exit failed — ${fill.error}`, { agent: 'Execution' });
    return;
  }

  db.prepare(
    `UPDATE ai_positions SET status='closed', exit_reason=?, realized_pnl=?, closed_at=datetime('now') WHERE id=?`,
  ).run(exitReason, fill.realizedPnl, pos.id);

  db.prepare(
    `INSERT INTO algo_trades (user_id, symbol, action, quantity, price, pnl, source, reason)
     VALUES (?, ?, 'SELL', ?, ?, ?, 'ai', ?)`,
  ).run(cfg.user_id, pos.symbol, fill.quantity, fill.fillPrice, fill.realizedPnl, exitReason);

  const sign = fill.realizedPnl >= 0 ? '+' : '';
  logConsole(cfg.user_id, 'trade', `EXIT ${pos.symbol} × ${fill.quantity} @ ₹${price.toFixed(2)} — ${exitReason} (P&L ${sign}₹${fill.realizedPnl.toFixed(0)})`, { agent: 'Execution', meta: { symbol: pos.symbol, pnl: fill.realizedPnl } });
  pushToUser(cfg.user_id, `AI exited ${pos.symbol}`, `${exitReason}. P&L ${sign}₹${fill.realizedPnl.toFixed(0)}`, { type: 'ai_trade' }).catch(() => {});
}

// ── One user's full tick ─────────────────────────────────────────────────────
async function tickUser(cfg: Cfg) {
  const nowMin = istMinutes();
  const open = db.prepare(`SELECT * FROM ai_positions WHERE user_id = ? AND status = 'open'`).all(cfg.user_id) as any[];

  // 1) Manage existing positions (force square-off past the configured time).
  const forceSquareOff = nowMin >= hhmmToMin(cfg.squareoff_time);
  for (const pos of open) {
    await managePosition(cfg, pos, forceSquareOff);
  }

  // 2) Guardrails before any new entry.
  if (forceSquareOff) return;                          // no fresh entries near close
  if (nowMin < hhmmToMin(cfg.session_start) || nowMin > hhmmToMin(cfg.session_end)) return;

  const realized = todaysRealized(cfg.user_id);
  if (cfg.max_daily_loss != null && realized <= -Math.abs(cfg.max_daily_loss)) {
    return; // daily loss limit reached — stand down for the day
  }
  if (entriesToday(cfg.user_id) >= cfg.max_trades_per_day) return;

  const profile = getRiskProfile(cfg.risk_level);
  const maxPos = Math.min(cfg.max_positions, profile.maxPositions);
  const openCount = db.prepare(`SELECT COUNT(*) AS n FROM ai_positions WHERE user_id = ? AND status='open'`).get(cfg.user_id) as any;
  const slots = maxPos - (openCount?.n ?? 0);
  if (slots <= 0) return;

  const watchlist: string[] = (() => { try { return JSON.parse(cfg.watchlist || '[]'); } catch { return []; } })();
  if (!watchlist.length) return;

  const openSymbols = new Set(open.map(p => p.symbol));
  const minConf = Math.max(cfg.min_confidence, profile.minConfidence);

  // 3) Scan watchlist → score → rank candidates.
  const candidates: { sig: ReturnType<typeof analyzeSymbol>; price: number }[] = [];
  for (const symbol of watchlist) {
    if (openSymbols.has(symbol)) continue;
    const quote = await getQuote(symbol, 'NSE').catch(() => null);
    if (!quote?.price) continue;
    const bars = await getIntradayBars(symbol).catch(() => []);
    const sig = analyzeSymbol(symbol, bars, quote.price, quote.change_percent ?? 0);
    if (sig.action === 'enter' && sig.confidence >= minConf) {
      candidates.push({ sig, price: quote.price });
    }
  }
  candidates.sort((a, b) => b.sig.confidence - a.sig.confidence);

  // 4) Enter the top candidates.
  const broker = getBroker(cfg.broker);
  const balance = broker.getBalance(cfg.user_id);
  const totalCapital = cfg.capital_amount && cfg.capital_amount > 0
    ? Math.min(cfg.capital_amount, balance)
    : balance * (cfg.allocation_pct / 100);
  const perTrade = (totalCapital / maxPos) * profile.sizingFactor;

  for (const { sig, price } of candidates.slice(0, slots)) {
    if (perTrade < price) continue; // can't afford even 1 share
    const qty = Math.max(1, Math.floor(perTrade / price));
    const fill = broker.placeOrder({
      userId: cfg.user_id, symbol: sig.symbol, side: 'BUY', quantity: qty, price, productType: 'MIS',
    });
    if (!fill.ok) {
      logConsole(cfg.user_id, 'warn', `${sig.symbol}: entry skipped — ${fill.error}`, { agent: 'Execution' });
      continue;
    }

    const stopLoss = price * (1 - profile.stopLossPct / 100);
    const target = price * (1 + profile.targetPct / 100);
    db.prepare(
      `INSERT INTO ai_positions (user_id, symbol, quantity, entry_price, stop_loss, target, trail_anchor, trailing_pct, confidence, entry_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(cfg.user_id, sig.symbol, fill.quantity, fill.fillPrice, stopLoss, target, price, profile.trailingPct, sig.confidence, sig.reasons.join('; '));

    db.prepare(
      `INSERT INTO algo_trades (user_id, symbol, action, quantity, price, source, reason)
       VALUES (?, ?, 'BUY', ?, ?, 'ai', ?)`,
    ).run(cfg.user_id, sig.symbol, fill.quantity, fill.fillPrice, sig.reasons.join('; '));

    logConsole(cfg.user_id, 'trade',
      `ENTRY ${sig.symbol} × ${fill.quantity} @ ₹${price.toFixed(2)} · SL ₹${stopLoss.toFixed(2)} · TGT ₹${target.toFixed(2)} · conf ${sig.confidence}%`,
      { agent: 'Execution', meta: { symbol: sig.symbol, confidence: sig.confidence } });
    pushToUser(cfg.user_id, `AI bought ${sig.symbol}`, `${fill.quantity} @ ₹${price.toFixed(2)} · confidence ${sig.confidence}%`, { type: 'ai_trade' }).catch(() => {});

    // Claude narration — fire-and-forget, appended when it returns.
    explainEntry(sig, profile.label)
      .then(text => logConsole(cfg.user_id, 'agent', `${sig.symbol}: ${text}`, { agent: 'Strategy' }))
      .catch(() => {});
  }
}

// ── Main tick across all enabled users ───────────────────────────────────────
async function tick() {
  if (running) return;
  running = true;
  try {
    if (!isMarketOpen()) return;
    const cfgs = db.prepare(
      `SELECT * FROM ai_trader_config WHERE is_enabled = 1 AND kill_switch = 0`,
    ).all() as unknown as Cfg[];
    for (const cfg of cfgs) {
      try { await tickUser(cfg); }
      catch (err) { console.error(`[aiTrader] user ${cfg.user_id} tick error:`, err); }
    }
  } catch (err) {
    console.error('[aiTrader] tick error:', err);
  } finally {
    running = false;
  }
}

/**
 * Emergency kill switch: flip the flag, then force-close every open AI position
 * for the user immediately at market price.
 */
export async function killSwitch(userId: number) {
  db.prepare(`UPDATE ai_trader_config SET kill_switch = 1, is_enabled = 0 WHERE user_id = ?`).run(userId);
  const cfg = db.prepare(`SELECT * FROM ai_trader_config WHERE user_id = ?`).get(userId) as unknown as Cfg | undefined;
  if (!cfg) return;
  const open = db.prepare(`SELECT * FROM ai_positions WHERE user_id = ? AND status='open'`).all(userId) as any[];
  logConsole(userId, 'error', `KILL SWITCH engaged — closing ${open.length} open position(s)`, { agent: 'Risk' });
  for (const pos of open) {
    await managePosition({ ...cfg, squareoff_time: '00:00' }, pos, true);
  }
}

export function startAiTradeEngine() {
  if (timer) return;
  console.log(`[aiTrader] engine started — tick every ${TICK_MS / 1000}s while market open`);
  timer = setInterval(() => { void tick(); }, TICK_MS);
}

export function stopAiTradeEngine() {
  if (timer) { clearInterval(timer); timer = null; }
}
