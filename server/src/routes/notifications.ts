import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { registerDevice, unregisterDevice } from '../services/push.js';

const router = Router();

// POST /api/notifications/register-device — store an FCM token for push
router.post('/register-device', authMiddleware, (req: AuthRequest, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token required' });
  registerDevice(req.user!.id, token, typeof platform === 'string' ? platform : undefined);
  res.json({ success: true });
});

// POST /api/notifications/unregister-device — remove an FCM token (on logout)
router.post('/unregister-device', authMiddleware, (req: AuthRequest, res) => {
  const { token } = req.body || {};
  if (token) unregisterDevice(token);
  res.json({ success: true });
});

// GET /api/notifications — Notification Center inbox
// Query params: type, read (0|1), symbol, days, limit, offset
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const type   = String(req.query.type   || '').trim();
  const read   = String(req.query.read   || '').trim();      // '', '0', '1'
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const days   = Math.min(parseInt(String(req.query.days || '60')) || 60, 365);
  const limit  = Math.min(parseInt(String(req.query.limit || '100')) || 100, 500);
  const offset = Math.max(0, parseInt(String(req.query.offset || '0')) || 0);

  const where: string[] = ['user_id = ?', `created_at >= datetime('now', '-' || ? || ' days')`];
  const params: any[]   = [userId, days];
  if (type)   { where.push('type = ?');                   params.push(type); }
  if (read === '0') { where.push('read = 0'); }
  if (read === '1') { where.push('read = 1'); }
  if (symbol) { where.push('(title LIKE ? OR message LIKE ?)'); params.push(`%${symbol}%`, `%${symbol}%`); }

  const rows = db.prepare(`
    SELECT * FROM notifications WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const totalRow = db.prepare(
    `SELECT COUNT(*) as c FROM notifications WHERE ${where.join(' AND ')}`
  ).get(...params) as any;

  // Group counts by type for the sidebar
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count, SUM(CASE WHEN read=0 THEN 1 ELSE 0 END) AS unread
    FROM notifications WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY type
  `).all(userId, days);

  res.json({ notifications: rows, total: Number(totalRow?.c || 0), groups: byType });
});

router.post('/:id/read', authMiddleware, async (req: AuthRequest, res) => {
  await db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ success: true });
});

router.post('/read-all', authMiddleware, async (req: AuthRequest, res) => {
  await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user!.id);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  await db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ success: true });
});

router.delete('/', authMiddleware, async (req: AuthRequest, res) => {
  const ids = (req.body?.ids || []) as number[];
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map(() => '?').join(',');
  await db.prepare(`DELETE FROM notifications WHERE user_id = ? AND id IN (${placeholders})`).run(req.user!.id, ...ids);
  res.json({ success: true, deleted: ids.length });
});

router.get('/unread-count', authMiddleware, async (req: AuthRequest, res) => {
  const row = (await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.user!.id)) as any;
  res.json({ count: row.count });
});

// ── Preferences ──
router.get('/prefs', authMiddleware, (req: AuthRequest, res) => {
  const row = db.prepare(`SELECT enabled FROM notification_prefs WHERE user_id = ?`).get(req.user!.id) as any;
  const enabled = row ? safeJson(row.enabled, ['order','price_alert','system']) : ['order','price_alert','system'];
  res.json({ enabled });
});

router.put('/prefs', authMiddleware, (req: AuthRequest, res) => {
  const enabled = req.body?.enabled;
  if (!Array.isArray(enabled)) return res.status(400).json({ error: 'enabled must be an array' });
  db.prepare(`
    INSERT INTO notification_prefs (user_id, enabled) VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')
  `).run(req.user!.id, JSON.stringify(enabled));
  res.json({ success: true, enabled });
});

function safeJson<T>(s: string | null, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

export default router;
