import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

const ADMIN_EMAIL = 'yogesh.nithyanandam@gmail.com';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setMpinSchema = z.object({
  mpin: z.string().length(4).regex(/^\d+$/),
});

const loginMpinSchema = z.object({
  email: z.string().email(),
  mpin: z.string().length(4).regex(/^\d+$/),
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const role = email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
    const hashedPw = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, role, balance) VALUES (?, ?, ?, ?, ?)').run(name, email, hashedPw, role, 100000);
    const userId = result.lastInsertRowid as number;
    const token = generateToken(userId, email, role);
    res.json({ token, user: { id: userId, name, email, role, balance: 100000 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const role = user.role || 'user';
    const token = generateToken(user.id, user.email, role);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role, balance: user.balance } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// POST /auth/set-mpin — set or change MPIN (requires auth)
router.post('/set-mpin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mpin } = setMpinSchema.parse(req.body);
    const userId = req.user!.id;
    const hashedMpin = await bcrypt.hash(mpin, 10);
    db.prepare('UPDATE users SET mpin_hash = ? WHERE id = ?').run(hashedMpin, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// POST /auth/login-mpin — login with email + 4-digit MPIN
router.post('/login-mpin', async (req, res) => {
  try {
    const { email, mpin } = loginMpinSchema.parse(req.body);
    const user = db.prepare('SELECT id, name, email, role, balance, mpin_hash FROM users WHERE email = ?').get(email) as any;
    if (!user || !user.mpin_hash) return res.status(400).json({ error: 'Invalid credentials or MPIN not set' });

    const valid = await bcrypt.compare(mpin, user.mpin_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid MPIN' });

    const role = user.role || 'user';
    const token = generateToken(user.id, user.email, role);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role, balance: user.balance } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, name, email, role, balance, created_at FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role || 'user', balance: user.balance, created_at: user.created_at } });
});

export default router;
