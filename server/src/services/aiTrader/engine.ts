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
// Every decision is logged to BOTH the terminal AND the in-app console.

import { db } from '../../db/index.js';
import { getQuote, getHistory, isMarketOpen, getISTDate, getAllCachedQuotes } from '../marketData.js';
import { pushToUser } from '../push.js';
import { getRiskProfile, type RiskProfile, computeStops, sizePosition } from './riskProfiles.js';
import { analyzeSymbol } from './signals.js';
import { getBroker } from './broker/index.js';
import { logConsole } from './console.js';
import { deliberate, type CouncilCandidate } from './council.js';

// ── Terminal-only banner logging (no DB, just stdout) ────────────────────────
const DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
const CYAN = '\x1b[36m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', RED = '\x1b[31m';

function banner(msg: string) {
  console.log(`${CYAN}${BOLD}━━━ [AI-AGENT] ${msg} ━━━${RESET}`);
}

// Per-user cooldown so the (expensive) council only convenes periodically.
const lastDeliberation = new Map<number, number>();
const DELIBERATION_COOLDOWN_MS = 60_000;

const TICK_MS = 15_000;
let timer: NodeJS.Timeout | null = null;
let running = false;
let tickCount = 0;

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

// Autonomously screen the entire polled NSE universe down to a shortlist of
// the strongest intraday long candidates. No user watchlist — the agent finds
// its own opportunities. Deterministic + cheap; the council reasons over the result.
async function discoverCandidates(openSymbols: Set<string>, profile: RiskProfile, userId: number): Promise<CouncilCandidate[]> {
  const all = Array.from(getAllCachedQuotes().values());

  const nseStocks = all.filter(q => q.exchange === 'NSE' && q.price > 0);
  logConsole(userId, 'info', `Universe: ${nseStocks.length} NSE stocks with live prices`, { agent: 'Scanner' });

  // Prelim screen: liquid NSE names with constructive (not blown-out) intraday moves.
  const prelim = nseStocks
    .filter(q => process.env.BYPASS_MARKET_HOURS === 'true' || q.volume > 50_000)
    .filter(q => !openSymbols.has(q.symbol))
    .filter(q => q.change_percent > -0.5 && q.change_percent < 7)
    .map(q => ({ q, screen: q.change_percent + Math.min(2, q.volume / 5_000_000) }))
    .sort((a, b) => b.screen - a.screen)
    .slice(0, 18)
    .map(x => x.q);

  logConsole(userId, 'info', `Pre-screen: ${prelim.length} stocks passed liquidity + momentum filters`, { agent: 'Scanner' });

  // Run the deterministic signal engine on the shortlist (uses intraday candles).
  const scored: CouncilCandidate[] = [];
  for (const q of prelim) {
    const bars = await getIntradayBars(q.symbol).catch(() => []);
    const sig = analyzeSymbol(q.symbol, bars, q.price, q.change_percent ?? 0);

    if (sig.bias !== 'bearish' && sig.confidence >= profile.minConfidence - 8) {
      scored.push({ sig, price: q.price, changePct: q.change_percent ?? 0 });
      logConsole(userId, 'signal',
        `${sig.symbol}: conf ${sig.confidence}% (${sig.bias}) · RSI ${sig.snapshot.rsi?.toFixed(0) ?? '—'} · MACD ${sig.snapshot.macdHist?.toFixed(2) ?? '—'} · ST ${sig.snapshot.supertrend === 1 ? 'UP' : sig.snapshot.supertrend === -1 ? 'DN' : '—'}`,
        { agent: 'Signal Engine' });
    }
  }

  logConsole(userId, 'info', `Signal screen: ${scored.length} candidate(s) above confidence floor`, { agent: 'Scanner' });
  return scored.sort((a, b) => b.sig.confidence - a.sig.confidence).slice(0, 8);
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
        logConsole(cfg.user_id, 'agent', `${pos.symbol}: trailing stop raised to ₹${trailStop.toFixed(2)}`, { agent: 'Risk Monitor' });
      }
    }
    if (price <= pos.stop_loss) exitReason = `Trailing stop hit @ ₹${price.toFixed(2)}`;
  }

  if (!exitReason) {
    // Log position monitoring status periodically (every ~4th tick = ~60s)
    if (tickCount % 4 === 0) {
      const unreal = ((price - pos.entry_price) * pos.quantity);
      const pctMove = ((price - pos.entry_price) / pos.entry_price * 100);
      logConsole(cfg.user_id, 'info',
        `📈 ${pos.symbol}: ₹${price.toFixed(2)} (${pctMove >= 0 ? '+' : ''}${pctMove.toFixed(2)}%) · Unrealized P&L: ${unreal >= 0 ? '+' : ''}₹${unreal.toFixed(0)} · SL ₹${pos.stop_loss.toFixed(2)} · TGT ₹${pos.target.toFixed(2)}`,
        { agent: 'Risk Monitor' });
    }
    return;
  }

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
  logConsole(cfg.user_id, 'trade', `🚪 EXIT ${pos.symbol} × ${fill.quantity} @ ₹${price.toFixed(2)} — ${exitReason} (P&L ${sign}₹${fill.realizedPnl.toFixed(0)})`, { agent: 'Execution', meta: { symbol: pos.symbol, pnl: fill.realizedPnl } });
  pushToUser(cfg.user_id, `AI exited ${pos.symbol}`, `${exitReason}. P&L ${sign}₹${fill.realizedPnl.toFixed(0)}`, { type: 'ai_trade' }).catch(() => {});
}

