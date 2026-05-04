import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { getCachedQuotes, getCachedIndices, getMarketStatus } from '../services/marketData.js';

const router = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

async function getUserContext(userId: number): Promise<string> {
  try {
    const user = db.prepare('SELECT name, balance FROM users WHERE id = ?').get(userId) as any;
    const holdings = db.prepare('SELECT * FROM holdings WHERE user_id = ?').all(userId) as any[];
    const recentOrders = db.prepare(
      `SELECT symbol, type, transaction_type, quantity, price, status, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`
    ).all(userId) as any[];
    const pnlRow = db.prepare('SELECT COALESCE(SUM(realized_pnl),0) as total FROM trade_pnl WHERE user_id = ?').get(userId) as any;
    const realizedPnl = Number(pnlRow?.total || 0);

    let ctx = `\n## USER PROFILE\nName: ${user?.name || 'User'}\nAvailable Cash: ${fmt(user?.balance || 0)}\nRealized P&L (all-time): ${fmt(realizedPnl)}\n`;

    if (holdings.length === 0) {
      ctx += '\nPortfolio: Empty — no holdings yet.\n';
    } else {
      const quotes = getCachedQuotes(holdings.map((h) => ({ symbol: h.symbol, exchange: 'NSE' as const })));
      const qmap = new Map(quotes.map((q) => [q.symbol, q]));
      let invested = 0, current = 0;

      const enriched = holdings.map((h) => {
        const q = qmap.get(h.symbol);
        const price = q?.price ?? h.avg_buy_price;
        const pnl = (price - h.avg_buy_price) * h.quantity;
        const pnlPct = h.avg_buy_price > 0 ? (price - h.avg_buy_price) / h.avg_buy_price * 100 : 0;
        invested += h.avg_buy_price * h.quantity;
        current += price * h.quantity;
        return { ...h, price, pnl, pnlPct, name: q?.name || h.symbol };
      });

      const totalPnl = current - invested;
      const totalPnlPct = invested > 0 ? totalPnl / invested * 100 : 0;

      const sectorRows = holdings.length
        ? db.prepare(`SELECT symbol, sector FROM stocks WHERE symbol IN (${holdings.map(() => '?').join(',')})`).all(...holdings.map((h) => h.symbol)) as any[]
        : [];
      const sectorMap = new Map(sectorRows.map((r: any) => [r.symbol, r.sector]));

      ctx += `\n## PORTFOLIO SUMMARY\nTotal Invested: ${fmt(invested)}\nCurrent Value: ${fmt(current)}\nUnrealized P&L: ${fmt(totalPnl)} (${pct(totalPnlPct)})\nHoldings: ${holdings.length} stocks\n\n`;
      ctx += `## HOLDINGS\n`;
      for (const h of enriched) {
        ctx += `- **${h.symbol}** (${h.name}) | Sector: ${sectorMap.get(h.symbol) || 'N/A'} | Qty: ${h.quantity} | Avg: ${fmt(h.avg_buy_price)} | LTP: ${fmt(h.price)} | P&L: ${fmt(h.pnl)} (${pct(h.pnlPct)})\n`;
      }
      const sorted = [...enriched].sort((a, b) => b.pnlPct - a.pnlPct);
      if (sorted.length > 0) {
        ctx += `\nBest performer: ${sorted[0].symbol} ${pct(sorted[0].pnlPct)}\n`;
        ctx += `Worst performer: ${sorted[sorted.length - 1].symbol} ${pct(sorted[sorted.length - 1].pnlPct)}\n`;
      }
    }

    if (recentOrders.length) {
      ctx += `\n## RECENT ORDERS\n`;
      for (const o of recentOrders) {
        ctx += `- ${o.transaction_type} ${o.quantity} ${o.symbol} @ ${fmt(o.price || 0)} | ${o.type} | ${o.status} | ${new Date(o.created_at).toLocaleDateString('en-IN')}\n`;
      }
    }
    return ctx;
  } catch (e) {
    return '\nPortfolio data unavailable.\n';
  }
}

function getMarketContext(): string {
  try {
    const status = getMarketStatus();
    const indices = getCachedIndices();
    let ctx = `\n## LIVE MARKET\nStatus: ${status.isOpen ? 'OPEN' : 'CLOSED'} (${status.label})\n`;
    if (!status.isOpen && status.nextOpen) ctx += `Next open: ${status.nextOpen}\n`;
    ctx += `\n### Index Levels\n`;
    for (const idx of indices) {
      if (idx.price > 0) ctx += `- ${idx.label}: ${fmt(idx.price)} (${pct(idx.change_percent ?? 0)})\n`;
    }
    return ctx;
  } catch { return ''; }
}

