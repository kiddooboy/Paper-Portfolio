import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

const MC_URL = 'https://35w41kobie.execute-api.ap-south-1.amazonaws.com/default/v2';
const MC_KEY = 'wwNacOkQ0o6jTocgeCDtAayvSFANpn9M5ZTU8qDy';

const mcAxios = axios.create({
  baseURL: MC_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': MC_KEY,
  },
});

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

    const payload = {
      portfolio_id: String(req.user!.id),
      holdings: mcHoldings,
      num_sims: 1000,
      horizon_months: 60,
    };

    console.log('[monteCarlo] calling API with', mcHoldings.length, 'holdings');

    let data: any;
    try {
      const r = await mcAxios.post('', payload);
      data = r.data;
    } catch (err: any) {
      // Cold-start: retry once after 6 s
      const status = err?.response?.status;
      console.log('[monteCarlo] first attempt failed with status', status, '— retrying in 6s');
      await new Promise(r => setTimeout(r, 6000));
      const r2 = await mcAxios.post('', payload);
      data = r2.data;
    }

    console.log('[monteCarlo] success, current_value:', data?.current_value);
    res.json(data);
  } catch (err: any) {
    const status = err?.response?.status;
    const body = JSON.stringify(err?.response?.data).slice(0, 200);
    console.error('[monteCarlo] failed after retry — status:', status, 'body:', body, 'msg:', err?.message);
    res.status(502).json({ error: 'Simulation service unavailable. Try again shortly.' });
  }
});

export default router;
