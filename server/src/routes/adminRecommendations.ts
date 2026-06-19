// Recommendation Engine — Admin API + user-facing campaign detail.
//
// Admin endpoints (require role=admin):
//   POST /api/admin/recommendations/generate   — AI-analyse a symbol via Claude
//   POST /api/admin/recommendations            — save a campaign (draft or send immediately)
//   GET  /api/admin/recommendations            — list campaigns with engagement stats
//   GET  /api/admin/recommendations/segments   — user-segment preview counts
//   GET  /api/admin/recommendations/:id        — campaign detail + per-send analytics
//   POST /api/admin/recommendations/:id/send   — dispatch push to target segment
//   DELETE /api/admin/recommendations/:id      — cancel / delete a draft campaign
//
// User endpoints (require auth only):
//   GET  /api/admin/recommendations/campaign/:id  — public campaign card (for notification tap)
//   POST /api/admin/recommendations/campaign/:id/click — record click-through

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { pushToUser } from '../services/push.js';
import { getCachedQuote, getHistory } from '../services/marketData.js';
import { calcRSI, calcMACD, calcEMA, calcATR, calcBollinger, type Bar } from '../services/indicators.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
router.use(authMiddleware as any);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// ── Guard ──────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: any) {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── User Segmentation Engine ───────────────────────────────────────────────

type SegmentKey = 'all' | 'active_7d' | 'active_30d' | 'watchlist' | 'holders';

function getUsersForSegment(symbol: string, segment: SegmentKey): number[] {
  // All segments include every registered user that matches the filter.
  // pushToUser() silently no-ops for users without a device token, so web-only
  // users still receive the in-app notification while app users get both.
  try {
    switch (segment) {
      case 'active_7d':
        return (db.prepare(`
          SELECT DISTINCT u.id FROM users u
          INNER JOIN transactions t ON t.user_id = u.id
          WHERE t.created_at > datetime('now', '-7 days')
        `).all() as any[]).map((r) => r.id);

      case 'active_30d':
        return (db.prepare(`
          SELECT DISTINCT u.id FROM users u
          INNER JOIN transactions t ON t.user_id = u.id
          WHERE t.created_at > datetime('now', '-30 days')
        `).all() as any[]).map((r) => r.id);

      case 'watchlist':
        return (db.prepare(`
          SELECT DISTINCT u.id FROM users u
          WHERE u.id IN (
            SELECT DISTINCT w.user_id
            FROM watchlist_items wi
            INNER JOIN watchlists w ON w.id = wi.watchlist_id
            WHERE wi.symbol = ?
          )
        `).all(symbol) as any[]).map((r) => r.id);

      case 'holders':
        return (db.prepare(`
          SELECT DISTINCT u.id FROM users u
          INNER JOIN holdings h ON h.user_id = u.id
          WHERE h.symbol = ? AND h.quantity > 0
        `).all(symbol) as any[]).map((r) => r.id);

      default: // 'all' — every registered user
        return (db.prepare(`SELECT id FROM users`).all() as any[]).map((r) => r.id);
    }
  } catch (err: any) {
    console.error('[rec-engine] segmentation error:', err?.message);
    return [];
  }
}

function getSegmentCounts(symbol: string): Record<SegmentKey, number> {
  const segments: SegmentKey[] = ['all', 'active_7d', 'active_30d', 'watchlist', 'holders'];
  const counts: Record<string, number> = {};
  for (const seg of segments) {
    counts[seg] = getUsersForSegment(symbol, seg).length;
  }
  return counts as Record<SegmentKey, number>;
}

// ── Technical context builder (same approach as dailyRecommendations.ts) ──

