import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// ── Daily schedule: category + topic varies by day of week ────────────────
const DAILY_SCHEDULE = [
  // Sunday
  {
    category: 'strategies',
    topic: 'Weekend Strategy Review',
    prompt: `Write a detailed Indian stock market trading strategy post for the community.
Focus on a specific, actionable strategy (e.g., breakout trading, mean reversion, sector rotation, momentum, etc.).
Include:
- The core idea in plain language
- Entry/exit conditions with concrete examples using Indian stocks (NSE)
- Risk management rules (stop loss, position sizing)
- Which market conditions it works best in
- A real historical example from Indian markets

Format it as a community post — engaging, educational, conversational.
Use emojis sparingly for section headers. 2-3 paragraphs max.`,
  },
  // Monday
  {
    category: 'intraday',
    topic: 'Monday Momentum: Intraday Technique',
    prompt: `Write an intraday trading technique for Indian equity markets (NSE/BSE) for the community.
Choose one specific technique: opening range breakout, VWAP strategy, gap-and-go, first 15-min candle, or similar.
Include:
- How to identify the setup before market opens (9:00–9:15 AM analysis)
- Entry rules, target, and stop loss in specific % or points
- Best stocks/indices to apply this on (Nifty50 components, Bank Nifty, etc.)
- Common mistakes traders make with this technique
- Time of day when this works best

Write for intermediate traders. Keep it practical and specific to Indian market timings (9:15 AM–3:30 PM IST).`,
  },
  // Tuesday
  {
    category: 'fundamentals',
    topic: 'Fundamental Analysis Deep-Dive',
    prompt: `Write an educational post about fundamental analysis for Indian stock investors.
Pick ONE specific concept: P/E ratio traps, EV/EBITDA, promoter pledging risks, debt-to-equity analysis,
return on equity (ROE) screening, or how to read quarterly results.
Include:
- Clear explanation of the concept with the formula
- How Indian investors misuse/misunderstand it
- A concrete example using a real or hypothetical NSE-listed company
- What combination of metrics gives the full picture
- Red flags to watch in screener.in or NSE data

Keep it educational and accessible to investors who are learning fundamental analysis.`,
  },
  // Wednesday
  {
    category: 'strategies',
    topic: 'Mid-Week Strategy: Swing Trading Setup',
    prompt: `Write about a swing trading setup for Indian stocks (holding 2–10 days).
Focus on one of: 200 DMA pullback, RSI divergence, cup and handle, double bottom/top, or sector rotation play.
Include:
- How to scan for the pattern on NSE stocks
- The precise entry trigger (e.g., close above X-day high with volume)
- Profit targets and stop loss placement
- How many positions to hold simultaneously and sizing rules
- Example: walk through a trade from entry to exit with realistic numbers (buy at ₹X, target ₹Y, SL ₹Z)

Make it concrete — give them a playbook they can use this week.`,
  },
  // Thursday
  {
    category: 'fundamentals',
    topic: 'Sector Deep-Dive Thursday',
    prompt: `Write an analysis of one key Indian market sector today. Choose from: Banking & NBFC, IT, Pharma,
Auto, FMCG, Real Estate, Metals, Energy, or Infrastructure.
Cover:
- Key drivers for the sector (macro, RBI policy, global trends, government spending)
- Top 3 stocks in the sector and what makes them interesting
- Key ratios that matter specifically for this sector
- Current tailwinds and headwinds for the next 6–12 months
- How to get exposure: direct stocks, sector ETFs, or index funds

Make it insightful and based on broadly known public information about Indian markets.`,
  },
  // Friday
  {
    category: 'market',
    topic: 'Friday Market Insights & Weekend Prep',
    prompt: `Write a Friday market insights post for Indian traders to prepare for next week.
Include:
- Key themes/levels to watch on Nifty 50 and Bank Nifty (use general technical concepts, not specific predictions)
- FII/DII flow interpretation and what it means for markets
- Any important events next week: RBI meetings, budget dates, results season, global cues (Fed, crude oil)
- One options strategy suitable for weekend theta decay (e.g., short straddle, iron condor on indices)
- Stocks on watchlist based on technical patterns

Frame this as preparation guidance, not predictions. Emphasize managing risk over the weekend.`,
  },
  // Saturday
  {
    category: 'beginners',
    topic: 'Saturday School: Basics for New Traders',
    prompt: `Write an educational post for beginner traders/investors in Indian stock markets.
Pick one foundational concept: how orders work (market vs limit vs SL), understanding circuit limits,
reading a candlestick chart, how F&O settlement works, what SEBI margin rules mean,
how to read an earnings report, or what moving averages tell you.
Include:
- Simple explanation with a real-world analogy
- Step-by-step breakdown
- Common beginner mistakes with this concept
- One practical exercise they can do on Paper Portfolio right now
- Further reading or concepts to learn next

Write at a Class 10 level — clear, encouraging, no jargon without explanation.`,
  },
];

