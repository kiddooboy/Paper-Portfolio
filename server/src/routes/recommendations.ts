import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateDailyRecommendations } from '../services/dailyRecommendations.js';

const router = Router();

// ── GET /api/recommendations/today — today's picks (or latest available) ──
router.get('/today', authMiddleware, (req: AuthRequest, res) => {
  // Try today first, then fall back to the most recent
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  let row = db.prepare(
    'SELECT * FROM daily_recommendations WHERE date = ?'
  ).get(today) as any;

  if (!row) {
    // Fall back to the most recent recommendation
    row = db.prepare(
      'SELECT * FROM daily_recommendations ORDER BY date DESC LIMIT 1'
    ).get() as any;
  }

  if (!row) return res.json(null);

  res.json({
    id: row.id,
    date: row.date,
    market_sentiment: row.market_sentiment,
    summary: row.summary,
    recommendations: JSON.parse(row.recommendations || '[]'),
    global_cues: JSON.parse(row.global_cues || '[]'),
    generated_at: row.generated_at,
    model_used: row.model_used,
  });
});

// ── GET /api/recommendations/history — past N days ────────────────────────
router.get('/history', authMiddleware, (req: AuthRequest, res) => {
  const days = Math.min(60, Math.max(1, parseInt(req.query.days as string) || 7));

  const rows = db.prepare(`
    SELECT * FROM daily_recommendations
    ORDER BY date DESC
    LIMIT ?
  `).all(days) as any[];

  res.json(rows.map(row => ({
    id: row.id,
    date: row.date,
    market_sentiment: row.market_sentiment,
    summary: row.summary,
    recommendations: JSON.parse(row.recommendations || '[]'),
    global_cues: JSON.parse(row.global_cues || '[]'),
    generated_at: row.generated_at,
    model_used: row.model_used,
  })));
});

// ── GET /api/recommendations/:date — specific date ────────────────────────
router.get('/:date', authMiddleware, (req: AuthRequest, res) => {
  const row = db.prepare(
    'SELECT * FROM daily_recommendations WHERE date = ?'
  ).get(req.params.date) as any;

  if (!row) return res.status(404).json({ error: 'No recommendations for this date' });

  res.json({
    id: row.id,
    date: row.date,
    market_sentiment: row.market_sentiment,
    summary: row.summary,
    recommendations: JSON.parse(row.recommendations || '[]'),
    global_cues: JSON.parse(row.global_cues || '[]'),
    generated_at: row.generated_at,
    model_used: row.model_used,
  });
});

// ── POST /api/recommendations/generate — admin-only manual trigger ────────
router.post('/generate', authMiddleware, async (req: AuthRequest, res) => {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user!.id) as any;
  if (user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    await generateDailyRecommendations();
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const row = db.prepare(
      'SELECT * FROM daily_recommendations WHERE date = ? OR 1=1 ORDER BY date DESC LIMIT 1'
    ).get() as any;

    if (row) {
      res.json({
        success: true,
        data: {
          id: row.id,
          date: row.date,
          market_sentiment: row.market_sentiment,
          summary: row.summary,
          recommendations: JSON.parse(row.recommendations || '[]'),
          generated_at: row.generated_at,
        },
      });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Generation failed' });
  }
});

export default router;
