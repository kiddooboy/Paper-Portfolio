import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const MC_URL = 'https://35w41kobie.execute-api.ap-south-1.amazonaws.com/default/Compass-MonteCarlo-Bridge';

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const holdings = db.prepare(
      'SELECT symbol, quantity, avg_buy_price FROM holdings WHERE user_id = ?'
    ).all(req.user!.id) as any[];

    if (!holdings.length) {
      return res.status(400).json({ error: 'No holdings to simulate. Buy some stocks first.' });
    }

    const quotes = getCachedQuotes(holdings.map((h) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
    const priceMap = new Map(quotes.map((q) => [q.symbol, q]));

    const mcHoldings = holdings.map((h) => {
      const q = priceMap.get(h.symbol);
      const price = q?.price ?? h.avg_buy_price;
      return {
        symbol: `${h.symbol}.NS`,
        quantity: h.quantity,
        value: +(price * h.quantity).toFixed(2),
      };
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': 'wwNacOkQ0o6jTocgeCDtAayvSFANpn9M5ZTU8qDy',
    };

    const payload = {
      portfolio_id: String(req.user!.id),
      holdings: mcHoldings,
      num_sims: 1000,
      horizon_months: 60,
    };

    const callMC = () => fetch(MC_URL, { method: 'POST', headers, body: JSON.stringify(payload) });

    let mcRes = await callMC();

    // Cold-start retry — Lambda may need ~6s to warm up after inactivity
    if (mcRes.status === 502 || mcRes.status === 503) {
      console.log('[monteCarlo] cold start detected, retrying in 5s…');
      await new Promise(r => setTimeout(r, 5000));
      mcRes = await callMC();
    }

    const responseText = await mcRes.text();

    if (!mcRes.ok) {
      console.error('[monteCarlo] upstream error after retry', mcRes.status, responseText.slice(0, 200));
      return res.status(502).json({ error: 'Simulation service unavailable. Try again shortly.' });
    }

    const data = JSON.parse(responseText);
    res.json(data);
  } catch (err: any) {
    console.error('[monteCarlo]', err?.message || err);
    res.status(500).json({ error: 'Simulation failed. Please try again.' });
  }
});

export default router;
