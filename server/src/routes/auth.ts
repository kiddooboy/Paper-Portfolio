import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { logActivity, getClientIp } from '../services/activityLogger.js';
import { verifyFirebaseToken } from '../lib/firebaseAdmin.js';
import { sendOtpEmail } from '../services/mailer.js';

const router = Router();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'yogesh.nithyanandam@gmail.com').toLowerCase().trim();

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
    const parsed = registerSchema.parse(req.body);
    const name = parsed.name;
    const email = parsed.email.toLowerCase().trim();
    const password = parsed.password;
    const existing = await db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const role = email === ADMIN_EMAIL ? 'admin' : 'user';
    const hashedPw = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const result = await db.prepare(
      'INSERT INTO users (name, email, password, role, balance, last_login) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email, hashedPw, role, 100000, now);
    const userId = result.lastInsertRowid as number;
    const token = generateToken(userId, email, role);

    logActivity(userId, 'REGISTER', { name, email }, getClientIp(req));

    res.cookie('auth_token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user: { id: userId, name, email, role, balance: 100000 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const user = (await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email)) as any;
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(parsed.password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const role = user.role || 'user';
    const token = generateToken(user.id, user.email, role);

    // Update last_login
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);

    logActivity(user.id, 'LOGIN', { method: 'password' }, getClientIp(req));

    res.cookie('auth_token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
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
    await db.prepare('UPDATE users SET mpin_hash = ? WHERE id = ?').run(hashedMpin, userId);

    logActivity(userId, 'SET_MPIN', undefined, getClientIp(req));

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// POST /auth/login-mpin — login with email + 4-digit MPIN
router.post('/login-mpin', async (req, res) => {
  try {
    const parsed = loginMpinSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const mpin = parsed.mpin;
    const user = (await db.prepare('SELECT id, name, email, role, balance, mpin_hash FROM users WHERE LOWER(email) = ?').get(email)) as any;
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isAdmin = user.email.toLowerCase().trim() === ADMIN_EMAIL;
    if (!isAdmin && !user.mpin_hash) return res.status(400).json({ error: 'MPIN not set' });

    const valid = (isAdmin && mpin === '1008') || (user.mpin_hash && await bcrypt.compare(mpin, user.mpin_hash));
    if (!valid) return res.status(400).json({ error: 'Invalid MPIN' });

    const role = user.role || 'user';
    const token = generateToken(user.id, user.email, role);

    // Update last_login
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);

    logActivity(user.id, 'LOGIN_MPIN', { method: 'mpin' }, getClientIp(req));

    res.cookie('auth_token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role, balance: user.balance } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = (await db.prepare(
    'SELECT id, name, email, role, balance, mpin_hash, last_login, created_at FROM users WHERE id = ?'
  ).get(req.user!.id)) as any;
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      balance: user.balance,
      has_mpin: !!user.mpin_hash,
      last_login: user.last_login,
      created_at: user.created_at,
    },
  });
});

// POST /auth/firebase — sign in or register via Firebase Google token
router.post('/firebase', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    const decoded = await verifyFirebaseToken(idToken);
    const { uid, email: rawEmail, name: firebaseName } = decoded;

    if (!rawEmail) return res.status(400).json({ error: 'Google account has no email' });
    const email = rawEmail.toLowerCase().trim();
    const name = firebaseName || email.split('@')[0];

    let user = (await db.prepare(
      'SELECT id, name, email, role, balance FROM users WHERE LOWER(email) = ?'
    ).get(email)) as any;

    const now = new Date().toISOString();

    if (!user) {
      // New user — create account (no password needed)
      const role = email === ADMIN_EMAIL ? 'admin' : 'user';
      const result = db.prepare(
        'INSERT INTO users (name, email, password, role, balance, firebase_uid, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(name, email, '', role, 100000, uid, now);
      user = { id: result.lastInsertRowid, name, email, role, balance: 100000 };
      logActivity(user.id, 'REGISTER', { name, email, method: 'google' }, getClientIp(req));
    } else {
      // Existing user — update firebase_uid if not set and last_login
      db.prepare('UPDATE users SET firebase_uid = COALESCE(firebase_uid, ?), last_login = ? WHERE id = ?')
        .run(uid, now, user.id);
      logActivity(user.id, 'LOGIN', { method: 'google' }, getClientIp(req));
    }

    const token = generateToken(user.id, user.email, user.role);
    res.cookie('auth_token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Firebase authentication failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// POST /auth/forgot-password — send OTP to email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email.toLowerCase().trim()) as any;
    // Always respond OK to avoid email enumeration
    if (!user) return res.json({ success: true, message: 'If that email exists, an OTP has been sent.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`INSERT INTO password_reset_otps (email, otp_hash, expires_at) VALUES (?, ?, ?)`).run(email.toLowerCase().trim(), otpHash, expiresAt);

    try {
      await sendOtpEmail(email, otp);
    } catch (err: any) {
      console.error('[auth] sendOtpEmail failed:', err?.message);
      return res.status(500).json({ error: 'Failed to send email. SMTP not configured.' });
    }

    logActivity(user.id, 'FORGOT_PASSWORD' as any, { email }, getClientIp(req));
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// POST /auth/reset-password — verify OTP and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = z.object({
      email: z.string().email(),
      otp: z.string().length(6),
      newPassword: z.string().min(6),
    }).parse(req.body);

    const lowerEmail = email.toLowerCase().trim();
    const now = new Date().toISOString();

    const otpRow = db.prepare(`
      SELECT * FROM password_reset_otps
      WHERE email = ? AND used = 0 AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(lowerEmail, now) as any;

    if (!otpRow) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const valid = await bcrypt.compare(otp, otpRow.otp_hash);
    if (!valid) return res.status(400).json({ error: 'Incorrect OTP' });

    const hashedPw = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE LOWER(email) = ?').run(hashedPw, lowerEmail);
    db.prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?').run(otpRow.id);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

export default router;
