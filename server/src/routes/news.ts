import { Router } from 'express';
import { getMarketNews, getStockNews, SentimentAnalysis } from '../services/newsService.js';
import { getCachedQuote } from '../services/marketData.js';

const router = Router();

const BUY_KEYWORDS  = ['long position', 'buy', 'accumulate', 'add ', 'enter long', 'consider buying', 'go long'];
const SELL_KEYWORDS = ['sell', 'short', 'exit', 'reduce', 'take profit', 'consider selling', 'close position'];

function detectAction(userAction: string): 'BUY' | 'SELL' | null {
  const lower = userAction.toLowerCase();
  if (SELL_KEYWORDS.some(k => lower.includes(k))) return 'SELL';
  if (BUY_KEYWORDS.some(k => lower.includes(k))) return 'BUY';
  return null;
}

const BASE_INVESTMENT = 10_000; // ₹10,000 base per trade

export interface ActionItem {
  id: string;
  stock: string;
  action: 'BUY' | 'SELL';
  headline: string;
  cleanTitle: string;
  summary: string;
  risk: string;
  userAction: string;
  sentiment: string;
  confidence: number;
  impactScore: number;
  currentPrice: number | null;
  suggestedQty: number | null;
  suggestedAmount: number;
  pubDate: string;
  link: string;
  publisher: string;
}

// ── Daily accumulator ─────────────────────────────────────────────────────────
// Signals are merged throughout the day (deduped by article id).
// At midnight the store resets automatically so every morning starts fresh.
interface DailyStore {
  date: string;                    // YYYY-MM-DD in Asia/Kolkata
  items: Map<string, ActionItem>;  // keyed by article id
}

let dailyStore: DailyStore = { date: '', items: new Map() };

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function mergeIntoDaily(incoming: ActionItem[]): ActionItem[] {
  const today = todayIST();
  if (dailyStore.date !== today) {
    // New calendar day — start fresh
    console.log(`[signals] New day (${today}), resetting daily store`);
    dailyStore = { date: today, items: new Map() };
  }
  let added = 0;
  for (const item of incoming) {
    if (!dailyStore.items.has(item.id)) {
      dailyStore.items.set(item.id, item);
      added++;
    }
  }
  if (added > 0) console.log(`[signals] +${added} new signals → ${dailyStore.items.size} total today`);
  return Array.from(dailyStore.items.values())
    .sort((a, b) => b.impactScore - a.impactScore);
}

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

// GET /api/news/actions?symbols=BSE,RELIANCE,TCS&limit=5
// Batch-analyzes headlines for given symbols, returns only buy/sell action cards
router.get('/actions', async (req, res) => {
  try {
    const symbolsRaw = (req.query.symbols as string) || '';
    const limitPerSymbol = Math.min(parseInt(req.query.limit as string) || 5, 10);
    const symbols = symbolsRaw
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 8); // max 8 symbols

    if (!symbols.length) return res.json([]);

    // Fetch & analyze news for all symbols in parallel (getStockNews is cached)
    const results = await Promise.allSettled(symbols.map(s => getStockNews(s)));

    const actions: ActionItem[] = [];

    results.forEach((result, idx) => {
      if (result.status !== 'fulfilled') return;
      const symbol = symbols[idx];

      // Get current price from cache
      const cached = getCachedQuote(symbol, 'NSE');
      const price = cached && cached.price > 0 ? cached.price : null;

      result.value.slice(0, limitPerSymbol).forEach(article => {
        const sa: SentimentAnalysis | undefined = article.sentiment;
        if (!sa?.analysis?.user_action) return;

        const action = detectAction(sa.analysis.user_action);
        if (!action) return;

        const { confidence, impact_score, user_action, summary, risk, clean_title, sentiment } = sa.analysis;
        const weightedAmount = Math.round(BASE_INVESTMENT * (impact_score / 100) * confidence);
        const suggestedQty = price && price > 0
          ? Math.max(1, Math.round(weightedAmount / price))
          : null;

        actions.push({
          id: article.id,
          stock: symbol,
          action,
          headline: article.title,
          cleanTitle: clean_title || article.title,
          summary: summary || '',
          risk: risk || '',
          userAction: user_action,
          sentiment: sentiment || '',
          confidence,
          impactScore: impact_score,
          currentPrice: price,
          suggestedQty,
          suggestedAmount: weightedAmount,
          pubDate: article.pubDate,
          link: article.link,
          publisher: article.publisher || article.source,
        });
      });
    });

    // Merge into today's accumulator and return the full day's signals
    const accumulated = mergeIntoDaily(actions);
    res.json(accumulated);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to fetch actions' });
  }
});

export default router;