async function buildTechnicalContext(symbol: string): Promise<string> {
  let ctx = `Symbol: ${symbol}\n`;
  try {
    const quote = getCachedQuote(symbol);
    if (quote?.price) {
      ctx += `Current Price: ₹${quote.price.toFixed(2)}\n`;
      ctx += `Day Change: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.change_percent.toFixed(2)}%)\n`;
      ctx += `Volume: ${quote.volume?.toLocaleString() ?? 'N/A'}\n`;
    }
  } catch {}

  try {
    const history = await getHistory(symbol, 'NSE', new Date(Date.now() - 90 * 24 * 3600_000), '1d');
    if (history.length >= 14) {
      const bars: Bar[] = history.map((h: any) => ({
        open: h.open, high: h.high, low: h.low, close: h.close, volume: h.volume,
      }));
      const closes = bars.map((b) => b.close);

      const rsi    = calcRSI(closes, 14);
      const macdArr = calcMACD(closes);   // array of { macd, signal, histogram }
      const ema9   = calcEMA(closes, 9);
      const ema21  = calcEMA(closes, 21);
      const atr    = calcATR(bars, 14);
      const bbArr  = calcBollinger(closes, 20, 2);  // array of { mid, upper, lower }

      const lastRsi    = rsi[rsi.length - 1];
      const lastMacdObj = macdArr[macdArr.length - 1];
      const lastEma9   = ema9[ema9.length - 1];
      const lastEma21  = ema21[ema21.length - 1];
      const lastAtr    = atr[atr.length - 1];
      const lastClose  = closes[closes.length - 1];
      const lastBb     = bbArr[bbArr.length - 1];   // { mid, upper, lower }

      ctx += `\nTECHNICAL INDICATORS (14-day / 20-day):\n`;
      ctx += `- RSI(14): ${lastRsi?.toFixed(1) ?? 'N/A'}\n`;
      ctx += `- MACD: ${lastMacdObj?.macd?.toFixed(2) ?? 'N/A'} | Signal: ${lastMacdObj?.signal?.toFixed(2) ?? 'N/A'} | Histogram: ${(((lastMacdObj?.macd ?? 0) - (lastMacdObj?.signal ?? 0)) as number).toFixed(2)}\n`;
      ctx += `- EMA9: ₹${lastEma9?.toFixed(2) ?? 'N/A'} | EMA21: ₹${lastEma21?.toFixed(2) ?? 'N/A'} | Trend: ${lastEma9 && lastEma21 ? (lastEma9 > lastEma21 ? 'Bullish crossover' : 'Bearish crossover') : 'N/A'}\n`;
      ctx += `- ATR(14): ₹${lastAtr?.toFixed(2) ?? 'N/A'} (volatility measure)\n`;
      ctx += `- Bollinger Bands: Upper ₹${lastBb?.upper?.toFixed(2) ?? 'N/A'} | Mid ₹${lastBb?.mid?.toFixed(2) ?? 'N/A'} | Lower ₹${lastBb?.lower?.toFixed(2) ?? 'N/A'}\n`;
      ctx += `- Price vs BB: ${lastClose && lastBb?.upper && lastBb?.lower ? (lastClose > lastBb.upper ? 'Above upper (overbought zone)' : lastClose < lastBb.lower ? 'Below lower (oversold zone)' : 'Within bands') : 'N/A'}\n`;

      const high52 = Math.max(...history.map((h: any) => h.high));
      const low52  = Math.min(...history.map((h: any) => h.low));
      ctx += `- 52W High: ₹${high52.toFixed(2)} | 52W Low: ₹${low52.toFixed(2)}\n`;
    }
  } catch {}

  return ctx;
}

// ── AI Recommendation Generator ────────────────────────────────────────────

async function generateAiRecommendation(symbol: string): Promise<{
  title: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  target_price: number;
  stop_loss: number;
  expected_return: number;
  confidence_score: number;
  rationale: string;
  time_horizon: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  current_price?: number;
}> {
  const techCtx = await buildTechnicalContext(symbol);

  const prompt = `You are an expert equity analyst for Indian markets (NSE/BSE).
Analyse the following technical data and generate ONE actionable recommendation.

${techCtx}

Return ONLY a valid JSON object (no markdown, no preamble) with exactly these fields:
{
  "title": "<Company> – <signal phrase>",
  "action": "BUY" | "SELL" | "HOLD",
  "target_price": <number in ₹>,
  "stop_loss": <number in ₹>,
  "expected_return": <percentage as number, e.g. 8.5 for 8.5%>,
  "confidence_score": <number 0-100>,
  "rationale": "<2-3 clear sentences explaining the recommendation — suitable for a push notification>",
  "time_horizon": "1D" | "1W" | "1M" | "3M",
  "risk_level": "LOW" | "MEDIUM" | "HIGH"
}

Rules:
- target_price and stop_loss must be specific price levels in ₹, not percentages
- risk_reward ratio (target-current)/(current-stop_loss) must be ≥ 1.5
- confidence_score reflects signal quality (multiple confluent indicators = higher score)
- rationale must be suitable for a mobile push notification body`;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (res.content[0] as any)?.text ?? '';
  // Strip markdown fences if present
  const json = raw.replace(/```json\n?|```\n?/g, '').trim();
  return JSON.parse(json);
}