// ── Get or create the community bot user ──────────────────────────────────
function getBotUserId(): number {
  const existing = db.prepare(`SELECT id FROM users WHERE email = 'communitybot@paperportfolio.app'`).get() as any;
  if (existing) return existing.id;

  // Bot never logs in: a non-bcrypt password string can't match any login.
  // role must satisfy CHECK(role IN ('user','admin')).
  const result = db.prepare(`
    INSERT INTO users (name, email, password, balance, role)
    VALUES ('PaperBot', 'communitybot@paperportfolio.app', 'bot-no-login', 0, 'user')
  `).run();
  return result.lastInsertRowid as number;
}

// ── Generate + post one strategy ──────────────────────────────────────────
export async function postDailyStrategy() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[communityBot] ANTHROPIC_API_KEY not set — skipping daily post');
    return;
  }

  try {
    const day = new Date().getDay(); // 0 = Sunday, 6 = Saturday
    const schedule = DAILY_SCHEDULE[day];
    const botUserId = getBotUserId();

    console.log(`[communityBot] Generating daily post: "${schedule.topic}" (${schedule.category})`);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: `You are PaperBot, the official community assistant for Paper Portfolio — an Indian stock market paper trading platform.
You write daily educational posts to help traders learn.
Write in a friendly, knowledgeable tone. Use real Indian market examples (NSE/BSE stocks, Nifty, Sensex).
Always add a disclaimer at the end: "📌 Paper Portfolio is for learning only — not financial advice."
Keep posts focused, practical, and under 600 words.`,
      messages: [{ role: 'user', content: schedule.prompt }],
    });

    const body = (response.content[0] as any).text as string;

    db.prepare(`
      INSERT INTO community_posts (user_id, title, body, category)
      VALUES (?, ?, ?, ?)
    `).run(botUserId, schedule.topic, body, schedule.category);

    console.log(`[communityBot] Posted: "${schedule.topic}"`);
  } catch (err: any) {
    console.error('[communityBot] Failed to post daily strategy:', err?.message || err);
  }
}

