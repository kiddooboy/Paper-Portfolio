// Daily Market Recommendations — AI-powered stock picks generated before market open.
//
// This service gathers market context (previous day data, global indices, technical
// signals) and sends it to Claude to produce actionable stock recommendations.
// Scheduled to run at 9:00 AM IST on trading days.

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { getCachedQuotes, getCachedIndices, getQuotes, getHistory, isMarketOpen } from './marketData.js';
import { calcRSI, calcMACD, calcEMA, calcSupertrend, calcATR, calcBollinger, calcVWAP, type Bar } from './indicators.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// ── Helper: get IST date string ────────────────────────────────────────────
function getISTDateStr(): string {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  return now.toISOString().slice(0, 10);
}

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

// ── Gather market context for the AI ───────────────────────────────────────
async function gatherMarketContext(): Promise<string> {
  let ctx = '';

  // 1. Indian index data
  try {
    const indices = getCachedIndices();
    if (indices.length) {
      ctx += `## INDIAN MARKET INDICES (Previous Close / Latest)\n`;
      for (const idx of indices) {
        if (idx.price > 0) {
          ctx += `- ${idx.name} (${idx.symbol}): ₹${idx.price.toFixed(2)} | Change: ${idx.change >= 0 ? '+' : ''}${idx.change.toFixed(2)} (${idx.change_percent >= 0 ? '+' : ''}${idx.change_percent.toFixed(2)}%)\n`;
        }
      }
      ctx += '\n';
    }
  } catch {}

  // 2. Global indices context (S&P 500, NASDAQ, Dow, Hang Seng etc.)
  try {
    const globalSymbols = [
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: '^IXIC', name: 'NASDAQ' },
      { symbol: '^DJI',  name: 'Dow Jones' },
      { symbol: '^HSI',  name: 'Hang Seng' },
      { symbol: '^N225', name: 'Nikkei 225' },
      { symbol: '^FTSE', name: 'FTSE 100' },
    ];
    const globalQuotes = await getQuotes(
      globalSymbols.map(s => ({ symbol: s.symbol, exchange: 'NSE' as const })),
      false
    ).catch(() => []);

    if (globalQuotes.length) {
      ctx += `## GLOBAL MARKET CUES (Overnight)\n`;
      for (const q of globalQuotes) {
        const meta = globalSymbols.find(s => s.symbol === q.symbol);
        if (q.price > 0) {
          ctx += `- ${meta?.name || q.symbol}: ${q.price.toFixed(2)} (${q.change_percent >= 0 ? '+' : ''}${q.change_percent.toFixed(2)}%)\n`;
        }
      }
      ctx += '\n';
    }
  } catch {}

  // 3. Top NSE stocks with technical analysis
  try {
    const dbStocks = db.prepare(
      `SELECT symbol FROM stocks WHERE exchange = 'NSE' LIMIT 100`
    ).all() as { symbol: string }[];

    const stockSymbols = dbStocks.map(s => s.symbol);
    const quotes = getCachedQuotes(stockSymbols.map(s => ({ symbol: s, exchange: 'NSE' as const })));

    // Filter to stocks with valid prices and interesting moves
    const activeStocks = quotes
      .filter(q => q.price > 0 && q.volume > 0)
      .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
      .slice(0, 30);

    if (activeStocks.length) {
      ctx += `## TOP NSE STOCKS (By Activity)\n`;
      ctx += `| Symbol | Price (₹) | Change % | Volume |\n`;
      ctx += `|--------|-----------|----------|--------|\n`;
      for (const q of activeStocks.slice(0, 20)) {
        ctx += `| ${q.symbol} | ${q.price.toFixed(2)} | ${q.change_percent >= 0 ? '+' : ''}${q.change_percent.toFixed(2)}% | ${(q.volume / 1000).toFixed(0)}K |\n`;
      }
      ctx += '\n';

      // 4. Technical analysis for top candidates
      ctx += `## TECHNICAL SIGNALS (Top 15 Stocks)\n`;
      for (const q of activeStocks.slice(0, 15)) {
        try {
          const from = new Date(Date.now() - 30 * 24 * 3600 * 1000);
          const bars = await getHistory(q.symbol, 'NSE', from, '1d').catch(() => []);
          if (bars.length < 14) continue;

          const closes = bars.map((b: Bar) => b.close);
          const rsiArr = calcRSI(closes, 14);
          const rsi = last(rsiArr);
          const macd = calcMACD(closes);
          const macdHist = last(macd)?.histogram;
          const ema9 = last(calcEMA(closes, 9));
          const ema21 = last(calcEMA(closes, 21));
          const st = last(calcSupertrend(bars, 10, 3));
          const atr = last(calcATR(bars, 14));
          const bb = last(calcBollinger(closes, 20, 2));

          ctx += `### ${q.symbol} (₹${q.price.toFixed(2)})\n`;
          ctx += `- RSI(14): ${rsi?.toFixed(1) ?? 'N/A'}\n`;
          ctx += `- MACD Histogram: ${macdHist?.toFixed(3) ?? 'N/A'}\n`;
          ctx += `- EMA9 vs EMA21: ${ema9 && ema21 ? (ema9 > ema21 ? 'Bullish crossover' : 'Bearish') : 'N/A'}\n`;
          ctx += `- Supertrend: ${st?.dir === 1 ? 'Bullish' : st?.dir === -1 ? 'Bearish' : 'N/A'}\n`;
          ctx += `- ATR(14): ${atr?.toFixed(2) ?? 'N/A'} (${atr && q.price ? ((atr / q.price) * 100).toFixed(1) + '% of price' : 'N/A'})\n`;
          if (bb && bb.lower != null && bb.mid != null && bb.upper != null) ctx += `- Bollinger: Lower ${bb.lower.toFixed(2)} | Mid ${bb.mid.toFixed(2)} | Upper ${bb.upper.toFixed(2)}\n`;
          ctx += '\n';
        } catch {}
      }
    }
  } catch {}

  // 5. News sentiment if available
  try {
    const today = getISTDateStr();
    const sentiments = db.prepare(`
      SELECT symbol, score, mentions, top_title FROM symbol_sentiment
      WHERE date = ? ORDER BY ABS(score) DESC LIMIT 10
    `).all(today) as any[];
    if (sentiments.length) {
      ctx += `## NEWS SENTIMENT TODAY\n`;
      for (const s of sentiments) {
        const tone = s.score > 0.2 ? '🟢 Positive' : s.score < -0.2 ? '🔴 Negative' : '⚪ Neutral';
        ctx += `- ${s.symbol}: ${tone} (${s.mentions} mentions) — "${s.top_title || ''}"\n`;
      }
      ctx += '\n';
    }
  } catch {}

  return ctx;
}

