import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const notifications = await db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user!.id);
  res.json(notifications);
});

router.post('/:id/read', authMiddleware, async (req: AuthRequest, res) => {
  await db.prepare('UPDATE notifications SET read = TRUE WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ success: true });
});

router.get('/unread-count', authMiddleware, async (req: AuthRequest, res) => {
  const row = (await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = FALSE').get(req.user!.id)) as any;
  res.json({ count: row.count });
});

export default router;
