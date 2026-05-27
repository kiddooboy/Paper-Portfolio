import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// ── Helper: get the PaperBot user id ──────────────────────────────────────
function getBotUserId(): number | null {
  const row = db.prepare(
    `SELECT id FROM users WHERE email = 'communitybot@paperportfolio.app'`
  ).get() as any;
  return row?.id ?? null;
}

// ── GET /api/paperbot/posts — recent PaperBot posts ───────────────────────
router.get('/posts', authMiddleware, (req: AuthRequest, res) => {
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const offset = (page - 1) * limit;
  const category = req.query.category as string | undefined;

  const botUserId = getBotUserId();
  if (!botUserId) return res.json([]);

  const catFilter = category && category !== 'all' ? `AND p.category = ?` : '';
  const params: any[] = catFilter ? [botUserId, category, limit, offset] : [botUserId, limit, offset];

  const posts = db.prepare(`
    SELECT p.*, u.name as author_name
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    ${catFilter}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params) as any[];

  res.json(posts);
});

// ── GET /api/paperbot/posts/:id — single post ────────────────────────────
router.get('/posts/:id', authMiddleware, (req: AuthRequest, res) => {
  const botUserId = getBotUserId();
  if (!botUserId) return res.status(404).json({ error: 'Post not found' });

  const post = db.prepare(`
    SELECT p.*, u.name as author_name
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.user_id = ?
  `).get(parseInt(req.params.id), botUserId) as any;

  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

// ── GET /api/paperbot/today — today's post (if any) ──────────────────────
router.get('/today', authMiddleware, (req: AuthRequest, res) => {
  const botUserId = getBotUserId();
  if (!botUserId) return res.json(null);

  const post = db.prepare(`
    SELECT p.*, u.name as author_name
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 1
  `).get(botUserId) as any;

  res.json(post || null);
});

export default router;
