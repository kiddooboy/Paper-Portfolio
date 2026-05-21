// ── Paper Portfolio Academy — curriculum content ───────────────────────────
// A sequential, interactive course on equity, trading terminology, analysis,
// risk, strategies, psychology and derivatives. Each module has lessons
// (content blocks) followed by an MCQ quiz with explanations.

export type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'warn'; text: string }
  | { type: 'term'; term: string; def: string };

export interface Lesson { title: string; blocks: Block[] }
export interface QuizQuestion { q: string; options: string[]; answer: number; explain: string }
export interface Module {
  id: string;
  title: string;
  icon: string;          // lucide icon key (mapped in the page)
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  minutes: number;
  lessons: Lesson[];
  quiz: QuizQuestion[];
}

export const PASS_PCT = 0.7; // need 70% to pass a module

export const MODULES: Module[] = [
  // 1 ──────────────────────────────────────────────────────────────────────
  {
    id: 'equity-foundations',
    title: 'Equity Foundations',
    icon: 'BookOpen',
    level: 'Beginner',
    summary: 'What stocks are, how ownership works, exchanges, demat and indices.',
    minutes: 8,
    lessons: [
      {
        title: 'What is a stock?',
        blocks: [
          { type: 'p', text: 'A stock (or share) represents a unit of ownership in a company. When you buy one share of a company, you own a tiny fraction of that business — its assets, and a claim on its future profits.' },
          { type: 'term', term: 'Equity', def: 'The ownership value in a company held by its shareholders. "Buying equity" means buying shares.' },
          { type: 'p', text: 'Companies issue shares to raise money. In return, shareholders hope the company grows so the shares become more valuable, and may receive a portion of profits called dividends.' },
          { type: 'tip', text: 'Owning a stock is owning a slice of a real business — not just a ticker that moves up and down.' },
        ],
      },
      {
        title: 'Why share prices move',
        blocks: [
          { type: 'p', text: 'A share price is simply the latest price at which a buyer and a seller agreed to trade. It changes constantly as supply and demand shift.' },
          { type: 'list', items: [
            'More buyers than sellers → price rises.',
            'More sellers than buyers → price falls.',
            'Demand is driven by earnings, news, sentiment, interest rates and the economy.',
          ] },
          { type: 'p', text: 'Over the long run, prices tend to follow a company’s earnings and growth. Over the short run, they swing on emotion and news.' },
        ],
      },
      {
        title: 'Exchanges, demat & indices',
        blocks: [
          { type: 'p', text: 'In India, shares trade on two main exchanges: the NSE (National Stock Exchange) and the BSE (Bombay Stock Exchange). Shares are held electronically in a demat account.' },
          { type: 'term', term: 'Index', def: 'A basket of stocks that represents a market or segment. The NIFTY 50 tracks 50 large companies; the SENSEX tracks 30.' },
          { type: 'list', items: [
            'NIFTY 50 — 50 of the largest NSE-listed companies.',
            'SENSEX — 30 large companies on the BSE.',
            'BANK NIFTY — the major banking stocks.',
          ] },
          { type: 'p', text: 'Companies are grouped by size: large-cap (biggest, most stable), mid-cap, and small-cap (smaller, more volatile, higher growth potential).' },
        ],
      },
    ],
    quiz: [
      { q: 'What does owning a share of a company represent?', options: ['A loan to the company', 'A unit of ownership in the company', 'A guaranteed fixed return', 'A government bond'], answer: 1, explain: 'A share is a unit of ownership (equity) — you own a fraction of the business.' },
      { q: 'In the short term, what primarily moves a stock’s price?', options: ['Supply and demand', 'The company’s registration number', 'The colour of its logo', 'The CEO’s age'], answer: 0, explain: 'Price is set by buyers and sellers — i.e. supply and demand at that moment.' },
      { q: 'Which index tracks 50 of the largest NSE companies?', options: ['SENSEX', 'BANK NIFTY', 'NIFTY 50', 'DOW JONES'], answer: 2, explain: 'The NIFTY 50 is the benchmark index of 50 large NSE-listed companies.' },
      { q: 'A "large-cap" stock is generally…', options: ['A small, volatile company', 'One of the biggest, most established companies', 'A company that just IPO’d', 'A delisted company'], answer: 1, explain: 'Large-caps are the biggest, typically most stable companies.' },
    ],
  },

  // 2 ──────────────────────────────────────────────────────────────────────
  {
    id: 'market-mechanics',
    title: 'Market Mechanics',
    icon: 'Activity',
    level: 'Beginner',
    summary: 'Bid/ask, the order book, liquidity, circuits, settlement and trading hours.',
    minutes: 9,
    lessons: [
      {
        title: 'Bid, ask & the spread',
        blocks: [
          { type: 'term', term: 'Bid', def: 'The highest price a buyer is currently willing to pay.' },
          { type: 'term', term: 'Ask (Offer)', def: 'The lowest price a seller is currently willing to accept.' },
          { type: 'p', text: 'The gap between them is the spread. Highly traded stocks have a tiny spread; thinly traded ones have a wide spread.' },
          { type: 'term', term: 'LTP', def: 'Last Traded Price — the price of the most recent executed trade.' },
        ],
      },
      {
        title: 'The order book & liquidity',
        blocks: [
          { type: 'p', text: 'The order book (market depth) lists pending buy and sell orders at each price level. It shows how much demand and supply sits around the current price.' },
          { type: 'term', term: 'Liquidity', def: 'How easily you can buy/sell without moving the price. High volume = high liquidity.' },
          { type: 'tip', text: 'Trade liquid stocks when starting out — your orders fill instantly and close to the displayed price.' },
        ],
      },
      {
        title: 'Circuits, settlement & hours',
        blocks: [
          { type: 'p', text: 'Indian equity markets are open 9:15 AM to 3:30 PM IST, Monday to Friday (excluding holidays).' },
          { type: 'term', term: 'Circuit limit', def: 'A maximum % a stock can move in a day (e.g. 5/10/20%) before trading is paused, to curb extreme volatility.' },
          { type: 'term', term: 'T+1 settlement', def: 'Shares and money settle one business day after the trade. India moved to T+1 to speed up settlement.' },
        ],
      },
    ],
    quiz: [
      { q: 'The "bid" price is…', options: ['The lowest a seller will accept', 'The highest a buyer will pay', 'The closing price', 'A broker fee'], answer: 1, explain: 'The bid is the highest price a buyer is currently willing to pay.' },
      { q: 'What does LTP stand for?', options: ['Lowest Trade Price', 'Last Traded Price', 'Long Term Position', 'Limit Trigger Price'], answer: 1, explain: 'LTP = Last Traded Price, the most recent executed trade price.' },
      { q: 'High liquidity means…', options: ['You can buy/sell easily without moving the price much', 'The stock is guaranteed to rise', 'The company pays high dividends', 'The stock is illegal to trade'], answer: 0, explain: 'Liquidity is the ease of trading without significant price impact.' },
      { q: 'Indian equity markets are open…', options: ['24 hours', '9:15 AM – 3:30 PM IST on weekdays', 'Only on weekends', '6 AM – 6 PM IST daily'], answer: 1, explain: 'Regular trading runs 9:15 AM to 3:30 PM IST, Monday–Friday.' },
      { q: 'A circuit limit exists to…', options: ['Increase broker profits', 'Pause trading after extreme price moves', 'Guarantee returns', 'Set dividend amounts'], answer: 1, explain: 'Circuit limits curb extreme volatility by halting trading beyond a daily % move.' },
    ],
  },

  // 3 ──────────────────────────────────────────────────────────────────────
  {
    id: 'trading-terms',
    title: 'Essential Trading Terms',
    icon: 'BookMarked',
    level: 'Beginner',
    summary: 'OHLC, volume, 52-week range, P/E, EPS, dividends, bull/bear, long/short.',
    minutes: 8,
    lessons: [
      {
        title: 'Price & volume terms',
        blocks: [
          { type: 'term', term: 'OHLC', def: 'Open, High, Low, Close — the four key prices of a period (day/candle).' },
          { type: 'term', term: 'Volume', def: 'The number of shares traded in a period. High volume confirms conviction behind a move.' },
          { type: 'term', term: '52-week High/Low', def: 'The highest and lowest price over the past year — a quick gauge of where the price sits in its range.' },
        ],
      },
      {
        title: 'Valuation terms',
        blocks: [
          { type: 'term', term: 'EPS', def: 'Earnings Per Share — net profit divided by number of shares. Higher is generally better.' },
          { type: 'term', term: 'P/E ratio', def: 'Price ÷ EPS. How many rupees you pay per rupee of annual earnings. A rough valuation gauge.' },
          { type: 'term', term: 'Dividend', def: 'A share of profit paid to shareholders, usually in cash.' },
          { type: 'term', term: 'Market cap', def: 'Share price × number of shares = the total value of the company.' },
        ],
      },
      {
        title: 'Direction & position terms',
        blocks: [
          { type: 'term', term: 'Bull market', def: 'A rising market; "bullish" = expecting prices to go up.' },
          { type: 'term', term: 'Bear market', def: 'A falling market; "bearish" = expecting prices to go down.' },
          { type: 'term', term: 'Long', def: 'Buying expecting the price to rise.' },
          { type: 'term', term: 'Short', def: 'Selling first (borrowed shares) expecting to buy back lower — profiting from a fall.' },
        ],
      },
    ],
    quiz: [
      { q: 'OHLC stands for…', options: ['Order, Hold, Limit, Cancel', 'Open, High, Low, Close', 'Output, High, Long, Cap', 'Overnight Holding Loss Calculation'], answer: 1, explain: 'OHLC = Open, High, Low, Close — the four key prices of a period.' },
      { q: 'The P/E ratio is calculated as…', options: ['Profit ÷ Expenses', 'Price ÷ EPS', 'Price × Earnings', 'P&L ÷ Equity'], answer: 1, explain: 'P/E = Price per share ÷ Earnings per share.' },
      { q: 'Going "short" means…', options: ['Buying to hold long term', 'Selling first, expecting to buy back lower', 'Buying small quantities', 'A short trading session'], answer: 1, explain: 'Shorting profits from a price fall — sell high first, buy back lower.' },
      { q: 'Market capitalisation equals…', options: ['Share price × number of shares', 'Revenue − costs', 'EPS × P/E only', 'Dividends × shares'], answer: 0, explain: 'Market cap = share price × total shares outstanding.' },
      { q: 'A "bullish" view means you expect prices to…', options: ['Fall', 'Rise', 'Stay flat forever', 'Get delisted'], answer: 1, explain: 'Bullish = expecting prices to rise.' },
    ],
  },

  // 4 ──────────────────────────────────────────────────────────────────────
  {
    id: 'order-types',
    title: 'Order Types & Execution',
    icon: 'ListOrdered',
    level: 'Beginner',
    summary: 'Market, limit, SL/SL-M, GTT, AMO orders and CNC vs MIS products.',
    minutes: 10,
    lessons: [
      {
        title: 'Market vs Limit orders',
        blocks: [
          { type: 'term', term: 'Market order', def: 'Buy/sell immediately at the best available price. Fast, but you don’t control the exact price.' },
          { type: 'term', term: 'Limit order', def: 'Buy/sell only at a specified price or better. You control price, but it may not fill.' },
          { type: 'tip', text: 'Use limit orders in volatile or illiquid stocks to avoid nasty fills.' },
        ],
      },
      {
        title: 'Stop-loss orders',
        blocks: [
          { type: 'term', term: 'SL (Stop-Loss Limit)', def: 'Triggers a limit order once a trigger price is hit — caps your loss with price control.' },
          { type: 'term', term: 'SL-M (Stop-Loss Market)', def: 'Triggers a market order at the trigger price — guarantees exit, not price.' },
          { type: 'warn', text: 'A stop-loss is your seatbelt. Decide your exit before you enter the trade.' },
        ],
      },
      {
        title: 'GTT, AMO & product types',
        blocks: [
          { type: 'term', term: 'GTT', def: 'Good-Till-Triggered — a resting order that waits (up to a year) until your price condition is met.' },
          { type: 'term', term: 'AMO', def: 'After-Market Order — placed when markets are closed; queued for the next open.' },
          { type: 'term', term: 'CNC', def: 'Cash & Carry — delivery; you hold shares with no auto square-off.' },
          { type: 'term', term: 'MIS', def: 'Margin Intraday Square-off — leveraged intraday; auto-closed by ~3:20 PM the same day.' },
        ],
      },
    ],
    quiz: [
      { q: 'A market order…', options: ['Fills only at a set price', 'Fills immediately at the best available price', 'Never fills', 'Is only for indices'], answer: 1, explain: 'Market orders execute immediately at the best available price.' },
      { q: 'You want to cap your downside if a stock falls to ₹95. You should use…', options: ['A buy market order', 'A stop-loss order', 'A dividend order', 'An AMO only'], answer: 1, explain: 'A stop-loss (SL/SL-M) triggers an exit at your defined level.' },
      { q: 'MIS positions are…', options: ['Held forever', 'Auto squared-off the same day (~3:20 PM)', 'Settled in T+10', 'Only for mutual funds'], answer: 1, explain: 'MIS is intraday — open positions are auto square-off the same day.' },
      { q: 'A GTT order…', options: ['Expires in 1 minute', 'Waits until your price condition triggers (up to a year)', 'Is a market order', 'Can only be a buy'], answer: 1, explain: 'GTT rests until the trigger condition is met, within its validity (up to ~1 year).' },
      { q: 'CNC product type means…', options: ['Intraday leverage', 'Delivery — you hold the shares', 'Cancelled order', 'A type of index'], answer: 1, explain: 'CNC = Cash & Carry (delivery) — no auto square-off.' },
    ],
  },

  // 5 ──────────────────────────────────────────────────────────────────────
  {
    id: 'fundamental-analysis',
    title: 'Fundamental Analysis',
    icon: 'Calculator',
    level: 'Intermediate',
    summary: 'Reading financials and judging a company’s value with P/E, ROE, debt.',
    minutes: 11,
    lessons: [
      {
        title: 'What fundamentals tell you',
        blocks: [
          { type: 'p', text: 'Fundamental analysis estimates a company’s intrinsic value by studying its business and financials, then compares that to the market price.' },
          { type: 'list', items: [
            'Revenue — total sales. Is it growing?',
            'Net profit — what’s left after all costs.',
            'Margins — profit as a % of revenue; higher = more efficient.',
          ] },
        ],
      },
      {
        title: 'Key ratios',
        blocks: [
          { type: 'term', term: 'P/E', def: 'Valuation vs earnings. Compare against peers and the company’s own history.' },
          { type: 'term', term: 'P/B', def: 'Price-to-Book — price vs net asset value. Useful for banks and asset-heavy firms.' },
          { type: 'term', term: 'ROE', def: 'Return on Equity — profit generated per rupee of shareholder capital. Higher = better quality.' },
          { type: 'term', term: 'Debt-to-Equity', def: 'How much the company borrows vs its own capital. High debt adds risk.' },
        ],
      },
      {
        title: 'Putting it together',
        blocks: [
          { type: 'p', text: 'A great business has growing revenue, healthy margins, high ROE, manageable debt — bought at a reasonable valuation.' },
          { type: 'tip', text: 'A cheap P/E isn’t always good and a high P/E isn’t always bad — context (growth, quality) matters.' },
          { type: 'warn', text: 'Never judge a company on one number. Look at trends over several years.' },
        ],
      },
    ],
    quiz: [
      { q: 'ROE measures…', options: ['Revenue growth only', 'Profit generated per rupee of shareholder equity', 'Total debt', 'Dividend yield'], answer: 1, explain: 'Return on Equity = net profit ÷ shareholder equity — a quality measure.' },
      { q: 'A high Debt-to-Equity ratio generally means…', options: ['Lower risk', 'Higher financial risk', 'Guaranteed growth', 'No dividends ever'], answer: 1, explain: 'More borrowing relative to own capital raises financial risk.' },
      { q: 'Fundamental analysis tries to estimate a company’s…', options: ['Chart pattern', 'Intrinsic value vs market price', 'Daily volume only', 'Ticker symbol'], answer: 1, explain: 'It estimates intrinsic value from the business and financials.' },
      { q: 'Which is the best practice when reading financials?', options: ['Use one quarter only', 'Look at multi-year trends', 'Ignore debt', 'Only read the share price'], answer: 1, explain: 'Trends over several years reveal the real trajectory.' },
    ],
  },

  // 6 ──────────────────────────────────────────────────────────────────────
  {
    id: 'technical-analysis',
    title: 'Technical Analysis',
    icon: 'LineChart',
    level: 'Intermediate',
    summary: 'Candlesticks, trends, support/resistance, moving averages, RSI & MACD.',
    minutes: 12,
    lessons: [
      {
        title: 'Candlesticks & trends',
        blocks: [
          { type: 'p', text: 'A candlestick shows the open, high, low and close for a period. Green = close above open; red = close below open.' },
          { type: 'term', term: 'Trend', def: 'The general direction of price. Uptrend = higher highs & higher lows; downtrend = lower highs & lower lows.' },
          { type: 'tip', text: '"The trend is your friend" — trading with the trend has better odds than fighting it.' },
        ],
      },
      {
        title: 'Support & resistance',
        blocks: [
          { type: 'term', term: 'Support', def: 'A price level where buying tends to appear and halt a fall.' },
          { type: 'term', term: 'Resistance', def: 'A price level where selling tends to appear and cap a rise.' },
          { type: 'p', text: 'When price breaks decisively above resistance or below support, that level often flips role (a "breakout").' },
        ],
      },
      {
        title: 'Indicators',
        blocks: [
          { type: 'term', term: 'Moving Average (MA/EMA)', def: 'The average price over N periods, smoothing noise to reveal trend direction.' },
          { type: 'term', term: 'RSI', def: 'Relative Strength Index (0–100). Above 70 = potentially overbought; below 30 = potentially oversold.' },
          { type: 'term', term: 'MACD', def: 'Tracks momentum via the difference between two EMAs and a signal line.' },
          { type: 'warn', text: 'Indicators are tools, not crystal balls. Combine them with price action and context.' },
        ],
      },
    ],
    quiz: [
      { q: 'A green candlestick usually means…', options: ['Close was below open', 'Close was above open', 'No trades happened', 'The market is closed'], answer: 1, explain: 'Green/up candles close above their open.' },
      { q: 'An RSI above 70 suggests the stock may be…', options: ['Oversold', 'Overbought', 'Delisted', 'A dividend payer'], answer: 1, explain: 'RSI > 70 is the classic "overbought" zone (caution, not a guarantee).' },
      { q: 'Support is a level where…', options: ['Selling caps the price', 'Buying tends to halt a fall', 'Trading stops', 'Dividends are paid'], answer: 1, explain: 'Support is where buyers tend to step in and halt declines.' },
      { q: 'A moving average is used to…', options: ['Smooth price and reveal trend', 'Calculate dividends', 'Set circuit limits', 'Measure market cap'], answer: 0, explain: 'MAs smooth out noise to show the underlying trend direction.' },
      { q: '"The trend is your friend" advises you to…', options: ['Always short', 'Trade in the direction of the prevailing trend', 'Avoid all trends', 'Only buy at 52-week highs'], answer: 1, explain: 'Trading with the trend generally has better odds than fighting it.' },
    ],
  },

  // 7 ──────────────────────────────────────────────────────────────────────
  {
    id: 'risk-management',
    title: 'Risk Management',
    icon: 'ShieldCheck',
    level: 'Intermediate',
    summary: 'Position sizing, stop-losses, risk/reward, and diversification.',
    minutes: 10,
    lessons: [
      {
        title: 'Why risk comes first',
        blocks: [
          { type: 'p', text: 'Professionals obsess over risk before reward. Protecting capital keeps you in the game long enough for your edge to play out.' },
          { type: 'warn', text: 'A 50% loss needs a 100% gain just to break even. Avoid big losses.' },
        ],
      },
      {
        title: 'Position sizing & the 1–2% rule',
        blocks: [
          { type: 'term', term: 'Position sizing', def: 'Deciding how much to put into a single trade based on your risk per trade.' },
          { type: 'p', text: 'A common rule: risk no more than 1–2% of your capital on any single trade. If a trade hits your stop, you lose only that small slice.' },
          { type: 'tip', text: 'Position size = (capital × risk%) ÷ (entry − stop-loss). Bigger stop → smaller position.' },
        ],
      },
      {
        title: 'Risk/reward & diversification',
        blocks: [
          { type: 'term', term: 'Risk/Reward', def: 'Potential loss vs potential gain. A 1:2 ratio means risking ₹1 to make ₹2.' },
          { type: 'term', term: 'Diversification', def: 'Spreading capital across stocks/sectors so one bad bet can’t sink the portfolio.' },
          { type: 'warn', text: 'Avoid putting more than ~25% in one stock or ~30% in one sector — concentration cuts both ways.' },
        ],
      },
    ],
    quiz: [
      { q: 'The common "risk per trade" rule of thumb is…', options: ['Risk 50% of capital', 'Risk 1–2% of capital', 'Risk 100% for big wins', 'Never use stops'], answer: 1, explain: 'Risking 1–2% per trade keeps any single loss small and survivable.' },
      { q: 'A 1:3 risk/reward ratio means…', options: ['Risk ₹3 to make ₹1', 'Risk ₹1 to make ₹3', 'No risk at all', 'Guaranteed 3% return'], answer: 1, explain: 'Risk/reward 1:3 = risking 1 unit to potentially gain 3.' },
      { q: 'After a 50% loss, the gain needed to break even is…', options: ['50%', '75%', '100%', '25%'], answer: 2, explain: 'Halving capital requires a 100% gain to recover — why big losses are deadly.' },
      { q: 'Diversification helps by…', options: ['Guaranteeing profits', 'Spreading risk across positions', 'Increasing leverage', 'Removing all risk'], answer: 1, explain: 'It spreads risk so one bad position can’t sink the whole portfolio.' },
    ],
  },

  // 8 ──────────────────────────────────────────────────────────────────────
  {
    id: 'strategies',
    title: 'Trading Strategies',
    icon: 'Target',
    level: 'Advanced',
    summary: 'Intraday, swing, positional, value, momentum, breakout & mean reversion.',
    minutes: 12,
    lessons: [
      {
        title: 'Time horizons',
        blocks: [
          { type: 'term', term: 'Intraday', def: 'Open and close within the same day. Fast, requires attention and discipline.' },
          { type: 'term', term: 'Swing trading', def: 'Holding days to weeks to capture a "swing" in price.' },
          { type: 'term', term: 'Positional / Investing', def: 'Holding weeks to years, based on trends or fundamentals.' },
        ],
      },
      {
        title: 'Style-based strategies',
        blocks: [
          { type: 'term', term: 'Value investing', def: 'Buying solid companies trading below their intrinsic worth, and waiting.' },
          { type: 'term', term: 'Momentum', def: 'Buying what’s already strong, betting strength persists.' },
          { type: 'term', term: 'Breakout', def: 'Entering when price breaks above resistance (or below support) on strong volume.' },
          { type: 'term', term: 'Mean reversion', def: 'Betting that an over-extended price snaps back to its average.' },
        ],
      },
      {
        title: 'Building your edge',
        blocks: [
          { type: 'p', text: 'A strategy needs clear rules: what to buy, when to enter, where to exit (target and stop), and how much to size.' },
          { type: 'tip', text: 'Backtest and paper-trade a strategy before risking real money — exactly what this platform is for.' },
          { type: 'warn', text: 'No strategy wins every time. Consistency and risk control beat occasional big wins.' },
        ],
      },
    ],
    quiz: [
      { q: 'Swing trading typically holds positions for…', options: ['Seconds', 'Days to weeks', 'A decade', 'Only intraday'], answer: 1, explain: 'Swing trades capture moves over days to weeks.' },
      { q: 'A breakout strategy enters when…', options: ['Price breaks a key level on strong volume', 'A dividend is announced', 'The market closes', 'RSI is exactly 50'], answer: 0, explain: 'Breakout traders enter as price clears support/resistance with volume.' },
      { q: 'Value investing focuses on…', options: ['Buying the strongest momentum', 'Buying good companies below intrinsic value', 'Day-trading indices', 'Avoiding all research'], answer: 1, explain: 'Value investing buys quality businesses trading below fair value.' },
      { q: 'Mean reversion bets that…', options: ['Trends last forever', 'Over-extended prices snap back to average', 'Volume is irrelevant', 'Prices never change'], answer: 1, explain: 'Mean reversion expects stretched prices to revert to their average.' },
      { q: 'The most important thing a strategy needs is…', options: ['A lucky charm', 'Clear rules for entry, exit and sizing', 'Maximum leverage', 'Trading every minute'], answer: 1, explain: 'Defined rules for entry, exit and position size create a repeatable edge.' },
    ],
  },

  // 9 ──────────────────────────────────────────────────────────────────────
  {
    id: 'psychology',
    title: 'Trading Psychology & Ideologies',
    icon: 'Brain',
    level: 'Advanced',
    summary: 'Fear, greed, discipline, biases, and the great investing philosophies.',
    minutes: 10,
    lessons: [
      {
        title: 'Fear & greed',
        blocks: [
          { type: 'p', text: 'Markets are driven by two emotions: fear (selling in panic) and greed (chasing rallies). Mastering them is half the battle.' },
          { type: 'warn', text: 'FOMO (fear of missing out) makes you buy tops; panic makes you sell bottoms. Recognise both.' },
        ],
      },
      {
        title: 'Common biases',
        blocks: [
          { type: 'term', term: 'Loss aversion', def: 'We feel losses about twice as strongly as equivalent gains — leading us to hold losers too long.' },
          { type: 'term', term: 'Confirmation bias', def: 'Seeking only information that supports what we already believe.' },
          { type: 'term', term: 'Recency bias', def: 'Over-weighting the most recent events when judging the future.' },
          { type: 'tip', text: 'A written trading plan and journal are the best antidotes to emotional decisions.' },
        ],
      },
      {
        title: 'Investing philosophies',
        blocks: [
          { type: 'list', items: [
            'Value (Buffett/Graham): buy wonderful businesses at fair prices, hold long.',
            'Growth: pay up for fast-growing companies with big futures.',
            'Technical/Trend: follow price and momentum, ignore stories.',
            'Passive/Index: own the whole market cheaply and stay invested.',
          ] },
          { type: 'p', text: 'There’s no single "right" ideology — the best one is the one you can follow with discipline.' },
        ],
      },
    ],
    quiz: [
      { q: 'FOMO most often causes traders to…', options: ['Buy near tops', 'Sell early for profit', 'Avoid the market', 'Diversify well'], answer: 0, explain: 'Fear of missing out drives chasing rallies — buying near tops.' },
      { q: 'Loss aversion describes…', options: ['Loving losses', 'Feeling losses more strongly than equal gains', 'Never losing', 'Avoiding all trades'], answer: 1, explain: 'Losses hurt roughly twice as much as equivalent gains feel good.' },
      { q: 'Value investing (Buffett/Graham) means…', options: ['Chasing momentum', 'Buying good businesses at fair prices for the long run', 'Day trading options', 'Only buying IPOs'], answer: 1, explain: 'Value investing buys quality at sensible prices and holds.' },
      { q: 'The best antidote to emotional trading is…', options: ['Trading on tips', 'A written plan and a journal', 'More leverage', 'Watching prices every second'], answer: 1, explain: 'A plan and journal keep decisions rule-based, not emotional.' },
    ],
  },

  // 10 ─────────────────────────────────────────────────────────────────────
  {
    id: 'derivatives',
    title: 'Derivatives (F&O) Basics',
    icon: 'Layers',
    level: 'Advanced',
    summary: 'Futures, options, calls/puts, premium, strike, expiry, leverage & hedging.',
    minutes: 12,
    lessons: [
      {
        title: 'What are derivatives?',
        blocks: [
          { type: 'term', term: 'Derivative', def: 'A contract whose value derives from an underlying asset (a stock or index).' },
          { type: 'term', term: 'Future', def: 'An agreement to buy/sell the underlying at a set price on a future date. Both sides are obligated.' },
          { type: 'p', text: 'Derivatives trade in fixed lot sizes and expire on set dates.' },
        ],
      },
      {
        title: 'Calls & puts',
        blocks: [
          { type: 'term', term: 'Call option (CE)', def: 'The right (not obligation) to BUY the underlying at the strike price before/at expiry. Bullish.' },
          { type: 'term', term: 'Put option (PE)', def: 'The right to SELL the underlying at the strike. Bearish / protective.' },
          { type: 'term', term: 'Premium', def: 'The price you pay to buy an option — the most a buyer can lose.' },
          { type: 'term', term: 'Strike & Expiry', def: 'Strike = the contract’s price level; Expiry = the date the contract settles.' },
        ],
      },
      {
        title: 'Leverage & hedging',
        blocks: [
          { type: 'p', text: 'F&O offer leverage — control a large position with less capital. That magnifies both gains and losses.' },
          { type: 'term', term: 'Hedging', def: 'Using derivatives to protect a portfolio, e.g. buying puts as insurance against a fall.' },
          { type: 'warn', text: 'Options can expire worthless. Leverage cuts both ways — F&O is advanced and high-risk. Practise here first.' },
        ],
      },
    ],
    quiz: [
      { q: 'A call option gives the holder the right to…', options: ['Sell the underlying at the strike', 'Buy the underlying at the strike', 'Receive dividends', 'Short the index for free'], answer: 1, explain: 'A call (CE) is the right to BUY at the strike — a bullish bet.' },
      { q: 'The premium is…', options: ['A guaranteed profit', 'The price paid to buy an option (max loss for a buyer)', 'A dividend', 'The strike price'], answer: 1, explain: 'Premium is the option’s price; an option buyer’s max loss is the premium paid.' },
      { q: 'Leverage in F&O means…', options: ['Lower risk always', 'Controlling a larger position with less capital — magnifying gains AND losses', 'No expiry', 'Guaranteed returns'], answer: 1, explain: 'Leverage magnifies both gains and losses for a given capital.' },
      { q: 'Buying a put option is generally a…', options: ['Bullish bet', 'Bearish / protective position', 'Dividend strategy', 'Way to avoid all risk'], answer: 1, explain: 'A put profits from (or protects against) a fall — bearish/protective.' },
      { q: 'A future contract differs from an option because…', options: ['Both sides are obligated to transact', 'It never expires', 'It pays dividends', 'It has no underlying'], answer: 0, explain: 'In a future both parties are obligated; an option gives the buyer a right, not an obligation.' },
    ],
  },
];
