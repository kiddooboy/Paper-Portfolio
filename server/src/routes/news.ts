import { Router } from 'express';
import { getMarketNews, getStockNews } from '../services/newsService.js';

const router = Router();

// GET /api/news?category=stocks|markets|economy|ipo|all
router.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const data = await getMarketNews(category);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to fetch news' });
  }
});

// GET /api/news/stock/:symbol
router.get('/stock/:symbol', async (req, res) => {
  try {
    const data = await getStockNews(req.params.symbol);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to fetch stock news' });
  }
});

export default router;