// ── Build the global cues JSON for storage ─────────────────────────────────
async function getGlobalCuesJson(): Promise<string> {
  try {
    const globalSymbols = [
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: '^IXIC', name: 'NASDAQ' },
      { symbol: '^DJI',  name: 'Dow Jones' },
      { symbol: '^HSI',  name: 'Hang Seng' },
      { symbol: '^N225', name: 'Nikkei 225' },
      { symbol: '^FTSE', name: 'FTSE 100' },
    ];
    const quotes = await getQuotes(
      globalSymbols.map(s => ({ symbol: s.symbol, exchange: 'NSE' as const })),
      false
    ).catch(() => []);

    return JSON.stringify(quotes.map(q => {
      const meta = globalSymbols.find(s => s.symbol === q.symbol);
      return {
        symbol: q.symbol,
        name: meta?.name || q.name || q.symbol,
        price: q.price,
        change: q.change,
        change_percent: q.change_percent,
      };
    }));
  } catch {
    return '[]';
  }
}

// ── Generate recommendations using Claude ──────────────────────────────────
export async function generateDailyRecommendations(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[recommendations] ANTHROPIC_API_KEY not set — skipping generation');
    return;
  }

  const today = getISTDateStr();

  // Check if already generated today
  const existing = db.prepare(
    'SELECT id FROM daily_recommendations WHERE date = ?'
  ).get(today) as any;
  if (existing) {
    console.log(`[recommendations] Already generated for ${today} — skipping`);
    return;
  }

  console.log(`[recommendations] Generating daily picks for ${today}...`);

  try {
    const marketContext = await gatherMarketContext();
    const globalCues = await getGlobalCuesJson();

    const systemPrompt = `You are an elite AI market analyst for Paper Portfolio, an Indian stock market paper trading platform. Your job is to analyze market conditions and generate actionable stock recommendations for the trading day.

You have deep expertise in Indian equity markets (NSE/BSE), technical analysis, and market sentiment. You combine quantitative analysis with market intuition.

IMPORTANT RULES:
1. Focus on NSE-listed stocks only
2. Provide 5-8 stock recommendations
3. Each must have a clear BUY, SELL, or HOLD action
4. Include specific entry price ranges, targets, and stop-losses
5. Rate confidence from 0-100
6. Specify timeframe: "intraday" or "short-term" (2-5 days)
7. Always add reasoning based on the technical and fundamental data provided
8. Consider global cues and overnight moves
9. This is for PAPER TRADING / EDUCATION only — always remind this
10. Be bold but responsible — flag risks clearly

OUTPUT FORMAT (strict JSON):
{
  "market_sentiment": "bullish" | "bearish" | "neutral",
  "summary": "2-3 sentence market overview for today",
  "recommendations": [
    {
      "symbol": "RELIANCE",
      "name": "Reliance Industries",
      "action": "BUY",
      "confidence": 78,
      "entry_range": [2850, 2880],
      "target": 2950,
      "stop_loss": 2810,
      "reasoning": "Strong technical setup with RSI at 58 showing healthy momentum...",
      "timeframe": "intraday",
      "technical_signals": {
        "rsi": 58,
        "macd": "bullish",
        "supertrend": "up",
        "ema_trend": "bullish"
      },
      "catalysts": ["Strong Q4 results", "Sector rotation into energy"]
    }
  ]
}

Respond ONLY with the JSON object. No markdown, no code fences, no explanatory text.`;

    const userPrompt = `Analyze the following market data and generate today's stock recommendations.

Current Date: ${today}
Market Status: ${isMarketOpen() ? 'Open' : 'Pre-market/Closed'}

${marketContext}

Based on this data, provide your daily stock recommendations in the exact JSON format specified. Focus on the strongest setups with the clearest risk/reward.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = (response.content[0] as any).text as string;

    // Parse the JSON response — handle potential markdown fences
    let parsed: any;
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[recommendations] Failed to parse AI response:', rawText.slice(0, 500));
      throw new Error('Failed to parse AI recommendation response');
    }

    const sentiment = parsed.market_sentiment || 'neutral';
    const summary = parsed.summary || 'Market analysis unavailable.';
    const recommendations = parsed.recommendations || [];

    db.prepare(`
      INSERT INTO daily_recommendations (date, market_sentiment, summary, recommendations, global_cues, model_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      today,
      sentiment,
      summary,
      JSON.stringify(recommendations),
      globalCues,
      'claude-haiku-4-5-20251001'
    );

    console.log(`[recommendations] Generated ${recommendations.length} picks for ${today} (sentiment: ${sentiment})`);
  } catch (err: any) {
    console.error('[recommendations] Generation failed:', err?.message || err);
  }
}
