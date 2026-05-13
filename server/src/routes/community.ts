import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const CATEGORIES = ['general', 'market', 'strategies', 'intraday', 'fundamentals', 'beginners', 'trades', 'news'];

// ── GET /api/community/posts ──
router.get('/posts', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const category = req.query.category as string | undefined;
  const sort = (req.query.sort as string) || 'hot';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const orderBy =
    sort === 'new' ? 'p.created_at DESC' :
    sort === 'top' ? '(p.upvotes - p.downvotes) DESC, p.created_at DESC' :
    /* hot */ '((p.upvotes - p.downvotes) + p.comments_count * 0.5) DESC, p.created_at DESC';

  const where = category && CATEGORIES.includes(category) ? `WHERE p.category = '${category}'` : '';

  const posts = (await db.prepare(`
    SELECT p.*, u.name as author_name,
           v.vote as my_vote
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN community_votes v ON v.post_id = p.id AND v.user_id = ?
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset)) as any[];

  res.json(posts);
});

// ── POST /api/community/posts ──
router.post('/posts', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { title, body, category = 'general' } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!body?.trim()) return res.status(400).json({ error: 'Body is required' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });

  const result = db.prepare(`
    INSERT INTO community_posts (user_id, title, body, category)
    VALUES (?, ?, ?, ?)
  `).run(userId, title.trim(), body.trim(), category);

  const post = db.prepare(`
    SELECT p.*, u.name as author_name, NULL as my_vote
    FROM community_posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(result.lastInsertRowid) as any;

  res.status(201).json(post);
});

// ── DELETE /api/community/posts/:id ──
router.delete('/posts/:id', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(req.params.id) as any;
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== userId) return res.status(403).json({ error: 'Not your post' });
  db.prepare('DELETE FROM community_posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /api/community/posts/:id/vote ──
router.post('/posts/:id/vote', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const postId = parseInt(req.params.id);
  const { vote } = req.body; // 1 or -1

  if (vote !== 1 && vote !== -1) return res.status(400).json({ error: 'Vote must be 1 or -1' });

  const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(postId) as any;
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare('SELECT * FROM community_votes WHERE user_id = ? AND post_id = ?').get(userId, postId) as any;

  if (existing) {
    if (existing.vote === vote) {
      // Toggle off
      db.prepare('DELETE FROM community_votes WHERE user_id = ? AND post_id = ?').run(userId, postId);
      const col = vote === 1 ? 'upvotes' : 'downvotes';
      db.prepare(`UPDATE community_posts SET ${col} = MAX(0, ${col} - 1) WHERE id = ?`).run(postId);
      return res.json({ vote: null });
    } else {
      // Switch vote
      db.prepare('UPDATE community_votes SET vote = ? WHERE user_id = ? AND post_id = ?').run(vote, userId, postId);
      if (vote === 1) {
        db.prepare('UPDATE community_posts SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1) WHERE id = ?').run(postId);
      } else {
        db.prepare('UPDATE community_posts SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(postId);
      }
      return res.json({ vote });
    }
  }

  db.prepare('INSERT INTO community_votes (user_id, post_id, vote) VALUES (?, ?, ?)').run(userId, postId, vote);
  const col = vote === 1 ? 'upvotes' : 'downvotes';
  db.prepare(`UPDATE community_posts SET ${col} = ${col} + 1 WHERE id = ?`).run(postId);
  res.json({ vote });
});

// ── GET /api/community/posts/:id/comments ──
router.get('/posts/:id/comments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const comments = (await db.prepare(`
    SELECT c.*, u.name as author_name,
           v.vote as my_vote
    FROM community_comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN community_votes v ON v.comment_id = c.id AND v.user_id = ?
    WHERE c.post_id = ?
    ORDER BY c.upvotes DESC, c.created_at ASC
  `).all(userId, req.params.id)) as any[];
  res.json(comments);
});

// ── POST /api/community/posts/:id/comments ──
router.post('/posts/:id/comments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const postId = parseInt(req.params.id);
  const { body, parent_id } = req.body;

  if (!body?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const post = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId) as any;
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const result = db.prepare(`
    INSERT INTO community_comments (post_id, user_id, body, parent_id)
    VALUES (?, ?, ?, ?)
  `).run(postId, userId, body.trim(), parent_id || null);

  db.prepare('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId);

  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, NULL as my_vote
    FROM community_comments c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(result.lastInsertRowid) as any;

  res.status(201).json(comment);
});

// ── POST /api/community/comments/:id/vote ──
router.post('/comments/:id/vote', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const commentId = parseInt(req.params.id);
  const { vote } = req.body;

  if (vote !== 1 && vote !== -1) return res.status(400).json({ error: 'Vote must be 1 or -1' });

  const existing = db.prepare('SELECT * FROM community_votes WHERE user_id = ? AND comment_id = ?').get(userId, commentId) as any;

  if (existing) {
    if (existing.vote === vote) {
      db.prepare('DELETE FROM community_votes WHERE user_id = ? AND comment_id = ?').run(userId, commentId);
      db.prepare('UPDATE community_comments SET upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(commentId);
      return res.json({ vote: null });
    } else {
      db.prepare('UPDATE community_votes SET vote = ? WHERE user_id = ? AND comment_id = ?').run(vote, userId, commentId);
      const delta = vote === 1 ? 1 : -1;
      db.prepare('UPDATE community_comments SET upvotes = upvotes + ? WHERE id = ?').run(delta * 2, commentId);
      return res.json({ vote });
    }
  }

  db.prepare('INSERT INTO community_votes (user_id, comment_id, vote) VALUES (?, ?, ?)').run(userId, commentId, vote);
  if (vote === 1) db.prepare('UPDATE community_comments SET upvotes = upvotes + 1 WHERE id = ?').run(commentId);
  res.json({ vote });
});

export default router;
