import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

// JWT_SECRET must be set in production. The historical fallback lives in this
// repo's PUBLIC git history, and anyone holding it can mint a valid token for
// any user id — including role:'admin'. It is acceptable for local dev only.
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start in production with the public ' +
      'default secret. Generate one with: openssl rand -base64 32',
    );
  }
  return 'papertrade_dev_only_secret';
})();

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string };
  body: any;
  params: any;
}

export function generateToken(userId: number, email: string, role: string = 'user'): string {
  return jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  let token = req.cookies?.auth_token;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = verifyToken(token);
    // Guard against stale tokens whose user no longer exists (e.g. DB reset).
    const user = (await db.prepare('SELECT id, role FROM users WHERE id = ?').get(decoded.id)) as any;
    if (!user) return res.status(401).json({ error: 'Session expired, please log in again' });
    req.user = { id: decoded.id, email: decoded.email, role: user.role || 'user' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