// ──────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ──────────────────────────────────────────────────────────────────────────

// GET /segments?symbol=TCS — preview how many users each segment targets
router.get('/segments', requireAdmin, (req: Request, res: Response) => {
  const { symbol = 'TCS' } = req.query as { symbol?: string };
  try {
    const counts = getSegmentCounts(symbol.toUpperCase());
    res.json({ symbol: symbol.toUpperCase(), segments: counts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /generate — AI-analyse symbol; returns preview (not yet saved)
router.post('/generate', requireAdmin, async (req: Request, res: Response) => {
  const { symbol } = req.body as { symbol?: string };
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  try {
    const rec = await generateAiRecommendation(symbol.toUpperCase());
    res.json({ ...rec, symbol: symbol.toUpperCase(), ai_generated: true });
  } catch (err: any) {
    console.error('[rec-engine] AI generation failed:', err?.message);
    res.status(500).json({ error: `AI generation failed: ${err?.message}` });
  }
});

// GET / — list all campaigns with engagement stats
router.get('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const campaigns = db.prepare(`
      SELECT
        rc.*,
        u.name AS created_by_name,
        COUNT(rs.id)                                              AS total_sends,
        SUM(CASE WHEN rs.clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS total_clicks,
        SUM(CASE WHEN rs.order_placed_at IS NOT NULL THEN 1 ELSE 0 END) AS total_conversions
      FROM recommendation_campaigns rc
      LEFT JOIN users u ON u.id = rc.created_by
      LEFT JOIN recommendation_sends rs ON rs.campaign_id = rc.id
      GROUP BY rc.id
      ORDER BY rc.created_at DESC
      LIMIT 100
    `).all() as any[];
    res.json({ campaigns });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST / — create campaign (optionally send immediately)
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const {
    title, symbol, action, current_price, target_price, stop_loss,
    expected_return, confidence_score, rationale, time_horizon,
    risk_level, ai_generated, segment, send_now,
  } = req.body as Record<string, any>;

  if (!title || !symbol || !action) {
    return res.status(400).json({ error: 'title, symbol and action are required' });
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
    return res.status(400).json({ error: 'action must be BUY, SELL or HOLD' });
  }

  try {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO recommendation_campaigns
        (title, symbol, action, current_price, target_price, stop_loss, expected_return,
         confidence_score, rationale, time_horizon, risk_level, ai_generated, segment,
         status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      title, symbol.toUpperCase(), action,
      current_price ?? null, target_price ?? null, stop_loss ?? null,
      expected_return ?? null, confidence_score ?? 0,
      rationale ?? null, time_horizon ?? '1M',
      risk_level ?? 'MEDIUM', ai_generated ? 1 : 0,
      segment ?? 'all', adminId,
    );

    const campaignId = Number(lastInsertRowid);

    if (send_now) {
      await dispatchCampaign(campaignId);
    }

    const campaign = db.prepare('SELECT * FROM recommendation_campaigns WHERE id = ?').get(campaignId);
    res.status(201).json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /:id — campaign detail + per-send analytics
router.get('/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const campaign = db.prepare('SELECT * FROM recommendation_campaigns WHERE id = ?').get(id) as any;
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const sends = db.prepare(`
      SELECT rs.*, u.name AS user_name, u.email AS user_email
      FROM recommendation_sends rs
      INNER JOIN users u ON u.id = rs.user_id
      WHERE rs.campaign_id = ?
      ORDER BY rs.sent_at DESC
      LIMIT 200
    `).all(id) as any[];

    const stats = db.prepare(`
      SELECT
        COUNT(*)                                                     AS sent,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END)     AS clicks,
        SUM(CASE WHEN order_placed_at IS NOT NULL THEN 1 ELSE 0 END) AS conversions
      FROM recommendation_sends WHERE campaign_id = ?
    `).get(id) as any;

    res.json({ campaign, sends, stats });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /:id/send — dispatch to segment (idempotent: skips already-sent users)
router.post('/:id/send', requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const sent = await dispatchCampaign(id);
    res.json({ sent });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// DELETE /:id — cancel/delete
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    db.prepare(`UPDATE recommendation_campaigns SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// USER-FACING ROUTES  (auth only, no admin required)
// ──────────────────────────────────────────────────────────────────────────

// GET /campaign/:id — public detail card (shown when user taps a notification)
router.get('/campaign/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const campaign = db.prepare(`
      SELECT id, title, symbol, action, current_price, target_price, stop_loss,
             expected_return, confidence_score, rationale, time_horizon, risk_level,
             ai_generated, sent_at, status
      FROM recommendation_campaigns
      WHERE id = ? AND status = 'sent'
    `).get(id);
    if (!campaign) return res.status(404).json({ error: 'Recommendation not found' });
    res.json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /campaign/:id/click — record click-through from notification
router.post('/campaign/:id/click', (req: Request, res: Response) => {
  const campaignId = Number(req.params.id);
  const userId = (req as any).user.id;
  try {
    db.prepare(`
      UPDATE recommendation_sends
      SET clicked_at = datetime('now')
      WHERE campaign_id = ? AND user_id = ? AND clicked_at IS NULL
    `).run(campaignId, userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /campaign/:id/convert — record order placement from recommendation
router.post('/campaign/:id/convert', (req: Request, res: Response) => {
  const campaignId = Number(req.params.id);
  const userId = (req as any).user.id;
  const { order_id } = req.body as { order_id?: number };
  try {
    db.prepare(`
      UPDATE recommendation_sends
      SET order_placed_at = datetime('now'), order_id = ?
      WHERE campaign_id = ? AND user_id = ?
    `).run(order_id ?? null, campaignId, userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Push dispatch (internal)
// ──────────────────────────────────────────────────────────────────────────

async function dispatchCampaign(campaignId: number): Promise<number> {
  const campaign = db.prepare('SELECT * FROM recommendation_campaigns WHERE id = ?').get(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'cancelled') throw new Error('Campaign is cancelled');

  const userIds = getUsersForSegment(campaign.symbol, campaign.segment as SegmentKey);

  // Determine notification content
  const actionLabel = campaign.action === 'BUY' ? '🟢 BUY ALERT' : campaign.action === 'SELL' ? '🔴 SELL ALERT' : '🔵 HOLD ALERT';
  const returnStr = campaign.expected_return != null ? ` | Expected return: ${campaign.expected_return.toFixed(1)}%` : '';
  const title = `${actionLabel}: ${campaign.symbol}`;
  const body = campaign.rationale
    ? `${campaign.rationale}${returnStr}`
    : `${campaign.symbol} has a ${campaign.action} signal. Confidence: ${campaign.confidence_score.toFixed(0)}%${returnStr}`;

  const pushData: Record<string, string> = {
    type: 'recommendation',
    campaignId: String(campaignId),
    symbol: campaign.symbol,
    action: campaign.action,
  };

  let sent = 0;
  for (const userId of userIds) {
    try {
      // Insert send record (skip if already sent to this user)
      db.prepare(`
        INSERT OR IGNORE INTO recommendation_sends (campaign_id, user_id)
        VALUES (?, ?)
      `).run(campaignId, userId);

      // Push notification
      await pushToUser(userId, title, body, pushData);

      // In-app notification inbox entry
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, 'system')
      `).run(userId, title, body);

      sent++;
    } catch (err: any) {
      console.warn(`[rec-engine] send to user ${userId} failed:`, err?.message);
    }
  }

  // Mark campaign as sent
  db.prepare(`
    UPDATE recommendation_campaigns
    SET status = 'sent', sent_at = datetime('now'), sent_count = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sent, campaignId);

  console.log(`[rec-engine] campaign ${campaignId} sent to ${sent}/${userIds.length} users`);
  return sent;
}

export default router;
