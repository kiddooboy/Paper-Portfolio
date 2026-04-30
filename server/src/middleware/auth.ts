import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'papertrade_secret_2026';

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
