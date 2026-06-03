// FX rate endpoint — public, used by the client to display "₹83.20 / $".
// The actual order math reads the same cached rate on the server, never the
// client's view, so even a stale client doesn't poison the locked rate.

import { Router } from 'express';
import { getUsdInrRate, getCachedUsdInrRate } from '../services/fxService.js';

const router = Router();

router.get('/usdinr', async (_req, res) => {
  const cached = getCachedUsdInrRate();
  if (cached) {
    res.json({ pair: 'USDINR', rate: cached.rate, asOf: cached.at });
    // Refresh in the background — never block the response.
    getUsdInrRate().catch(() => {});
    return;
  }
  const rate = await getUsdInrRate();
  res.json({ pair: 'USDINR', rate, asOf: Date.now() });
});

export default router;