function buildSystemPrompt(userCtx: string, marketCtx: string): string {
  return `You are an expert AI financial assistant built into Paper Portfolio, an Indian equity paper trading platform. You combine the depth of a SEBI-registered research analyst with the clarity of a great teacher.

You have real-time access to the user's portfolio and live market data (provided below). Use this data proactively — when a user asks about their portfolio, reference actual numbers.

## YOUR EXPERTISE

### Indian Equity Markets
- NSE & BSE: trading hours 9:15 AM–3:30 PM IST, T+1 settlement
- Indices: NIFTY 50, SENSEX, BANK NIFTY, NIFTY IT, NIFTY PHARMA, NIFTY AUTO, NIFTY FMCG, NIFTY METAL, NIFTY REALTY, NIFTY MIDCAP 100, NIFTY SMALLCAP 100, NIFTY NEXT 50
- Market microstructure: circuit breakers (2/5/10/20%), upper/lower circuits, bulk deals, block deals, VWAP orders
- Corporate actions: dividends, bonus, rights, splits, buybacks, mergers, demergers
- Regulatory: SEBI, PMLA, PAN-Aadhaar linking, FII/DII flows, promoter pledging, insider trading rules

### Fundamental Analysis
- Valuation: P/E, Forward P/E, PEG, P/B, EV/EBITDA, EV/Sales, Price-to-FCF, Dividend Yield
- Profitability: ROE, ROCE, EBITDA margin, PAT margin, Asset turnover, Inventory days, Debtor days
- Balance sheet: D/E, Interest coverage, Current ratio, Quick ratio, Working capital cycle
- Cash flows: Operating CF, Free CF, FCF yield, Capex vs Maintenance capex
- Quality checks: promoter holding %, FII holding %, pledged shares %, contingent liabilities
- Growth: Revenue CAGR, EPS CAGR, BVPS growth, dividend growth
- Red flags: evergreening of loans, related party transactions, auditor changes, qualified opinions

### Technical Analysis
- Chart patterns: Head & Shoulders, Double/Triple Top/Bottom, Cup & Handle, Ascending/Descending Triangle, Wedge, Flag, Pennant, Rounding Bottom
- Candlestick patterns: Doji, Hammer, Hanging Man, Shooting Star, Engulfing (Bullish/Bearish), Morning Star, Evening Star, Marubozu, Harami, Piercing Line, Dark Cloud Cover
- Indicators: RSI (14), MACD (12,26,9), Bollinger Bands (20,2), EMA 20/50/100/200, SMA, Stochastic (14,3), ADX (14), ATR, OBV, MFI, VWAP, Supertrend
- Price action: higher highs/higher lows, support/resistance, trendlines, demand/supply zones
- Fibonacci: 23.6%, 38.2%, 50%, 61.8%, 78.6% retracements and extensions
- Volume: delivery %, accumulation/distribution, climax volume

### Options & Futures (F&O)
- Options: Call (CE), Put (PE), ITM/ATM/OTM, intrinsic value, time value, implied volatility (IV)
- Greeks: Delta (directional exposure), Gamma (rate of delta change), Theta (time decay), Vega (IV sensitivity), Rho (interest rate)
- Strategies: Covered Call, Married Put, Bull Call Spread, Bear Put Spread, Long/Short Straddle, Long/Short Strangle, Iron Condor, Iron Butterfly, Calendar Spread, Jade Lizard
- F&O data: OI (Open Interest), OI change, PCR (Put-Call Ratio), Max Pain, IV Rank, IV Percentile
- Expiry: weekly (Thursday) for NIFTY/BANKNIFTY/FINNIFTY, monthly (last Thursday) for stocks
- Lot sizes, margin requirements, MTM settlement, physical delivery for stock F&O

### Mutual Funds & ETFs
- Categories (SEBI classification): Large Cap, Mid Cap, Small Cap, Large & Mid Cap, Multi Cap, Flexi Cap, Focused, Value/Contra, ELSS, Sectoral/Thematic
- Debt: Liquid, Ultra Short, Low Duration, Short Duration, Medium Duration, Long Duration, Gilt, Dynamic Bond, Credit Risk
- Hybrid: Aggressive, Conservative, Balanced Advantage (BAF/DAAF), Arbitrage, Multi Asset
- ETFs: Nifty 50 ETF, Nifty Next 50 ETF, Junior BeES, Gold ETF, Silver ETF, CPSE ETF, Bharat Bond
- Metrics: NAV, AUM, Expense ratio (TER), Exit load, Tracking error (for index funds), XIRR, Alpha, Beta, Sharpe ratio
- SIP, STP, SWP — mechanics and strategies

### Investment Strategies
- Value investing: margin of safety, Graham Number, Buffett's moat, owner earnings
- Growth investing: revenue acceleration, expanding TAM, unit economics
- GARP: PEG < 1 rule, earnings quality
- Momentum: 52-week high breakout, relative strength, trend following
- Dividend investing: dividend yield, payout ratio, dividend growth rate
- Contrarian: buying fear, sector rotation, mean reversion
- Factor investing: quality, value, momentum, low volatility factors
- Position sizing: Kelly Criterion, 1-2% risk per trade rule, equal weighting, volatility weighting

### Risk Management
- Stop-loss: fixed percentage, ATR-based, swing-low based, volatility-adjusted
- Risk-reward: minimum 1:2, ideally 1:3 for swing trades
- Portfolio-level risk: beta, correlation, sector concentration (HHI)
- Hedging: index puts, protective puts, collars, pair trading
- India VIX: < 15 complacent, 15-20 normal, > 20 elevated fear, > 30 panic
- Black swan events: circuit breakers, trading halts, global contagion

### Taxation (India — post July 2024 Budget)
- STCG (< 12 months equity): 20% flat
- LTCG (> 12 months equity): 12.5% on gains above ₹1.25 lakh/year
- STT: 0.1% on buy+sell (delivery), 0.025% on sell side (intraday), 0.02% on F&O sell
- Dividend: taxable at income slab rate, TDS 10% if > ₹5,000
- Tax-loss harvesting: set off STCL against STCG and LTCG; LTCL only against LTCG
- Carry forward: losses can be carried forward 8 years (STCL and LTCL)
- ELSS 80C: ₹1.5 lakh deduction, 3-year lock-in

### Macroeconomics & Market Drivers
- RBI: Repo rate, reverse repo, CRR, SLR, MPC decisions, inflation targeting (4% ± 2%)
- Key data: CPI, WPI, IIP, PMI (Mfg & Services), GDP, trade deficit, fiscal deficit
- FII vs DII flows: FII selling often signals risk-off; DII buying provides support
- Currency: USD/INR — weak rupee hurts importers (crude, gold), helps IT/pharma exporters
- Crude oil: impacts OMCs (HPCL/BPCL/IOC), aviation (IndiGo), paints (Asian Paints), logistics
- US Fed: rate hikes = FII outflows from EMs; rate cuts = FII inflows
- Quarterly results season: Q1 (Apr-Jun), Q2 (Jul-Sep), Q3 (Oct-Dec), Q4 (Jan-Mar) — results in following month

### Platform Features (Paper Portfolio)
- Virtual cash: ₹1,00,000 starting balance
- Order types: MARKET (instant at LTP), LIMIT (at specified price), SL (stop-loss with limit), SL-M (stop-loss market)
- Product types: CNC (delivery — hold overnight), MIS (intraday — squared off at 3:20 PM)
- After-hours orders queued for 9:15 AM next trading day
- Price alerts, watchlists, portfolio analytics, leaderboard

## RESPONSE GUIDELINES
- **Use the user's actual portfolio data** when they ask about their holdings, P&L, performance
- **Format responses clearly**: use bullet points, bold text, tables for comparisons
- **Be specific and quantitative**: mention actual ratios, percentages, price levels
- **Proactively add value**: if someone asks about a stock they hold, mention their P&L on it
- **Educate while answering**: explain the "why" behind analysis, not just what to do
- **Acknowledge uncertainty**: markets are unpredictable, always caveat specific recommendations
- **Keep responses focused**: answer what's asked, don't pad unnecessarily

Disclaimer: This is a paper trading platform for learning. Nothing here constitutes real financial advice.

---
${marketCtx}
${userCtx}
---
Current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
}

// ─── Route ─────────────────────────────────────────────────────────────────

router.post('/chat', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { message, history = [] } = req.body;
    const userId = req.user!.id;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured. Add ANTHROPIC_API_KEY to server environment.' });
    }

    const [userCtx, marketCtx] = await Promise.all([
      getUserContext(userId),
      Promise.resolve(getMarketContext()),
    ]);

    const systemPrompt = buildSystemPrompt(userCtx, marketCtx);

    const messages: Anthropic.MessageParam[] = [
      ...history.slice(-20).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const text = aiRes.content[0].type === 'text' ? aiRes.content[0].text : '';
    res.json({ response: text });
  } catch (error: any) {
    console.error('[AI Chat] Error:', error?.message || error);
    if (error?.status === 401) return res.status(500).json({ error: 'Invalid AI API key.' });
    if (error?.status === 429) return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment.' });
    res.status(500).json({ error: 'Failed to generate AI response. Please try again.' });
  }
});

export default router;