// ── Seed initial posts if community is empty ──────────────────────────────
export async function seedCommunityIfEmpty() {
  const count = (db.prepare('SELECT COUNT(*) as n FROM community_posts').get() as any).n;
  if (count > 0) return;

  console.log('[communityBot] Community is empty — seeding with initial posts...');

  const SEED_POSTS = [
    {
      category: 'beginners',
      title: '👋 Welcome to the Paper Portfolio Community!',
      body: `Welcome traders! This is your space to discuss stocks, share strategies, learn from each other, and grow together.\n\nHere's how to make the most of this community:\n\n📈 **Market Analysis** — Share your views on Nifty, Bank Nifty, and individual stocks\n💡 **Strategies** — Post your trading setups and get feedback\n⚡ **Intraday** — Discuss day trading setups and real-time market action\n🔰 **Beginners** — No question is too basic here — we all started somewhere\n🏆 **Trades & Wins** — Share your paper trading wins (and losses — we learn more from those!)\n\nRemember: Paper Portfolio is a safe space to learn and practice. The virtual money means you can try strategies risk-free before applying them in real markets.\n\n📌 Paper Portfolio is for learning only — not financial advice.`,
    },
    {
      category: 'strategies',
      title: '📊 The 200 DMA Strategy — India\'s Most Reliable Long-Term Signal',
      body: `The 200-day Moving Average (200 DMA) is arguably the most watched technical level by institutional traders in Indian markets.\n\n**The Core Idea:**\nWhen a stock is above its 200 DMA, it's in a long-term uptrend. Below it — downtrend. Simple, but powerful.\n\n**How to use it on NSE:**\n1. Open any stock on TradingView or NSE website\n2. Add the 200 DMA indicator\n3. Look for stocks that have recently crossed ABOVE the 200 DMA on high volume — that's your entry signal\n\n**Real Example:**\nReliance Industries crossing above its 200 DMA in early 2023 marked the start of a significant rally from ~₹2,200 to ₹2,800+.\n\n**Entry/Exit Rules:**\n- Entry: Close above 200 DMA with volume 1.5x the 20-day average\n- Stop Loss: Close below 200 DMA\n- Target: Measure previous swing high, or 15-20% from entry\n\n**Caution:** 200 DMA crossovers in sideways markets create false signals. Always check the broader Nifty trend first.\n\nTry this on Paper Portfolio today — find 3 stocks trading near their 200 DMA and set price alerts!\n\n📌 Paper Portfolio is for learning only — not financial advice.`,
    },
    {
      category: 'intraday',
      title: '⚡ Opening Range Breakout (ORB) — The Most Popular Intraday Setup in India',
      body: `The Opening Range Breakout is used by thousands of intraday traders in India every day. Here's the complete playbook:\n\n**What is ORB?**\nThe "opening range" is the high and low formed in the first 15 minutes of trading (9:15–9:30 AM IST).\n\n**The Setup:**\n1. Note the high and low of the first 15-min candle\n2. Wait for price to break ABOVE the high with strong volume → BUY\n3. Or break BELOW the low → SHORT (if you're using F&O)\n\n**Best Stocks for ORB:**\n- Bank Nifty components (ICICI Bank, HDFC Bank, Axis Bank) — high liquidity\n- Nifty 50 stocks with high beta\n- Avoid stocks with pending news/results that day\n\n**Risk Management:**\n- Stop Loss: Below the opening range low (for long trades)\n- Target: 1.5x to 2x your risk\n- Max loss per trade: 1% of your total capital\n\n**Why it works:**\nThe first 15 minutes sees the most volume as overnight positions get squared off and institutional orders hit the market. A clean breakout of this range signals the day's direction.\n\nPractice this on Paper Portfolio tomorrow morning — set your alarms for 9:15 AM!\n\n📌 Paper Portfolio is for learning only — not financial advice.`,
    },
    {
      category: 'fundamentals',
      title: '📊 How to Read Quarterly Results Like a Pro',
      body: `Every 3 months, Indian companies declare their quarterly results. Here's how to read them without getting lost in the numbers:\n\n**The 5 Numbers That Matter Most:**\n\n1. **Revenue Growth (YoY)** — Is the business growing? Compare to same quarter last year. Look for consistent 15%+ growth in quality companies.\n\n2. **EBITDA Margin** — Operational efficiency. If revenue grows but margins are shrinking, something's wrong (rising costs, pricing pressure).\n\n3. **PAT (Profit After Tax)** — The bottom line. But check if it includes one-time gains (selling an asset) — strip those out.\n\n4. **Debt Level** — Check if debt is increasing quarter-on-quarter. Growing debt in a slowdown = red flag.\n\n5. **Management Commentary** — The most underrated part. What did the CEO say about demand, competition, and next quarter?\n\n**Where to find results:**\n- NSE website → Company filings\n- BSE → Announcements section\n- Screener.in — Beautifully formatted historical data\n\n**Pro tip:** Don't just look at one quarter. Look at the last 8–12 quarters for the trend. A single bad quarter in an otherwise strong company can be a buying opportunity.\n\n📌 Paper Portfolio is for learning only — not financial advice.`,
    },
    {
      category: 'market',
      title: '🏦 Understanding FII vs DII Flows — And Why It Matters',
      body: `One of the most important macro indicators for Indian markets is FII (Foreign Institutional Investor) vs DII (Domestic Institutional Investor) flows. Here's your complete guide:\n\n**Who are FIIs?**\nForeign funds — like US hedge funds, pension funds, sovereign wealth funds — investing in Indian equities. When they buy, Nifty usually goes up. When they sell aggressively, we see sharp corrections.\n\n**Who are DIIs?**\nDomestic mutual funds, insurance companies (LIC), and provident funds. Indian retail investors indirectly become DIIs through their SIPs.\n\n**The Key Insight:**\nFII and DII often move in opposite directions. When FIIs sell, DIIs typically absorb the supply (especially during corrections). This is why Indian markets have become more resilient since 2020 — domestic SIP inflows now exceed ₹20,000 crore per month!\n\n**How to track it:**\n- NSE India website → Market Data → FII/DII data (published daily after market close)\n- Look for 5-day rolling data, not just single days\n\n**Rule of thumb:**\n- 3+ consecutive days of FII buying → Bullish signal\n- 5+ days of FII selling → Start being cautious\n- But if DIIs are buying heavily → Nifty may hold support\n\n📌 Paper Portfolio is for learning only — not financial advice.`,
    },
  ];

  const botUserId = getBotUserId();
  for (const post of SEED_POSTS) {
    db.prepare(`INSERT INTO community_posts (user_id, title, body, category) VALUES (?, ?, ?, ?)`)
      .run(botUserId, post.title, post.body, post.category);
  }
  console.log(`[communityBot] Seeded ${SEED_POSTS.length} initial posts`);
}