// ── One user's full tick ─────────────────────────────────────────────────────
async function tickUser(cfg: Cfg) {
  const nowMin = istMinutes();
  const open = db.prepare(`SELECT * FROM ai_positions WHERE user_id = ? AND status = 'open'`).all(cfg.user_id) as any[];
  const broker = getBroker(cfg.broker);
  const balance = broker.getBalance(cfg.user_id);
  const profile = getRiskProfile(cfg.risk_level);

  // Log user status
  logConsole(cfg.user_id, 'info',
    `👤 User #${cfg.user_id} — Balance ₹${balance.toFixed(0)} · Risk: ${cfg.risk_level} · Capital: ₹${(cfg.capital_amount ?? balance * cfg.allocation_pct / 100).toFixed(0)} · Open: ${open.length} position(s)`,
    { agent: 'Engine' });

  // 1) Manage existing positions (force square-off past the configured time).
  const forceSquareOff = nowMin >= hhmmToMin(cfg.squareoff_time) && process.env.BYPASS_MARKET_HOURS !== 'true';
  for (const pos of open) {
    await managePosition(cfg, pos, forceSquareOff);
  }

  // 2) Guardrails before any new entry.
  if (forceSquareOff) {
    logConsole(cfg.user_id, 'warn', 'Past square-off time — no new entries', { agent: 'Guardrail' });
    return;
  }
  if ((nowMin < hhmmToMin(cfg.session_start) || nowMin > hhmmToMin(cfg.session_end)) && process.env.BYPASS_MARKET_HOURS !== 'true') {
    logConsole(cfg.user_id, 'info', 'Outside session window — waiting', { agent: 'Guardrail' });
    return;
  }

  const realized = todaysRealized(cfg.user_id);
  if (cfg.max_daily_loss != null && realized <= -Math.abs(cfg.max_daily_loss)) {
    logConsole(cfg.user_id, 'warn', `Daily loss limit reached (₹${realized.toFixed(0)}) — standing down`, { agent: 'Guardrail' });
    return; // daily loss limit reached — stand down for the day
  }

  const todayEntries = entriesToday(cfg.user_id);
  if (todayEntries >= cfg.max_trades_per_day) {
    logConsole(cfg.user_id, 'info', `Max trades/day reached (${todayEntries}/${cfg.max_trades_per_day})`, { agent: 'Guardrail' });
    return;
  }

  const openCount = db.prepare(`SELECT COUNT(*) AS n FROM ai_positions WHERE user_id = ? AND status='open'`).get(cfg.user_id) as any;
  const slots = profile.maxPositions - (openCount?.n ?? 0);
  if (slots <= 0) {
    logConsole(cfg.user_id, 'info', `Max positions reached (${openCount?.n ?? 0}/${profile.maxPositions}) — no new entries`, { agent: 'Guardrail' });
    return;
  }

  // Convene the council at most once per cooldown window (it uses the big model).
  const lastDelib = lastDeliberation.get(cfg.user_id) ?? 0;
  if (Date.now() - lastDelib < DELIBERATION_COOLDOWN_MS) {
    const remainSec = Math.ceil((DELIBERATION_COOLDOWN_MS - (Date.now() - lastDelib)) / 1000);
    logConsole(cfg.user_id, 'info', `Council cooldown: ${remainSec}s remaining`, { agent: 'Engine' });
    return;
  }
  lastDeliberation.set(cfg.user_id, Date.now());

  const openSymbols = new Set(open.map(p => p.symbol));

  // 3) Autonomously discover candidates across the whole market — no watchlist.
  logConsole(cfg.user_id, 'info', '🔍 Scanning market for intraday opportunities…', { agent: 'Market Analysis' });
  const candidates = await discoverCandidates(openSymbols, profile, cfg.user_id);
  if (!candidates.length) {
    logConsole(cfg.user_id, 'info', '❌ No qualifying setups found this scan.', { agent: 'Market Analysis' });
    return;
  }
  logConsole(cfg.user_id, 'signal',
    `🎯 ${candidates.length} candidate(s) surfaced: ${candidates.map(c => `${c.sig.symbol}(${c.sig.confidence}%)`).join(', ')}`,
    { agent: 'Market Analysis' });

  // 4) Sizing context.
  const totalCapital = cfg.capital_amount && cfg.capital_amount > 0
    ? Math.min(cfg.capital_amount, balance)
    : balance * (cfg.allocation_pct / 100);

  logConsole(cfg.user_id, 'info', `💰 Available capital for AI: ₹${totalCapital.toFixed(0)} · Open slots: ${slots}`, { agent: 'Capital' });

  // 5) The Claude multi-agent council deliberates and decides.
  logConsole(cfg.user_id, 'agent', '🤖 Council convening to deliberate…', { agent: 'Council' });
  const verdict = await deliberate(candidates, {
    profile, availableCapital: totalCapital, openSymbols: [...openSymbols], slots,
  });
  if (verdict.marketView) logConsole(cfg.user_id, 'agent', `📋 Market View: ${verdict.marketView}`, { agent: 'Council' });
  for (const d of verdict.discussion) logConsole(cfg.user_id, 'agent', `${d.agent}: ${d.view}`, { agent: d.agent });

  const approved = verdict.decisions.filter(d => d.action === 'enter').slice(0, slots);
  if (!approved.length) {
    logConsole(cfg.user_id, 'info', `⏸️ Council verdict: stand down (${verdict.source}). No entries approved.`, { agent: 'Strategy' });
    // Also log which were rejected and why
    for (const d of verdict.decisions) {
      if (d.action === 'skip') {
        logConsole(cfg.user_id, 'info', `  ↳ ${d.symbol}: SKIP — ${d.reason} (conf ${d.confidence}%)`, { agent: 'Strategy' });
      }
    }
    return;
  }

  logConsole(cfg.user_id, 'trade',
    `✅ Council approved ${approved.length} trade(s): ${approved.map(a => `${a.symbol}(${a.confidence}%)`).join(', ')} [source: ${verdict.source}]`,
    { agent: 'Council' });

  // Calculate dynamic capital and risk bounds
  const openPositions = db.prepare(`SELECT * FROM ai_positions WHERE user_id = ? AND status = 'open'`).all(cfg.user_id) as any[];
  const initialOpenRisk = openPositions.reduce((sum, pos) => {
    const riskPerShare = Math.max(0, pos.entry_price - pos.stop_loss);
    return sum + (pos.quantity * riskPerShare);
  }, 0);

  let runningCash = balance;
  let runningOpenRisk = initialOpenRisk;

  // 6) Execute the council-approved entries.
  for (const decision of approved) {
    const cand = candidates.find(c => c.sig.symbol === decision.symbol);
    if (!cand) continue;
    const price = cand.price;
    const atrValue = cand.sig.snapshot.atr;

    // Volatility-adaptive stops
    const stops = computeStops(profile, price, atrValue);

    // Dynamic position sizing from risk per trade and caps
    const sizing = sizePosition({
      profile,
      allocatedCapital: totalCapital,
      entry: price,
      stopDistance: stops.stopDistance,
      availableCash: runningCash,
      openRiskRupees: runningOpenRisk,
    });

    if (sizing.qty <= 0) {
      logConsole(cfg.user_id, 'warn', `${decision.symbol}: sizing constrained — ${sizing.note}`, { agent: 'Risk' });
      continue;
    }

    logConsole(cfg.user_id, 'info',
      `📐 ${decision.symbol}: Sizing ${sizing.qty} shares @ ₹${price.toFixed(2)} = ₹${(sizing.qty * price).toFixed(0)} · Risk ₹${sizing.riskRupees.toFixed(0)} (${sizing.note})`,
      { agent: 'Risk' });

    const fill = broker.placeOrder({
      userId: cfg.user_id, symbol: decision.symbol, side: 'BUY', quantity: sizing.qty, price, productType: 'MIS',
    });
    if (!fill.ok) {
      logConsole(cfg.user_id, 'warn', `${decision.symbol}: entry skipped — ${fill.error}`, { agent: 'Execution' });
      continue;
    }

    // Keep running cash and risk dynamically updated as we enter sequential trades
    runningCash -= fill.quantity * fill.fillPrice;
    runningOpenRisk += fill.quantity * stops.stopDistance;

    const reason = decision.reason || cand.sig.reasons.join('; ');
    db.prepare(
      `INSERT INTO ai_positions (user_id, symbol, quantity, entry_price, stop_loss, target, trail_anchor, trailing_pct, confidence, entry_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(cfg.user_id, decision.symbol, fill.quantity, fill.fillPrice, stops.stopLoss, stops.target, price, stops.trailingPct, decision.confidence, reason);

    db.prepare(
      `INSERT INTO algo_trades (user_id, symbol, action, quantity, price, source, reason)
       VALUES (?, ?, 'BUY', ?, ?, 'ai', ?)`,
    ).run(cfg.user_id, decision.symbol, fill.quantity, fill.fillPrice, reason);

    logConsole(cfg.user_id, 'trade',
      `🟢 ENTRY ${decision.symbol} × ${fill.quantity} @ ₹${price.toFixed(2)} · SL ₹${stops.stopLoss.toFixed(2)} · TGT ₹${stops.target.toFixed(2)} · conf ${decision.confidence}%`,
      { agent: 'Execution', meta: { symbol: decision.symbol, confidence: decision.confidence } });
    logConsole(cfg.user_id, 'agent', `${decision.symbol}: ${reason}`, { agent: 'Strategy' });
    pushToUser(cfg.user_id, `AI bought ${decision.symbol}`, `${fill.quantity} @ ₹${price.toFixed(2)} · confidence ${decision.confidence}%`, { type: 'ai_trade' }).catch(() => {});
  }
}

// ── Main tick across all enabled users ───────────────────────────────────────
async function tick() {
  if (running) return;
  running = true;
  tickCount++;
  try {
    const marketOpen = isMarketOpen();
    if (!marketOpen) {
      if (tickCount % 20 === 1) { // Log once every 5 minutes when market is closed
        console.log(`${DIM}[AI-AGENT] Market closed — engine idle (tick #${tickCount})${RESET}`);
      }
      return;
    }

    const cfgs = db.prepare(
      `SELECT * FROM ai_trader_config WHERE is_enabled = 1 AND kill_switch = 0`,
    ).all() as unknown as Cfg[];

    if (cfgs.length === 0) {
      if (tickCount % 8 === 1) { // Log every 2 minutes when no users
        banner(`Tick #${tickCount} — no users with AI enabled`);
      }
      return;
    }

    banner(`Tick #${tickCount} — processing ${cfgs.length} active user(s)`);

    for (const cfg of cfgs) {
      try { await tickUser(cfg); }
      catch (err) {
        console.error(`${RED}[AI-AGENT] User ${cfg.user_id} tick error:${RESET}`, err);
        logConsole(cfg.user_id, 'error', `Engine error: ${err instanceof Error ? err.message : String(err)}`, { agent: 'Engine' });
      }
    }
  } catch (err) {
    console.error(`${RED}[AI-AGENT] Tick error:${RESET}`, err);
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
  logConsole(userId, 'error', `🛑 KILL SWITCH engaged — closing ${open.length} open position(s)`, { agent: 'Risk' });
  for (const pos of open) {
    await managePosition({ ...cfg, squareoff_time: '00:00' }, pos, true);
  }
}

export function startAiTradeEngine() {
  if (timer) return;
  banner(`Engine started — tick every ${TICK_MS / 1000}s`);
  console.log(`${DIM}  BYPASS_MARKET_HOURS=${process.env.BYPASS_MARKET_HOURS ?? 'false'}${RESET}`);
  console.log(`${DIM}  ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? 'set (council enabled)' : 'NOT SET (using fallback)'}${RESET}`);
  timer = setInterval(() => { void tick(); }, TICK_MS);
  // Run the first tick immediately after a short delay so data is cached
  setTimeout(() => { void tick(); }, 3000);
}

export function stopAiTradeEngine() {
  if (timer) { clearInterval(timer); timer = null; }
}
