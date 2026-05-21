import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

// GET /api/learn/progress — all module progress for the current user
router.get('/progress', authMiddleware, (req: AuthRequest, res) => {
  const rows = db.prepare(
    `SELECT module_id, completed, score, total, completed_at
     FROM learning_progress WHERE user_id = ?`
  ).all(req.user!.id) as any[];
  res.json({ progress: rows });
});

const completeSchema = z.object({
  moduleId: z.string().min(1).max(64),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});

// POST /api/learn/complete — record a finished module (upsert; keeps best score)
router.post('/complete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { moduleId, score, total } = completeSchema.parse(req.body);
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const existing = db.prepare(
      `SELECT score FROM learning_progress WHERE user_id = ? AND module_id = ?`
    ).get(userId, moduleId) as any;

    const bestScore = existing ? Math.max(Number(existing.score) || 0, score) : score;

    db.prepare(`
      INSERT INTO learning_progress (user_id, module_id, completed, score, total, completed_at)
      VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT (user_id, module_id) DO UPDATE SET
        completed    = 1,
        score        = ?,
        total        = excluded.total,
        completed_at = COALESCE(learning_progress.completed_at, excluded.completed_at),
        updated_at   = excluded.completed_at
    `).run(userId, moduleId, bestScore, total, now, bestScore);

    res.json({ success: true, moduleId, score: bestScore, total });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid data' });
  }
});

export default router;
