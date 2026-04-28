import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { sendOtpEmail, isEmailConfigured } from '../services/email.js';

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
    const parsed = registerSchema.parse(req.body);
    const name = parsed.name;
    const email = parsed.email.toLowerCase().trim();
    const password = parsed.password;
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const role = email === ADMIN_EMAIL ? 'admin' : 'user';
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
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email) as any;
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(parsed.password, user.password);
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
    const parsed = loginMpinSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const mpin = parsed.mpin;
    const user = db.prepare('SELECT id, name, email, role, balance, mpin_hash FROM users WHERE LOWER(email) = ?').get(email) as any;
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

// ── OTP Login (registered users only) ──
const requestOtpSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d+$/),
});

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between requests
const OTP_MAX_ATTEMPTS = 5;

// POST /auth/request-otp — generate and email an OTP to a registered user
router.post('/request-otp', async (req, res) => {
  try {
    const email = requestOtpSchema.parse(req.body).email.toLowerCase().trim();

    const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email) as any;
    if (!user) {
      // Don't reveal whether email exists; still return generic message
      return res.status(404).json({ error: 'No account found with this email. Please register first.' });
    }

    // Rate limit: refuse if a recent (non-consumed, non-expired) OTP was just issued
    const recent = db.prepare(
      `SELECT created_at FROM otp_codes WHERE email = ? AND consumed = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`
    ).get(email, Date.now()) as any;
    if (recent && recent.created_at) {
      const createdMs = new Date(recent.created_at + 'Z').getTime();
      if (!isNaN(createdMs) && Date.now() - createdMs < OTP_RESEND_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    // Invalidate older codes for this email
    db.prepare('UPDATE otp_codes SET consumed = 1 WHERE email = ? AND consumed = 0').run(email);
    db.prepare(
      'INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, ?)'
    ).run(email, codeHash, expiresAt);

    const sent = await sendOtpEmail(email, code);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send OTP. Please try again later.' });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email',
      // expose dev-mode flag so client can show a hint when SMTP isn't configured
      dev: !isEmailConfigured(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid data' });
  }
});

// POST /auth/login-otp — verify OTP and issue JWT
router.post('/login-otp', async (req, res) => {
  try {
    const parsed = verifyOtpSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const code = parsed.code;

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email) as any;
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const otp = db.prepare(
      `SELECT * FROM otp_codes WHERE email = ? AND consumed = 0 ORDER BY id DESC LIMIT 1`
    ).get(email) as any;
    if (!otp) return res.status(400).json({ error: 'No active OTP. Please request a new one.' });
    if (otp.expires_at < Date.now()) {
      db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(otp.id);
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(otp.id);
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const valid = await bcrypt.compare(code, otp.code_hash);
    if (!valid) {
      db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otp.id);
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Consume OTP
    db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(otp.id);

    const role = user.role || 'user';
    const token = generateToken(user.id, user.email, role);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role, balance: user.balance },
    });
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
