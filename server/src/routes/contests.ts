import { Router } from 'express';
import { db } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCachedQuote, getCachedQuotes } from '../services/marketData.js';
import { z } from 'zod';

const router = Router();

// GET /api/contests — List all contests
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const now = new Date().toISOString();
  // Auto-update statuses
  db.prepare(`UPDATE contests SET status = 'active' WHERE status = 'upcoming' AND start_date <= ?`).run(now);
  db.prepare(`UPDATE contests SET status = 'completed' WHERE status = 'active' AND end_date < ?`).run(now);

  const contests = db.prepare(`SELECT * FROM contests ORDER BY start_date DESC`).all() as any[];
  const userId = req.user!.id;

  const enriched = contests.map(c => {
    const participant = db.prepare(`SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ?`).get(c.id, userId) as any;
    const participantCount = (db.prepare(`SELECT COUNT(*) as c FROM contest_participants WHERE contest_id = ?`).get(c.id) as any)?.c ?? 0;
    return { ...c, joined: !!participant, participantCount: Number(participantCount) };
  });

  res.json(enriched);
});

// POST /api/contests/:id/join — Join a contest
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res) => {
  const contestId = +req.params.id;
  const userId = req.user!.id;
  const contest = db.prepare(`SELECT * FROM contests WHERE id = ?`).get(contestId) as any;
  if (!contest) return res.status(404).json({ error: 'Contest not found' });
  if (contest.status === 'completed') return res.status(400).json({ error: 'Contest has ended' });
  try {
    db.prepare(`INSERT INTO contest_participants (contest_id, user_id, balance) VALUES (?, ?, ?)`).run(contestId, userId, contest.starting_capital);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Already joined this contest' });
  }
});

// GET /api/contests/:id/leaderboard
router.get('/:id/leaderboard', authMiddleware, async (req: AuthRequest, res) => {
  const contestId = +req.params.id;
  const participants = db.prepare(`
    SELECT cp.*, u.name FROM contest_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.contest_id = ?
  `).all(contestId) as any[];

  const holdings = db.prepare(`SELECT * FROM contest_holdings WHERE contest_id = ?`).all(contestId) as any[];
  const symbols = [...new Set(holdings.map((h: any) => h.symbol))];
  const quotes = symbols.length ? getCachedQuotes(symbols.map(s => ({ symbol: s, exchange: 'NSE' as const }))) : [];
  const qMap = new Map(quotes.map(q => [q.symbol, q.price]));

  const contest = db.prepare(`SELECT * FROM contests WHERE id = ?`).get(contestId) as any;

  const lb = participants.map(p => {
    const userHoldings = holdings.filter((h: any) => h.user_id === p.user_id);
    let holdingsValue = 0;
    for (const h of userHoldings) {
      holdingsValue += (qMap.get(h.symbol) ?? h.avg_buy_price) * h.quantity;
    }
    const portfolioValue = Number(p.balance) + holdingsValue;
    const pnl = portfolioValue - contest.starting_capital;
    const pnlPct = (pnl / contest.starting_capital) * 100;
    return { userId: p.user_id, name: p.name, portfolioValue: +portfolioValue.toFixed(2), pnl: +pnl.toFixed(2), pnlPct: +pnlPct.toFixed(2) };
  }).sort((a, b) => b.pnlPct - a.pnlPct).map((e, i) => ({ rank: i + 1, ...e }));

  res.json(lb);
});

// POST /api/contests/:id/trade — Place a trade within a contest
router.post('/:id/trade', authMiddleware, async (req: AuthRequest, res) => {
  const contestId = +req.params.id;
  const userId = req.user!.id;
  const { symbol, type, quantity } = req.body;
  if (!symbol || !type || !quantity) return res.status(400).json({ error: 'symbol, type, quantity required' });

  const contest = db.prepare(`SELECT * FROM contests WHERE id = ?`).get(contestId) as any;
  if (!contest || contest.status !== 'active') return res.status(400).json({ error: 'Contest not active' });

  const participant = db.prepare(`SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ?`).get(contestId, userId) as any;
  if (!participant) return res.status(403).json({ error: 'Not joined this contest' });

  const q = getCachedQuote(symbol.toUpperCase(), 'NSE');
  if (!q) return res.status(404).json({ error: 'Quote not available' });

  const price = q.price;
  const totalAmount = price * quantity;

  try {
    await db.transaction(async () => {
      if (type === 'BUY') {
        if (Number(participant.balance) < totalAmount) throw new Error('Insufficient contest balance');
        db.prepare(`UPDATE contest_participants SET balance = balance - ? WHERE contest_id = ? AND user_id = ?`).run(totalAmount, contestId, userId);
        const holding = db.prepare(`SELECT * FROM contest_holdings WHERE contest_id = ? AND user_id = ? AND symbol = ?`).get(contestId, userId, symbol.toUpperCase()) as any;
        if (holding) {
          const newQty = holding.quantity + quantity;
          const newAvg = ((holding.avg_buy_price * holding.quantity) + totalAmount) / newQty;
          db.prepare(`UPDATE contest_holdings SET quantity = ?, avg_buy_price = ? WHERE id = ?`).run(newQty, newAvg, holding.id);
        } else {
          db.prepare(`INSERT INTO contest_holdings (contest_id, user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?, ?)`).run(contestId, userId, symbol.toUpperCase(), quantity, price);
        }
      } else {
        const holding = db.prepare(`SELECT * FROM contest_holdings WHERE contest_id = ? AND user_id = ? AND symbol = ?`).get(contestId, userId, symbol.toUpperCase()) as any;
        if (!holding || holding.quantity < quantity) throw new Error('Insufficient holdings');
        db.prepare(`UPDATE contest_participants SET balance = balance + ? WHERE contest_id = ? AND user_id = ?`).run(totalAmount, contestId, userId);
        const newQty = holding.quantity - quantity;
        if (newQty <= 0) db.prepare(`DELETE FROM contest_holdings WHERE id = ?`).run(holding.id);
        else db.prepare(`UPDATE contest_holdings SET quantity = ? WHERE id = ?`).run(newQty, holding.id);
      }
      db.prepare(`INSERT INTO contest_transactions (contest_id, user_id, symbol, type, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(contestId, userId, symbol.toUpperCase(), type, quantity, price, totalAmount);
    });
    res.json({ success: true, price });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Trade failed' });
  }
});

// POST /api/contests — Admin: create contest
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const { name, description, start_date, end_date, starting_capital } = req.body;
  if (!name || !start_date || !end_date) return res.status(400).json({ error: 'name, start_date, end_date required' });
  const result = db.prepare(`INSERT INTO contests (name, description, start_date, end_date, starting_capital, created_by) VALUES (?, ?, ?, ?, ?, ?)`).run(
    name, description || null, start_date, end_date, starting_capital || 100000, req.user!.id
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

export default router;
