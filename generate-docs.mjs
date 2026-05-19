/**
 * Paper Portfolio — Technical Documentation Generator
 * Outputs: docs/TechnicalDocument.docx  +  docs/TechnicalDocument.pdf
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, UnderlineType, ShadingType, convertInchesToTwip,
  PageBreak, TableOfContents, StyleLevel,
} from 'docx';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'docs';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const h1  = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
const h2  = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
const h3  = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
const p   = (text) => new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 100 } });
const br  = ()     => new Paragraph({ text: '' });
const bullet = (text, level = 0) => new Paragraph({
  text, bullet: { level },
  indent: { left: convertInchesToTwip(0.25 * (level + 1)) },
  spacing: { after: 60 },
  children: [new TextRun({ text, size: 21 })],
});
const bold = (text) => new TextRun({ text, bold: true, size: 22 });
const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: 'Courier New', size: 18, color: '2E4057' })],
  shading: { type: ShadingType.CLEAR, fill: 'F4F6F8' },
  spacing: { after: 80 },
  indent: { left: convertInchesToTwip(0.3) },
});

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map((text, i) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(text), bold: isHeader, size: isHeader ? 20 : 19 })],
        spacing: { before: 60, after: 60 },
      })],
      shading: isHeader ? { type: ShadingType.CLEAR, fill: '1B4F72', color: 'FFFFFF' } : (i % 2 === 0 ? undefined : { type: ShadingType.CLEAR, fill: 'F8F9FA' }),
      margins: { top: 80, bottom: 80, left: 150, right: 150 },
    })),
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    rows: [tableRow(headers, true), ...rows.map(r => tableRow(r))],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─────────────────────────────────────────────────────────────
// Document sections
// ─────────────────────────────────────────────────────────────
const sections = [

  // ── Cover ──────────────────────────────────────────────────
  new Paragraph({
    children: [new TextRun({ text: 'Paper Portfolio', bold: true, size: 72, color: '00B386' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Technical Architecture & Developer Reference', size: 32, color: '444444' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Version 1.0  ·  May 2026', size: 22, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }),
  pageBreak(),

  // ── 1. Executive Summary ───────────────────────────────────
  h1('1. Executive Summary'),
  p('Paper Portfolio is a full-stack Indian stock market paper trading platform that lets users practise equity trading with real-time NSE/BSE prices and zero financial risk. It mirrors the Groww brokerage experience — candlestick charts, order types, portfolio analytics, a community feed, and Claude-powered AI insights — all backed by a lightweight SQLite database on a single Node.js server.'),
  br(),
  p('The platform is suitable for students learning to invest, retail traders back-testing strategies, and educators running classroom trading contests.'),
  br(),

  makeTable(
    ['Property', 'Value'],
    [
      ['Primary language', 'TypeScript (client + server)'],
      ['Frontend framework', 'React 18 + Vite 5'],
      ['Backend framework', 'Express 4'],
      ['Database', 'SQLite (Node.js built-in module)'],
      ['Market data', 'Yahoo Finance via yahoo-finance2'],
      ['AI integration', 'Anthropic Claude (claude-sonnet-4-x)'],
      ['Authentication', 'JWT cookies + optional Firebase Google Sign-In'],
      ['Deployment', 'Docker Compose on AWS EC2 / any VPS'],
      ['Market coverage', 'NSE (~2 000 stocks), BSE (quotes)'],
      ['Market hours', '9:15 AM – 3:30 PM IST, weekdays'],
    ],
  ),
  pageBreak(),

  // ── 2. Repository Structure ────────────────────────────────
  h1('2. Repository Structure'),
  p('The project is a monorepo with two npm workspaces: client (React SPA) and server (Express API). A single Dockerfile and docker-compose.yml deploy both together.'),
  br(),
  code('Paper-Portfolio/'),
  code('├── client/                 # React + Vite frontend'),
  code('│   ├── src/'),
  code('│   │   ├── pages/          # 28 page-level components'),
  code('│   │   ├── components/     # 21 reusable UI components'),
  code('│   │   ├── store/          # 6 Zustand state stores'),
  code('│   │   └── lib/            # Utilities, Firebase init'),
  code('│   ├── vite.config.ts'),
  code('│   └── tailwind.config.js'),
  code('├── server/'),
  code('│   ├── src/'),
  code('│   │   ├── routes/         # 27 Express route modules'),
  code('│   │   ├── services/       # Market data, order exec, AI, email'),
  code('│   │   ├── middleware/     # Auth guards'),
  code('│   │   ├── db/             # SQLite schema + wrapper'),
  code('│   │   └── scripts/        # Seed, reset utilities'),
  code('│   └── data/               # papertrading.db (SQLite file)'),
  code('├── docker-compose.yml'),
  code('├── Dockerfile'),
  code('└── .github/workflows/      # GitHub Actions CI/CD'),
  br(),
  pageBreak(),

  // ── 3. Frontend Architecture ───────────────────────────────
  h1('3. Frontend Architecture'),

  h2('3.1 Technology Stack'),
  makeTable(
    ['Package', 'Version', 'Purpose'],
    [
      ['react', '18.2.0', 'UI component framework'],
      ['react-router-dom', '6.22.3', 'Client-side routing (28 routes)'],
      ['zustand', '4.5.2', 'Lightweight global state management'],
      ['axios', '1.6.8', 'HTTP client (withCredentials for cookies)'],
      ['lightweight-charts', '5.1.0', 'TradingView-compatible OHLCV charts'],
      ['recharts', '2.12.3', 'Sector pie charts, P&L graphs'],
      ['tailwindcss', '3.4.1', 'Utility-first CSS'],
      ['lucide-react', '0.363.0', 'Icon library'],
      ['react-hot-toast', '2.4.1', 'Toast notifications'],
      ['firebase', '12.12.1', 'Google Sign-In authentication'],
      ['@anthropic-ai/sdk', '0.92.0', 'Claude AI chat integration'],
    ],
  ),

  h2('3.2 Pages'),
  p('All pages are lazy-loaded via React.lazy() to minimise initial bundle size. Only auth-critical pages (Landing, Login, Register) are eagerly loaded.'),
  br(),
  makeTable(
    ['Page', 'Route', 'Description'],
    [
      ['Dashboard', '/dashboard', 'Portfolio summary, sector heatmap, gainers/losers, AI chat panel'],
      ['TerminalPage', '/terminal/:symbol', 'Full trading terminal: TradingView chart, order panel, market depth'],
      ['PortfolioPage', '/portfolio', 'Holdings table, P&L breakdown, sector allocation pie chart'],
      ['PositionsPage', '/positions', 'Active CNC + MIS intraday positions'],
      ['OrdersPage', '/orders', 'Order history with status (PENDING/FILLED/CANCELLED)'],
      ['MarketExplorer', '/market', 'Browse and search all NSE stocks'],
      ['WatchlistPage', '/watchlist', 'Saved stock watchlists'],
      ['SectorsPage', '/sectors', 'Sector heatmap and drill-down stock list'],
      ['ScreenerPage', '/screener', 'Filter stocks by PE, market cap, return, etc.'],
      ['AlgoTradePage', '/algo', 'Algorithmic strategy builder and manager'],
      ['AIChatPage', '/ai-chat', 'Standalone Claude AI trading assistant'],
      ['CommunityPage', '/community', 'Social posts, votes, comments'],
      ['LeaderboardPage', '/leaderboard', 'Global P&L rankings and contest boards'],
      ['AchievementsPage', '/achievements', 'Badge collection (12 achievement types)'],
      ['AdminPage', '/admin', 'User management and platform statistics (admin only)'],
      ['CompanyPage', '/company/:symbol', 'Company research, fundamentals, news'],
      ['NewsPage', '/news', 'Aggregated market news (RSS)'],
      ['DailyInsightsPage', '/insights', 'Daily AI-generated market insights'],
    ],
  ),

  h2('3.3 Zustand State Stores'),
  p('All stores follow a consistent pattern: synchronous state reads, async action methods, and a reset() hook called on logout.'),
  br(),
  makeTable(
    ['Store', 'File', 'Key State', 'Key Methods'],
    [
      ['authStore', 'authStore.ts', 'user, isAuthenticated, isInitializing', 'login, logout, updateBalance, loginMpin'],
      ['marketStore', 'marketStore.ts', 'quotes{}, status, extraSymbols[]', 'addSymbols, fetchLive, getQuote, reset'],
      ['portfolioStore', 'portfolioStore.ts', 'data (holdings + P&L), loading', 'fetch(force?), reset'],
      ['ordersStore', 'ordersStore.ts', 'orders[], loading', 'fetch, reset'],
      ['watchlistStore', 'watchlistStore.ts', 'watchlists[], items{}', 'fetch, add, remove, reset'],
      ['notificationsStore', 'notificationsStore.ts', 'notifications[], unreadCount', 'fetch, markRead, reset'],
    ],
  ),

  h2('3.4 StockChart Component'),
  p('The terminal chart uses lightweight-charts v5 with the following capabilities:'),
  bullet('Chart types: Candlestick and Line'),
  bullet('Range buttons: 1D (5m bars), 1W (1h bars), 1M (daily), 3M (daily), 1Y (weekly)'),
  bullet('Overlay indicators: SMA 20, SMA 50, EMA 20, Bollinger Bands'),
  bullet('Sub-pane indicators: RSI 14, MACD (12/26/9)'),
  bullet('Drawing tools: Cursor, Trendline, Horizontal line, Channel (parallel lines), Text label, Emoji marker, Measure tool, Zoom, Magnet snap-to-OHLC'),
  bullet('Live updates: Subscribes to marketStore.quotes and calls series.update() on each price tick'),
  bullet('Auto-refresh: Increments refreshCount every 5 min during market hours to pull new bars'),
  bullet('autoSize: true — chart fills its flex container; no fixed pixel height'),
  br(),

  h2('3.5 Design System'),
  p('The design closely mirrors Groww\'s dark-mode brokerage UI:'),
  br(),
  makeTable(
    ['Token', 'Value', 'Usage'],
    [
      ['groww-primary', '#00B386', 'Primary brand teal, buy buttons, links'],
      ['groww-dark', '#0B0F19', 'App background (dark mode)'],
      ['groww-card', '#1A1F2E', 'Card/panel background (dark mode)'],
      ['gain', '#00C087', 'Positive P&L, green candles, buy indicators'],
      ['loss', '#EF4444', 'Negative P&L, red candles, sell indicators'],
      ['Inter / DM Sans', '—', 'Primary typeface (system fallback: sans-serif)'],
    ],
  ),
  pageBreak(),

  // ── 4. Backend Architecture ────────────────────────────────
  h1('4. Backend Architecture'),

  h2('4.1 Technology Stack'),
  makeTable(
    ['Package', 'Version', 'Purpose'],
    [
      ['express', '4.18.3', 'HTTP server and routing'],
      ['node:sqlite (built-in)', 'Node 22.5+', 'Embedded relational database (no install)'],
      ['jsonwebtoken', '9.0.2', 'JWT generation and verification (7-day tokens)'],
      ['bcryptjs', '2.4.3', 'Password and MPIN hashing (10 salt rounds)'],
      ['yahoo-finance2', '3.14.0', 'Live quotes, OHLC history, fundamentals'],
      ['@anthropic-ai/sdk', '0.92.0', 'Claude AI integration for insights and chat'],
      ['node-cron', '3.0.3', 'Scheduled tasks (alerts, snapshots, AI posts)'],
      ['firebase-admin', '13.8.0', 'Google authentication token verification'],
      ['nodemailer', '8.0.7', 'Password-reset OTP emails'],
      ['multer', '2.1.1', 'Image uploads for community posts'],
      ['compression', '1.8.1', 'Gzip compression (~70% transfer reduction)'],
      ['zod', '3.22.4', 'Request body validation'],
    ],
  ),

  h2('4.2 Express Application Setup (server/src/index.ts)'),
  p('Server startup sequence:'),
  bullet('1. Load .env (JWT_SECRET, ADMIN_EMAIL, SMTP credentials, Anthropic API key)'),
  bullet('2. initSchema() — create all SQLite tables and indexes if not present'),
  bullet('3. ingestSymbols() — background-fetch ~2 000 NSE stock records from Yahoo'),
  bullet('4. seedCommunityIfEmpty() — one-time seed of sample community posts'),
  bullet('5. startOrderExecutionScheduler() — begin cron that checks pending orders'),
  bullet('6. Mount 27 route modules under /api/*'),
  bullet('7. In production: serve Vite-built client/dist/ as static files'),
  bullet('8. SPA fallback: non-/api GET requests return index.html'),
  br(),
  p('Scheduled tasks (node-cron):'),
  makeTable(
    ['Schedule', 'Task', 'Condition'],
    [
      ['Every 60 seconds', 'Check price alert triggers — query untriggered alerts, fetch current prices, fire notifications', 'Market open only'],
      ['Every 60 seconds', 'Order execution sweep — MARKET/LIMIT/SL fill check', 'Market open only'],
      ['Every hour', 'Record portfolio snapshots for all users (portfolio_history table)', 'Market open only'],
      ['Daily 8:00 AM IST', 'Post AI-generated daily trading strategy to community feed via Claude', 'Always'],
    ],
  ),
  br(),
  p('Two-tier market data polling:'),
  makeTable(
    ['Tier', 'Symbols', 'Poll Interval (open)', 'Poll Interval (closed)'],
    [
      ['Tier 1 (fast)', 'Nifty50 + user holdings + user watchlists', '5 seconds', '2 minutes'],
      ['Tier 2 (slow)', 'All ~2 000 NSE stocks from DB', '5 minutes', '30 minutes'],
    ],
  ),
  pageBreak(),

  // ── 5. Database Schema ─────────────────────────────────────
  h1('5. Database Schema'),
  p('The database is a single SQLite file at server/data/papertrading.db. It uses WAL (Write-Ahead Logging) journal mode for concurrency, foreign key enforcement, and a 5-second busy timeout.'),

  h2('5.1 Core Tables'),
  makeTable(
    ['Table', 'Primary Key', 'Key Columns', 'Purpose'],
    [
      ['users', 'id INTEGER', 'email, name, password_hash, mpin_hash, balance REAL, role TEXT, firebase_uid', 'User accounts. Balance defaults to ₹10,00,000. Role: user | admin.'],
      ['stocks', 'id INTEGER', 'symbol TEXT UNIQUE, name, sector, isin, market_cap, pe_ratio, roe, book_value, debt_to_equity, div_yield, high_52w, low_52w', 'NSE stock master data. Fundamentals fetched from Yahoo on ingestion.'],
      ['holdings', 'id INTEGER', 'user_id FK, symbol, quantity INTEGER, avg_buy_price REAL', 'Current equity holdings. One row per user+symbol. Updated on each fill.'],
      ['orders', 'id INTEGER', 'user_id FK, symbol, exchange, type (MARKET/LIMIT/SL/SL-M), transaction_type (BUY/SELL), quantity, limit_price, trigger_price, product_type (CNC/MIS), status (PENDING/FILLED/CANCELLED), is_gtt, is_amo', 'All orders placed. Status managed by orderExecution service.'],
      ['transactions', 'id INTEGER', 'user_id FK, symbol, type (BUY/SELL), quantity, price, amount, order_id FK, executed_at', 'Immutable record of every executed trade.'],
      ['price_alerts', 'id INTEGER', 'user_id FK, symbol, target_price REAL, condition TEXT CHECK(IN(\'above\',\'below\')), triggered INTEGER DEFAULT 0', 'User price alerts. Checked every minute during market hours.'],
      ['portfolio_history', 'id INTEGER', 'user_id FK, total_value REAL, cash_balance REAL, recorded_at TEXT', 'Hourly portfolio snapshots for growth chart.'],
      ['activity_log', 'id INTEGER', 'user_id FK, action TEXT, details TEXT (JSON), ip_address, created_at', 'Audit trail of all user actions (login, trade, alert, etc.)'],
      ['wallet_transactions', 'id INTEGER', 'user_id FK, type (DEPOSIT/WITHDRAW), amount REAL, balance_after', 'Deposit and withdrawal history.'],
      ['notifications', 'id INTEGER', 'user_id FK, title, message, type (price_alert/order_fill/system), read INTEGER DEFAULT 0', 'In-app notification inbox.'],
    ],
  ),

  h2('5.2 Watchlists'),
  makeTable(
    ['Table', 'Key Columns', 'Purpose'],
    [
      ['watchlists', 'id, user_id FK, name TEXT', 'Named watchlist collections (e.g. "My IT stocks")'],
      ['watchlist_items', 'id, watchlist_id FK, symbol TEXT, exchange TEXT', 'Individual symbols in a watchlist'],
    ],
  ),

  h2('5.3 Advanced Feature Tables'),
  makeTable(
    ['Table', 'Purpose'],
    [
      ['mis_shorts', 'Intraday short positions (Sell Now, Buy Later). Auto-squared at 3:20 PM.'],
      ['gtt_orders', 'Good Till Triggered orders — fire when price crosses target.'],
      ['sip_schedules', 'Systematic Investment Plans (daily/weekly/monthly auto-buy).'],
      ['baskets / basket_items', 'Multi-stock order templates executed in one click.'],
      ['collections / collection_items', 'Thematic stock groups (e.g. "EV plays", "PSU Banks").'],
      ['contests / contest_participants', 'Competitive trading contests with isolated virtual capital.'],
      ['achievements / user_achievements', 'Gamification badges (12 types: First Trade, 10-Bagger, Diversified, etc.).'],
      ['corporate_actions', 'Bonus shares, splits, dividends — applied to holdings.'],
      ['community_posts / community_comments / community_votes', 'Social discussion feed with upvote/downvote system.'],
      ['fo_positions / fo_orders', 'Futures & Options (CE/PE/FUT) positions with Greeks.'],
      ['algo_strategies / algo_trades', 'Algorithmic strategy definitions and execution log.'],
      ['trade_pnl', 'Realized P&L per closed trade for tax / reporting.'],
      ['password_reset_otps', 'Time-limited OTP codes for forgot-password email flow.'],
    ],
  ),

  h2('5.4 Database Indexes (24 total)'),
  p('Performance-critical indexes for fast lookups:'),
  bullet('idx_users_email — unique, used on login'),
  bullet('idx_holdings_user_id — portfolio fetch'),
  bullet('idx_orders_user_id, idx_orders_status, idx_orders_user_status — order queries'),
  bullet('idx_transactions_user_id, idx_transactions_symbol — trade history'),
  bullet('idx_price_alerts_user_id, idx_price_alerts_triggered — alert sweep'),
  bullet('idx_notifications_user_id, idx_notifications_user_read — unread count'),
  bullet('idx_portfolio_history_user_id, idx_portfolio_history_recorded_at — chart history'),
  pageBreak(),

  // ── 6. API Reference ───────────────────────────────────────
  h1('6. API Reference'),
  p('All API endpoints are under /api. Authenticated endpoints require an auth_token HttpOnly cookie (set on login). Admin endpoints additionally require role = admin.'),

  h2('6.1 Authentication  /api/auth'),
  makeTable(
    ['Method', 'Path', 'Auth', 'Description'],
    [
      ['POST', '/register', 'None', 'Create account. Body: { name, email, password }. Returns user + sets auth cookie.'],
      ['POST', '/login', 'None', 'Email/password login. Returns user object + sets auth_token cookie.'],
      ['POST', '/login-mpin', 'None', 'Quick login with 4-digit MPIN. Body: { email, mpin }.'],
      ['POST', '/set-mpin', 'Required', 'Set or change MPIN. Body: { mpin }.'],
      ['POST', '/forgot-password', 'None', 'Send OTP to email for password reset.'],
      ['POST', '/reset-password', 'None', 'Complete reset with OTP. Body: { email, otp, newPassword }.'],
      ['GET', '/me', 'Required', 'Validate session. Returns current user or 401.'],
      ['POST', '/logout', 'Required', 'Clear auth cookie.'],
    ],
  ),

  h2('6.2 Market Data  /api/stocks'),
  makeTable(
    ['Method', 'Path', 'Auth', 'Description'],
    [
      ['GET', '/market-status', 'None', 'Market open/closed flag, next open time, recommended poll interval.'],
      ['GET', '/search?q=', 'None', 'Search stocks by symbol or company name. Returns top matches.'],
      ['GET', '/live', 'Required', 'Bulk live quotes. Optional: ?symbols=TCS,RELIANCE (defaults to Nifty50).'],
      ['GET', '/sectors', 'None', 'Per-sector stats: change%, gainers/losers count, stock count.'],
      ['GET', '/sectors/:sector/stocks', 'None', 'All stocks in a sector with live price data.'],
      ['GET', '/gainers', 'None', 'Top 10 gainers from Nifty 500 universe.'],
      ['GET', '/losers', 'None', 'Top 10 losers from Nifty 500 universe.'],
      ['GET', '/screener', 'None', 'Filtered stock list. Params: sector, minPE, maxPE, minReturn, sortBy.'],
      ['GET', '/:symbol', 'None', 'Full quote + fundamentals for a single stock.'],
      ['GET', '/:symbol/history', 'None', 'OHLCV history. Params: range (1d/5d/1mo/3mo/1y), interval.'],
      ['GET', '/:symbol/depth', 'None', 'Simulated market depth (5 bid/ask levels).'],
      ['GET', '/:symbol/fundamentals', 'None', 'Deep fundamentals: revenue, profit, ROE, debt-to-equity.'],
      ['GET', '/my-alerts', 'Required', 'List user\'s active (untriggered) price alerts.'],
      ['POST', '/:symbol/alert', 'Required', 'Create price alert. Body: { targetPrice, condition: above|below }.'],
      ['DELETE', '/my-alerts/:id', 'Required', 'Delete a price alert.'],
    ],
  ),

  h2('6.3 Orders  /api/orders'),
  makeTable(
    ['Method', 'Path', 'Auth', 'Description'],
    [
      ['GET', '/', 'Required', 'List user orders (paginated). Supports filter by status.'],
      ['POST', '/', 'Required', 'Place order. Body: { symbol, exchange, type, transactionType, quantity, limitPrice?, triggerPrice?, targetPrice?, productType }.'],
      ['GET', '/mis-shorts', 'Required', 'Active MIS short positions with live unrealised P&L.'],
      ['POST', '/:id/modify', 'Required', 'Modify a PENDING order\'s quantity or prices.'],
      ['POST', '/:id/cancel', 'Required', 'Cancel a PENDING order.'],
    ],
  ),
  p('Supported order types:'),
  makeTable(
    ['Type', 'Description'],
    [
      ['MARKET', 'Execute immediately at current market price.'],
      ['LIMIT', 'Execute only when price reaches the specified limit.'],
      ['SL (Stop Loss Limit)', 'Trigger on SL price, then execute at limit price.'],
      ['SL-M (Stop Loss Market)', 'Trigger on SL price, then execute at market price.'],
    ],
  ),

  h2('6.4 Portfolio  /api/portfolio'),
  makeTable(
    ['Method', 'Path', 'Description'],
    [
      ['GET', '/', 'Full portfolio: balance, holdings (enriched with live prices), total P&L, day change, sector allocation, trade stats, risk metrics.'],
      ['GET', '/history', 'Hourly portfolio value snapshots for growth chart. Returns array of { recorded_at, total_value, cash_balance }.'],
    ],
  ),

  h2('6.5 Other Endpoints'),
  makeTable(
    ['Prefix', 'Key Endpoints', 'Purpose'],
    [
      ['/api/watchlists', 'GET /, POST /, POST /:id/items, DELETE /:id/items/:symbol, POST /toggle', 'Manage watchlist collections and items'],
      ['/api/wallet', 'POST /deposit, POST /withdraw, GET /history', 'Simulate balance top-ups and withdrawals'],
      ['/api/notifications', 'GET /, POST /:id/read, POST /read-all', 'In-app notification inbox'],
      ['/api/gtt', 'GET /, POST /, DELETE /:id', 'Good Till Triggered order management'],
      ['/api/ai', 'POST /chat, GET /daily-insight', 'Claude AI chat with portfolio context'],
      ['/api/news', 'GET /', 'Aggregated RSS news (Economic Times, Moneycontrol)'],
      ['/api/community', 'GET /posts, POST /posts, POST /posts/:id/comments, POST /posts/:id/vote', 'Social discussion feed'],
      ['/api/leaderboard', 'GET /, GET /contests/:id', 'Global and contest-specific P&L rankings'],
      ['/api/achievements', 'GET /user, POST /check', 'User badge collection and unlock check'],
      ['/api/sip', 'GET /, POST /, DELETE /:id', 'Systematic Investment Plan CRUD'],
      ['/api/admin', 'GET /users, GET /stats, POST /users/:id/set-balance, POST /users/:id/reset', 'Admin-only platform management (requires role=admin)'],
      ['/api/fo', 'GET /positions, POST /positions, DELETE /positions/:id', 'Futures and Options trading'],
      ['/api/algo', 'GET /strategies, POST /strategies, POST /strategies/:id/activate', 'Algorithmic strategy management'],
    ],
  ),
  pageBreak(),

  // ── 7. Authentication & Security ──────────────────────────
  h1('7. Authentication & Security'),

  h2('7.1 Authentication Methods'),
  makeTable(
    ['Method', 'Flow', 'Implementation'],
    [
      ['Email + Password', 'POST /api/auth/login → bcrypt.compare → JWT issued', 'bcryptjs (10 rounds), JWT HS256'],
      ['MPIN (4-digit PIN)', 'POST /api/auth/login-mpin → bcrypt.compare(mpin_hash)', 'Same bcrypt hash, faster than password'],
      ['Google Sign-In', 'Firebase ID token → /api/auth/firebase → firebase-admin.verifyIdToken → JWT issued', 'firebase-admin on server side'],
      ['Forgot Password', 'POST /forgot-password → OTP via email → POST /reset-password', 'nodemailer + 6-digit OTP, 15-min TTL'],
    ],
  ),

  h2('7.2 JWT Token Strategy'),
  bullet('Tokens are issued as HttpOnly, SameSite=Strict cookies (named auth_token).'),
  bullet('7-day expiry. No refresh token — re-login on expiry.'),
  bullet('authMiddleware verifies signature AND checks user still exists in DB (guards against post-DB-reset stale tokens).'),
  bullet('Bearer header fallback for non-browser clients (API testing, mobile apps).'),
  br(),

  h2('7.3 Role-Based Access Control'),
  makeTable(
    ['Role', 'Capabilities'],
    [
      ['user (default)', 'All trading features, own portfolio, watchlists, community, AI chat'],
      ['admin', 'All user capabilities + /api/admin/* (view all users, reset balances, platform stats)'],
    ],
  ),
  p('Admin is bootstrapped on first run using ADMIN_EMAIL and ADMIN_PASSWORD environment variables.'),
  br(),

  h2('7.4 Security Practices'),
  bullet('HttpOnly cookies — XSS cannot read the auth token.'),
  bullet('Passwords and MPINs are never stored in plaintext — bcrypt hashed with 10 rounds.'),
  bullet('Activity logging on all sensitive actions (login, trade, MPIN change, admin actions).'),
  bullet('All DB queries use parameterised statements (no SQL injection risk).'),
  bullet('Admin routes protected by adminMiddleware (role check after auth).'),
  bullet('Gzip compression on all responses (compression middleware).'),
  bullet('CORS configured with credentials: true for the same-origin cookie to be sent.'),
  pageBreak(),

  // ── 8. Market Data Pipeline ────────────────────────────────
  h1('8. Market Data Pipeline'),

  h2('8.1 Data Source'),
  p('All market data is sourced from Yahoo Finance via the yahoo-finance2 npm package. This includes:'),
  bullet('Live quotes: price, change, change%, volume, day high/low, 52-week range'),
  bullet('OHLCV history: configurable range (1d to 5y) and interval (1m to 1mo)'),
  bullet('Fundamentals: PE ratio, market cap, book value, ROE, dividend yield, debt-to-equity'),
  bullet('Indices: Nifty50, Nifty500, Bank Nifty, sectoral indices'),
  br(),

  h2('8.2 Caching Architecture'),
  p('The server maintains an in-memory cache (Map<symbol, CachedQuote>) with the following TTL strategy:'),
  makeTable(
    ['Market State', 'Cache TTL (fresh)', 'Stale-While-Revalidate grace'],
    [
      ['Market open (9:15–15:30 IST)', '5 seconds', '1 hour (serve stale if Yahoo unavailable)'],
      ['Market closed', '5 minutes', '1 hour'],
      ['Pre-market / after-hours', '5 minutes', '1 hour'],
    ],
  ),
  p('The stale-while-revalidate pattern means prices are never missing from the UI — old data is shown with no loading state while a fresh fetch runs in the background.'),
  br(),

  h2('8.3 Rate-Limit Resilience'),
  bullet('Primary fetch: yahoo-finance2 quote endpoint.'),
  bullet('Fallback: Yahoo chart endpoint (different rate-limit bucket).'),
  bullet('Batch mode: up to 50 symbols per request to minimise API calls.'),
  bullet('Tier-2 background poller staggers requests to avoid burst limits.'),
  br(),

  h2('8.4 Market Hours'),
  makeTable(
    ['Status', 'IST Time Window', 'Behaviour'],
    [
      ['Pre-market', '00:00 – 09:15', 'Data polled every 5 min; orders queued as AMO'],
      ['Market Open', '09:15 – 15:30', 'Tier-1 poll every 5s; order execution active'],
      ['After-hours', '15:30 – 23:59', 'Data polled every 5 min; orders queued'],
      ['Weekend / Holiday', 'All day', 'Data polled every 30 min'],
    ],
  ),
  pageBreak(),

  // ── 9. Order Lifecycle ─────────────────────────────────────
  h1('9. Order Lifecycle'),

  h2('9.1 Order Placement'),
  p('When POST /api/orders is called:'),
  bullet('1. Validate: symbol exists, quantity ≥ 1, exchange is NSE or BSE.'),
  bullet('2. For BUY: check user balance ≥ estimated order value (MIS: 20% margin required).'),
  bullet('3. For SELL (CNC): check user holds sufficient shares.'),
  bullet('4. If market is closed: status = PENDING (AMO — queued for 9:15 AM).'),
  bullet('5. If market open: MARKET orders fill immediately at current price. LIMIT/SL orders inserted as PENDING.'),
  bullet('6. On fill: debit/credit balance, update holdings table, insert transaction record, send notification.'),
  br(),

  h2('9.2 MIS Intraday Trading'),
  bullet('Product type = MIS enables 5× margin (only 20% of order value required as balance).'),
  bullet('Short selling supported: Sell first (mis_shorts table), buy back to close.'),
  bullet('Auto square-off: All open MIS positions are force-closed at 3:20 PM IST.'),
  bullet('MIS orders do not carry overnight.'),
  br(),

  h2('9.3 Order Status Flow'),
  makeTable(
    ['Status', 'Meaning', 'Next State'],
    [
      ['PENDING', 'Waiting for price condition or market open', 'FILLED or CANCELLED'],
      ['FILLED', 'Executed at the fill price', 'Terminal (no further change)'],
      ['CANCELLED', 'Cancelled by user or auto-cancelled (market closed, insufficient balance)', 'Terminal'],
      ['REJECTED', 'Failed validation at execution time', 'Terminal'],
    ],
  ),

  h2('9.4 GTT (Good Till Triggered)'),
  p('GTT orders are stored in the gtt_orders table with a trigger_price and optional limit_price. They are checked by the order execution scheduler every minute during market hours. Once triggered, a child order is created automatically.'),
  pageBreak(),

  // ── 10. AI Integration ─────────────────────────────────────
  h1('10. AI Integration (Claude)'),

  h2('10.1 Chat Endpoint'),
  p('POST /api/ai/chat accepts a user message and enriches the context with:'),
  bullet('Current market status (open/closed, time)'),
  bullet('User portfolio summary (holdings, P&L, cash balance)'),
  bullet('Recent order history (last 10 orders)'),
  bullet('Current prices of held stocks'),
  br(),
  p('The enriched prompt is sent to Claude (claude-sonnet-4-x model) and the response is returned as streaming SSE or a single JSON body depending on client capability.'),
  br(),

  h2('10.2 Daily Strategy Bot (communityBot.ts)'),
  p('Every day at 8:00 AM IST, the server calls Claude with a prompt requesting a trading strategy or market insight. The response is automatically posted to the community feed as a bot post, visible to all users.'),
  br(),

  h2('10.3 Rate Limiting'),
  p('AI usage is tracked in the users.ai_credits_used column. A per-user daily limit prevents excessive API spend. Users exceeding the limit receive a 429 response with a retry-after header.'),
  pageBreak(),

  // ── 11. Deployment ─────────────────────────────────────────
  h1('11. Deployment'),

  h2('11.1 Docker Compose (Production)'),
  p('The entire application runs as a single Docker container:'),
  code('services:'),
  code('  paper-portfolio:'),
  code('    build: .'),
  code('    ports:'),
  code('      - "5000:5000"'),
  code('    volumes:'),
  code('      - ./server/data:/app/server/data    # SQLite DB persistence'),
  code('    environment:'),
  code('      - NODE_ENV=production'),
  code('      - JWT_SECRET=${JWT_SECRET}'),
  code('      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}'),
  br(),

  h2('11.2 Dockerfile (Multi-stage Build)'),
  p('Stage 1 (builder): Install deps + run tsc (server) + vite build (client).'),
  p('Stage 2 (runtime): Copy only compiled artefacts + node_modules (no dev tools, smaller image).'),
  br(),

  h2('11.3 CI/CD (GitHub Actions)'),
  p('On push to main:'),
  bullet('1. Checkout code'),
  bullet('2. SSH into EC2 instance'),
  bullet('3. git pull latest'),
  bullet('4. docker compose up --build -d'),
  bullet('5. Health check on /api/stocks/market-status'),
  br(),

  h2('11.4 Environment Variables'),
  makeTable(
    ['Variable', 'Required', 'Description'],
    [
      ['JWT_SECRET', 'Yes', 'Secret key for signing JWT tokens. Must be long and random.'],
      ['ADMIN_EMAIL', 'Yes', 'Email address that gets bootstrapped as admin on first run.'],
      ['ADMIN_PASSWORD', 'Yes', 'Initial admin password (change after first login).'],
      ['ADMIN_NAME', 'No', 'Display name for the admin user.'],
      ['ANTHROPIC_API_KEY', 'No', 'Required for AI chat and daily strategy posts.'],
      ['FIREBASE_SERVICE_ACCOUNT', 'No', 'JSON string for Google Sign-In support.'],
      ['SMTP_HOST', 'No', 'SMTP server hostname for password-reset emails.'],
      ['SMTP_PORT', 'No', 'SMTP port (typically 465 or 587).'],
      ['SMTP_USER', 'No', 'SMTP login username.'],
      ['SMTP_PASS', 'No', 'SMTP login password.'],
      ['DB_PATH', 'No', 'Override default SQLite file path.'],
      ['PORT', 'No', 'HTTP server port (default: 5000).'],
      ['NODE_ENV', 'No', 'Set to production to enable static file serving.'],
    ],
  ),
  pageBreak(),

  // ── 12. Performance & Scalability ─────────────────────────
  h1('12. Performance & Scalability'),

  h2('12.1 Client-Side Optimisations'),
  makeTable(
    ['Optimisation', 'Detail'],
    [
      ['Code splitting (6 chunks)', 'React, Firebase, recharts, markdown, icons, utilities — each lazy-loaded'],
      ['Lazy-loaded pages', 'All 28 pages use React.lazy(); only the current page JS is fetched'],
      ['Vite HMR (dev)', 'Hot Module Replacement for instant feedback during development'],
      ['Tailwind purge', 'Unused CSS classes removed at build time; final CSS < 30 KB'],
      ['Asset hashing', 'Content-hash filenames; CDN-safe 1-year cache headers'],
      ['autoSize chart', 'TradingView chart uses ResizeObserver internally, no fixed pixel height'],
    ],
  ),

  h2('12.2 Server-Side Optimisations'),
  makeTable(
    ['Optimisation', 'Detail'],
    [
      ['Gzip compression', 'All API responses and static assets compressed (~70% size reduction)'],
      ['In-memory quote cache', 'Quotes served from Map<symbol, quote> — zero DB reads on fast path'],
      ['Stale-while-revalidate', 'Up to 1 hour stale data served if Yahoo API is unavailable'],
      ['SQLite WAL mode', 'Write-Ahead Logging allows concurrent reads during writes'],
      ['Statement caching', 'db.prepare() called once per unique SQL string; reused across requests'],
      ['24 DB indexes', 'Covering all hot query paths: user lookup, order status, portfolio fetch'],
      ['Background ingestion', 'Stock symbol fetch runs on a background task; never blocks request handling'],
    ],
  ),

  h2('12.3 Scalability Limitations'),
  p('The current architecture is designed for a single-server deployment:'),
  bullet('SQLite does not support multi-process write scaling. For horizontal scaling, migrate to PostgreSQL.'),
  bullet('In-memory quote cache is per-process. Multiple instances would each maintain separate caches.'),
  bullet('WebSocket connections (if added) would require sticky sessions or Redis pub/sub.'),
  bullet('Recommended scale: up to ~500 concurrent users on a single 2-vCPU / 2GB RAM VPS.'),
  pageBreak(),

  // ── 13. User Flows ─────────────────────────────────────────
  h1('13. Key User Flows'),

  h2('13.1 New User Registration → First Trade'),
  makeTable(
    ['Step', 'Action', 'System Response'],
    [
      ['1', 'Visit /register, fill name/email/password', 'Account created, ₹10,00,000 virtual balance credited, JWT cookie set'],
      ['2', 'Redirected to /setup-mpin, set 4-digit PIN', 'MPIN hash stored, user redirected to /dashboard'],
      ['3', 'Browse /market, search for a stock', 'Live quote fetched from cache, company info displayed'],
      ['4', 'Click stock, opens /terminal/SYMBOL in new tab', 'Chart loads 1D data (5m candles), order panel initialised'],
      ['5', 'Enter quantity, click BUY (MARKET)', 'Balance checked → order filled → holdings updated → notification sent'],
      ['6', 'Visit /portfolio', 'Holdings displayed with live P&L, sector allocation, trade statistics'],
    ],
  ),

  h2('13.2 Setting a Price Alert'),
  makeTable(
    ['Step', 'Action', 'System Response'],
    [
      ['1', 'On /terminal/SYMBOL, click Bell icon', 'Alert popover opens, existing active alerts for that stock shown'],
      ['2', 'Choose Above/Below, enter target price, click Set Alert', 'POST /api/stocks/SYMBOL/alert → saved to price_alerts table'],
      ['3', 'Close browser, wait for price to move', 'Server checks every minute: if price crosses target, alert triggered'],
      ['4', 'Alert triggers during market hours', 'price_alerts.triggered = 1, notification inserted, in-app notification sent'],
      ['5', 'User opens app', 'Bell icon shows unread count; /notifications shows price alert message'],
    ],
  ),

  h2('13.3 Admin Workflow'),
  makeTable(
    ['Step', 'Action'],
    [
      ['1', 'Login with ADMIN_EMAIL credentials'],
      ['2', 'Navigate to /admin — see all user accounts, portfolio values, trade counts'],
      ['3', 'Click a user → detailed view: their holdings, P&L, transaction history'],
      ['4', 'Use "Reset Balance" to restore ₹10 lakh virtual balance'],
      ['5', 'Monitor platform stats: total trades, total users, top gainers/losers'],
    ],
  ),
  pageBreak(),

  // ── 14. Local Development ──────────────────────────────────
  h1('14. Local Development Setup'),

  h2('14.1 Prerequisites'),
  bullet('Node.js 22.5 or later (required for node:sqlite built-in module)'),
  bullet('npm 10 or later'),
  bullet('Git'),
  br(),

  h2('14.2 Setup Steps'),
  code('# 1. Clone the repository'),
  code('git clone https://github.com/kiddooboy/Paper-Portfolio.git'),
  code('cd Paper-Portfolio'),
  br(),
  code('# 2. Install dependencies'),
  code('cd client && npm install'),
  code('cd ../server && npm install'),
  br(),
  code('# 3. Configure environment'),
  code('cp server/.env.example server/.env'),
  code('# Edit server/.env — set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD'),
  br(),
  code('# 4. Start development servers'),
  code('# Terminal 1 — backend'),
  code('cd server && npm run dev'),
  br(),
  code('# Terminal 2 — frontend'),
  code('cd client && npm run dev'),
  br(),
  code('# App available at http://localhost:5173'),
  code('# API available at http://localhost:5000'),
  br(),

  h2('14.3 Seed Demo Data'),
  code('cd server && npm run seed'),
  p('Creates 5 sample users, 50 stocks, and 200 historical orders for testing.'),
  br(),

  h2('14.4 Production Build'),
  code('cd client && npm run build    # outputs client/dist/'),
  code('cd server && npm run build    # outputs server/dist/'),
  code('cd server && npm start        # serves both API + static frontend'),
  pageBreak(),

  // ── 15. Feature Matrix ─────────────────────────────────────
  h1('15. Feature Matrix'),
  makeTable(
    ['Feature', 'Status', 'Notes'],
    [
      ['User registration / login', 'Complete', 'Email+password, MPIN, Google Firebase'],
      ['Live stock quotes (NSE)', 'Complete', 'Yahoo Finance, 5s polling during market hours'],
      ['Candlestick / line charts', 'Complete', 'lightweight-charts v5, 1D/1W/1M/3M/1Y ranges'],
      ['Chart drawing tools (9 types)', 'Complete', 'Trendline, hline, channel, text, emoji, measure, zoom, magnet'],
      ['Technical indicators', 'Complete', 'SMA20, SMA50, EMA20, Bollinger Bands, RSI, MACD'],
      ['Market orders (buy/sell)', 'Complete', 'CNC and MIS product types'],
      ['Limit orders', 'Complete', 'Queued, checked every minute'],
      ['Stop-loss orders (SL / SL-M)', 'Complete', 'Trigger + optional limit price'],
      ['After Market Orders (AMO)', 'Complete', 'Queued for 9:15 AM next trading day'],
      ['GTT (Good Till Triggered)', 'Complete', 'Persistent trigger orders'],
      ['Intraday short selling (MIS)', 'Complete', 'Sell Now, Buy Later; 5× margin'],
      ['Portfolio analytics (P&L, XIRR)', 'Complete', 'Unrealised + realised, time-weighted returns'],
      ['Sector heatmap', 'Complete', '20 NSE sectors, live weighted change%'],
      ['Price alerts', 'Complete', 'Minute-by-minute check; in-app notification on trigger'],
      ['Watchlists', 'Complete', 'Multiple named lists, toggle bookmark from terminal'],
      ['Stock screener', 'Complete', 'Filter by PE, return, market cap, sector'],
      ['Community social feed', 'Complete', 'Posts, comments, upvotes; daily AI strategy bot'],
      ['AI chat (Claude)', 'Complete', 'Portfolio-aware context, streaming responses'],
      ['Leaderboard', 'Complete', 'Global P&L rankings'],
      ['Achievements / badges', 'Complete', '12 badge types (First Trade, 10-Bagger, etc.)'],
      ['SIP (Systematic Investment Plan)', 'Complete', 'Daily/weekly/monthly auto-buy'],
      ['Algorithmic trading', 'Partial', 'Strategy builder UI; execution engine in development'],
      ['Futures & Options (F&O)', 'Partial', 'Position tracking and Greeks; order placement limited'],
      ['Dark mode', 'Complete', 'Tailwind class-based, persisted in localStorage'],
      ['Fullscreen terminal', 'Complete', '?fullscreen=1 hides sidebar; link opens new tab'],
      ['Market depth', 'Complete', 'Simulated bid/ask table; collapsible accordion'],
      ['Notifications inbox', 'Complete', 'Order fills, price alerts, system messages'],
      ['Admin dashboard', 'Complete', 'User list, stats, balance reset, portfolio view'],
      ['Docker deployment', 'Complete', 'Single container, SQLite volume, GitHub Actions CI/CD'],
    ],
  ),
  pageBreak(),

  // ── Appendix ───────────────────────────────────────────────
  h1('Appendix — Key File Index'),
  makeTable(
    ['File', 'Purpose'],
    [
      ['client/src/App.tsx', 'SPA router — all 28 route definitions'],
      ['client/src/main.tsx', 'React entry point; axios withCredentials config'],
      ['client/src/pages/TerminalPage.tsx', 'Full trading terminal (chart, order form, market depth, alerts)'],
      ['client/src/pages/Dashboard.tsx', 'Home dashboard (portfolio card, heatmap, gainers/losers)'],
      ['client/src/components/StockChart.tsx', 'TradingView-compatible chart with drawing tools and indicators'],
      ['client/src/components/Layout.tsx', 'App shell; hides sidebar in fullscreen mode'],
      ['client/src/store/authStore.ts', 'Auth state + 401 interceptor for session management'],
      ['client/src/store/marketStore.ts', 'Live quote cache and market status polling'],
      ['client/tailwind.config.js', 'Groww-style design tokens (colours, fonts)'],
      ['client/vite.config.ts', 'Build config; dev proxy /api → localhost:5000; 6 manual chunks'],
      ['server/src/index.ts', 'Express setup, cron jobs, 2-tier market data poller, graceful shutdown'],
      ['server/src/db/index.ts', 'SQLite wrapper, full schema (40+ tables), indexes, migrations'],
      ['server/src/middleware/auth.ts', 'JWT generation, authMiddleware, adminMiddleware'],
      ['server/src/routes/orders.ts', 'Order placement, modification, cancellation'],
      ['server/src/routes/stocks.ts', 'Market data, sectors, search, price alerts'],
      ['server/src/routes/portfolio.ts', 'Portfolio summary with live enrichment and analytics'],
      ['server/src/routes/auth.ts', 'Register, login, MPIN, forgot-password endpoints'],
      ['server/src/routes/admin.ts', 'Admin user management and platform stats'],
      ['server/src/routes/ai.ts', 'Claude integration — chat and insights'],
      ['server/src/services/marketData.ts', 'Yahoo Finance wrapper, in-memory cache, stale-while-revalidate'],
      ['server/src/services/orderExecution.ts', 'Order fill scheduler — MARKET/LIMIT/SL/SL-M execution'],
      ['server/src/services/communityBot.ts', 'Daily AI strategy post via Claude API'],
      ['server/src/services/activityLogger.ts', 'Fire-and-forget audit log for all user actions'],
      ['docker-compose.yml', 'Production container config with SQLite volume mount'],
      ['.github/workflows/', 'GitHub Actions CI/CD — build, SSH deploy to EC2, health check'],
    ],
  ),
];

// ─────────────────────────────────────────────────────────────
// Generate Word Document
// ─────────────────────────────────────────────────────────────
async function generateDocx() {
  const doc = new Document({
    creator: 'Paper Portfolio',
    title: 'Paper Portfolio — Technical Architecture & Developer Reference',
    description: 'Full technical documentation for the Paper Portfolio paper trading platform',
    styles: {
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          run: { size: 32, bold: true, color: '00B386' },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          run: { size: 26, bold: true, color: '1B4F72' },
          paragraph: { spacing: { before: 300, after: 150 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          run: { size: 22, bold: true, color: '2C3E50' },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, right: 900, bottom: 1080, left: 900 },
        },
      },
      children: sections,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(`${OUT_DIR}/TechnicalDocument.docx`, buffer);
  console.log('✅  docs/TechnicalDocument.docx generated');
}

// ─────────────────────────────────────────────────────────────
// Generate HTML (source for PDF)
// ─────────────────────────────────────────────────────────────
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Paper Portfolio — Technical Documentation</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; background: white; }
  .cover { text-align: center; padding: 120px 60px 80px; page-break-after: always; }
  .cover h1 { font-size: 48pt; color: #00B386; margin-bottom: 16px; }
  .cover h2 { font-size: 20pt; color: #444; font-weight: 400; margin-bottom: 12px; }
  .cover .version { font-size: 12pt; color: #888; }
  h1 { font-size: 20pt; color: #00B386; border-bottom: 3px solid #00B386; padding-bottom: 8px; margin: 32px 0 16px; page-break-before: always; }
  h1:first-of-type { page-break-before: avoid; }
  h2 { font-size: 15pt; color: #1B4F72; margin: 24px 0 10px; }
  h3 { font-size: 12pt; color: #2C3E50; margin: 18px 0 8px; }
  p { margin-bottom: 10px; }
  ul { margin: 8px 0 12px 24px; }
  li { margin-bottom: 4px; }
  pre, code { font-family: 'Courier New', monospace; font-size: 9.5pt; background: #f4f6f8; color: #2E4057; padding: 2px 6px; border-radius: 3px; }
  pre { display: block; padding: 12px 16px; margin: 8px 0 12px; border-left: 4px solid #00B386; white-space: pre-wrap; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 10pt; }
  th { background: #1B4F72; color: white; padding: 8px 10px; text-align: left; font-size: 10pt; }
  td { padding: 7px 10px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f9fa; }
  .badge { display: inline-block; background: #00B386; color: white; padding: 2px 8px; border-radius: 12px; font-size: 9pt; }
  .page { padding: 48px 64px; max-width: 960px; margin: 0 auto; }
  @media print {
    h1 { page-break-before: always; }
    table { page-break-inside: avoid; }
    pre { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

<div class="cover">
  <h1>Paper Portfolio</h1>
  <h2>Technical Architecture &amp; Developer Reference</h2>
  <p class="version">Version 1.0 &nbsp;·&nbsp; May 2026</p>
</div>

<h1>1. Executive Summary</h1>
<p>Paper Portfolio is a full-stack Indian stock market paper trading platform that lets users practise equity trading with real-time NSE/BSE prices and zero financial risk. It mirrors the Groww brokerage experience — candlestick charts, order types, portfolio analytics, a community feed, and Claude-powered AI insights — all backed by a lightweight SQLite database on a single Node.js server.</p>
<table>
<tr><th>Property</th><th>Value</th></tr>
<tr><td>Primary language</td><td>TypeScript (client + server)</td></tr>
<tr><td>Frontend framework</td><td>React 18 + Vite 5</td></tr>
<tr><td>Backend framework</td><td>Express 4</td></tr>
<tr><td>Database</td><td>SQLite (Node.js built-in module)</td></tr>
<tr><td>Market data</td><td>Yahoo Finance via yahoo-finance2</td></tr>
<tr><td>AI integration</td><td>Anthropic Claude (claude-sonnet-4-x)</td></tr>
<tr><td>Authentication</td><td>JWT cookies + optional Firebase Google Sign-In</td></tr>
<tr><td>Deployment</td><td>Docker Compose on AWS EC2 / any VPS</td></tr>
<tr><td>Market coverage</td><td>NSE (~2 000 stocks), BSE (quotes)</td></tr>
<tr><td>Market hours</td><td>9:15 AM – 3:30 PM IST, weekdays</td></tr>
</table>

<h1>2. Repository Structure</h1>
<pre>Paper-Portfolio/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── pages/          # 28 page-level components
│   │   ├── components/     # 21 reusable UI components
│   │   ├── store/          # 6 Zustand state stores
│   │   └── lib/            # Utilities, Firebase init
│   ├── vite.config.ts
│   └── tailwind.config.js
├── server/
│   ├── src/
│   │   ├── routes/         # 27 Express route modules
│   │   ├── services/       # Market data, order exec, AI, email
│   │   ├── middleware/     # Auth guards
│   │   ├── db/             # SQLite schema + wrapper
│   │   └── scripts/        # Seed, reset utilities
│   └── data/               # papertrading.db (SQLite file)
├── docker-compose.yml
├── Dockerfile
└── .github/workflows/      # GitHub Actions CI/CD</pre>

<h1>3. Frontend Architecture</h1>
<h2>3.1 Technology Stack</h2>
<table>
<tr><th>Package</th><th>Version</th><th>Purpose</th></tr>
<tr><td>react</td><td>18.2.0</td><td>UI component framework</td></tr>
<tr><td>react-router-dom</td><td>6.22.3</td><td>Client-side routing (28 routes)</td></tr>
<tr><td>zustand</td><td>4.5.2</td><td>Lightweight global state management</td></tr>
<tr><td>axios</td><td>1.6.8</td><td>HTTP client (withCredentials for cookies)</td></tr>
<tr><td>lightweight-charts</td><td>5.1.0</td><td>TradingView-compatible OHLCV charts</td></tr>
<tr><td>recharts</td><td>2.12.3</td><td>Sector pie charts, P&amp;L graphs</td></tr>
<tr><td>tailwindcss</td><td>3.4.1</td><td>Utility-first CSS framework</td></tr>
<tr><td>lucide-react</td><td>0.363.0</td><td>Icon library</td></tr>
<tr><td>firebase</td><td>12.12.1</td><td>Google Sign-In authentication</td></tr>
<tr><td>@anthropic-ai/sdk</td><td>0.92.0</td><td>Claude AI chat integration</td></tr>
</table>

<h2>3.2 Zustand State Stores</h2>
<table>
<tr><th>Store</th><th>Key State</th><th>Key Methods</th></tr>
<tr><td>authStore</td><td>user, isAuthenticated, isInitializing</td><td>login, logout, updateBalance, loginMpin</td></tr>
<tr><td>marketStore</td><td>quotes{}, status, extraSymbols[]</td><td>addSymbols, fetchLive, getQuote, reset</td></tr>
<tr><td>portfolioStore</td><td>data (holdings + P&amp;L), loading</td><td>fetch(force?), reset</td></tr>
<tr><td>ordersStore</td><td>orders[], loading</td><td>fetch, reset</td></tr>
<tr><td>watchlistStore</td><td>watchlists[], items{}</td><td>fetch, add, remove, reset</td></tr>
<tr><td>notificationsStore</td><td>notifications[], unreadCount</td><td>fetch, markRead, reset</td></tr>
</table>

<h2>3.3 Design System</h2>
<table>
<tr><th>Token</th><th>Value</th><th>Usage</th></tr>
<tr><td>groww-primary</td><td>#00B386</td><td>Primary brand teal, buy buttons, links</td></tr>
<tr><td>groww-dark</td><td>#0B0F19</td><td>App background (dark mode)</td></tr>
<tr><td>groww-card</td><td>#1A1F2E</td><td>Card/panel background (dark mode)</td></tr>
<tr><td>gain</td><td>#00C087</td><td>Positive P&amp;L, green candles</td></tr>
<tr><td>loss</td><td>#EF4444</td><td>Negative P&amp;L, red candles</td></tr>
</table>

<h1>4. Backend Architecture</h1>
<h2>4.1 Server Startup Sequence</h2>
<ol style="margin:8px 0 16px 24px">
<li>Load .env (JWT_SECRET, ADMIN_EMAIL, SMTP credentials, Anthropic API key)</li>
<li>initSchema() — create all SQLite tables and indexes if not present</li>
<li>ingestSymbols() — background-fetch ~2 000 NSE stock records from Yahoo</li>
<li>seedCommunityIfEmpty() — one-time seed of sample community posts</li>
<li>startOrderExecutionScheduler() — begin cron that checks pending orders</li>
<li>Mount 27 route modules under /api/*</li>
<li>In production: serve Vite-built client/dist/ as static files</li>
<li>SPA fallback: non-/api GET requests return index.html</li>
</ol>

<h2>4.2 Scheduled Tasks</h2>
<table>
<tr><th>Schedule</th><th>Task</th><th>Condition</th></tr>
<tr><td>Every 60 seconds</td><td>Check price alert triggers</td><td>Market open only</td></tr>
<tr><td>Every 60 seconds</td><td>Order execution sweep (MARKET/LIMIT/SL fills)</td><td>Market open only</td></tr>
<tr><td>Every hour</td><td>Record portfolio snapshots</td><td>Market open only</td></tr>
<tr><td>Daily 8:00 AM IST</td><td>Post AI-generated trading strategy to community</td><td>Always</td></tr>
</table>

<h2>4.3 Market Data Polling</h2>
<table>
<tr><th>Tier</th><th>Symbols</th><th>Open</th><th>Closed</th></tr>
<tr><td>Tier 1 (fast)</td><td>Nifty50 + user holdings + watchlists</td><td>5 seconds</td><td>2 minutes</td></tr>
<tr><td>Tier 2 (slow)</td><td>All ~2 000 NSE stocks</td><td>5 minutes</td><td>30 minutes</td></tr>
</table>

<h1>5. Database Schema</h1>
<p>Single SQLite file at <code>server/data/papertrading.db</code>. WAL mode, foreign keys enforced, 5 s busy timeout, 24 performance indexes.</p>

<h2>5.1 Core Tables</h2>
<table>
<tr><th>Table</th><th>Key Columns</th><th>Purpose</th></tr>
<tr><td>users</td><td>email, password_hash, mpin_hash, balance REAL, role</td><td>Accounts. Default balance ₹10,00,000.</td></tr>
<tr><td>stocks</td><td>symbol UNIQUE, name, sector, pe_ratio, market_cap, roe, high_52w, low_52w</td><td>NSE stock master data with fundamentals.</td></tr>
<tr><td>holdings</td><td>user_id FK, symbol, quantity, avg_buy_price</td><td>Current equity holdings per user.</td></tr>
<tr><td>orders</td><td>user_id FK, symbol, type, transaction_type, quantity, limit_price, trigger_price, product_type, status</td><td>All orders (PENDING/FILLED/CANCELLED).</td></tr>
<tr><td>transactions</td><td>user_id FK, symbol, type, quantity, price, amount, executed_at</td><td>Immutable trade execution record.</td></tr>
<tr><td>price_alerts</td><td>user_id FK, symbol, target_price, condition (above/below), triggered</td><td>User price alerts checked every minute.</td></tr>
<tr><td>portfolio_history</td><td>user_id FK, total_value, cash_balance, recorded_at</td><td>Hourly snapshots for growth chart.</td></tr>
<tr><td>notifications</td><td>user_id FK, title, message, type, read</td><td>In-app notification inbox.</td></tr>
<tr><td>activity_log</td><td>user_id FK, action, details (JSON), ip_address</td><td>Full audit trail of user actions.</td></tr>
</table>

<h2>5.2 Advanced Feature Tables</h2>
<table>
<tr><th>Table</th><th>Purpose</th></tr>
<tr><td>mis_shorts</td><td>Intraday short positions. Auto-squared at 3:20 PM.</td></tr>
<tr><td>gtt_orders</td><td>Good Till Triggered — fire when price crosses target.</td></tr>
<tr><td>sip_schedules</td><td>Systematic Investment Plans (daily/weekly/monthly).</td></tr>
<tr><td>baskets / basket_items</td><td>Multi-stock order templates.</td></tr>
<tr><td>contests / contest_participants</td><td>Competitive trading with isolated virtual capital.</td></tr>
<tr><td>achievements / user_achievements</td><td>12 gamification badge types.</td></tr>
<tr><td>community_posts / community_votes</td><td>Social discussion feed with voting.</td></tr>
<tr><td>fo_positions / fo_orders</td><td>Futures &amp; Options positions with Greeks.</td></tr>
<tr><td>algo_strategies / algo_trades</td><td>Algorithmic strategy definitions and execution log.</td></tr>
</table>

<h1>6. API Reference</h1>
<h2>6.1 Authentication — /api/auth</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Auth</th><th>Description</th></tr>
<tr><td>POST</td><td>/register</td><td>None</td><td>Create account. Sets auth_token cookie.</td></tr>
<tr><td>POST</td><td>/login</td><td>None</td><td>Email/password login.</td></tr>
<tr><td>POST</td><td>/login-mpin</td><td>None</td><td>4-digit MPIN quick login.</td></tr>
<tr><td>POST</td><td>/set-mpin</td><td>Required</td><td>Set or change MPIN.</td></tr>
<tr><td>GET</td><td>/me</td><td>Required</td><td>Validate session; returns current user.</td></tr>
<tr><td>POST</td><td>/logout</td><td>Required</td><td>Clear auth cookie.</td></tr>
</table>

<h2>6.2 Market Data — /api/stocks</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td>GET</td><td>/market-status</td><td>Market open/closed flag, next open time.</td></tr>
<tr><td>GET</td><td>/search?q=</td><td>Search stocks by symbol or company name.</td></tr>
<tr><td>GET</td><td>/live</td><td>Bulk live quotes (Nifty50 + subscribed symbols).</td></tr>
<tr><td>GET</td><td>/sectors</td><td>Per-sector change%, gainers/losers count.</td></tr>
<tr><td>GET</td><td>/:symbol</td><td>Full quote + fundamentals for a stock.</td></tr>
<tr><td>GET</td><td>/:symbol/history</td><td>OHLCV data. Params: range, interval.</td></tr>
<tr><td>GET</td><td>/:symbol/depth</td><td>Simulated 5-level bid/ask market depth.</td></tr>
<tr><td>GET</td><td>/my-alerts</td><td>User's active price alerts.</td></tr>
<tr><td>POST</td><td>/:symbol/alert</td><td>Create price alert. Body: { targetPrice, condition }.</td></tr>
<tr><td>DELETE</td><td>/my-alerts/:id</td><td>Delete a price alert.</td></tr>
</table>

<h2>6.3 Orders — /api/orders</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td>GET</td><td>/</td><td>List user orders (paginated).</td></tr>
<tr><td>POST</td><td>/</td><td>Place order. Types: MARKET/LIMIT/SL/SL-M. Products: CNC/MIS.</td></tr>
<tr><td>GET</td><td>/mis-shorts</td><td>Active intraday short positions with live P&amp;L.</td></tr>
<tr><td>POST</td><td>/:id/cancel</td><td>Cancel a PENDING order.</td></tr>
</table>

<h1>7. Authentication &amp; Security</h1>
<table>
<tr><th>Mechanism</th><th>Detail</th></tr>
<tr><td>JWT tokens</td><td>HS256, 7-day expiry, HttpOnly SameSite=Strict cookies</td></tr>
<tr><td>Password hashing</td><td>bcryptjs, 10 salt rounds</td></tr>
<tr><td>MPIN hashing</td><td>bcryptjs, same strength as password</td></tr>
<tr><td>Google Sign-In</td><td>firebase-admin.verifyIdToken() on server side</td></tr>
<tr><td>Role-based access</td><td>user (default) vs admin — adminMiddleware on /api/admin/*</td></tr>
<tr><td>SQL injection</td><td>All queries use parameterised statements</td></tr>
<tr><td>XSS</td><td>HttpOnly cookies — JS cannot read auth token</td></tr>
<tr><td>Activity audit</td><td>All actions logged to activity_log table with IP</td></tr>
</table>

<h1>8. Deployment</h1>
<h2>8.1 Environment Variables</h2>
<table>
<tr><th>Variable</th><th>Required</th><th>Description</th></tr>
<tr><td>JWT_SECRET</td><td>Yes</td><td>Long random string for signing JWT tokens.</td></tr>
<tr><td>ADMIN_EMAIL</td><td>Yes</td><td>Email bootstrapped as admin on first run.</td></tr>
<tr><td>ADMIN_PASSWORD</td><td>Yes</td><td>Initial admin password.</td></tr>
<tr><td>ANTHROPIC_API_KEY</td><td>No</td><td>Required for AI chat and daily strategy posts.</td></tr>
<tr><td>FIREBASE_SERVICE_ACCOUNT</td><td>No</td><td>JSON for Google Sign-In support.</td></tr>
<tr><td>SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS</td><td>No</td><td>For password-reset OTP emails.</td></tr>
<tr><td>PORT</td><td>No</td><td>HTTP server port (default 5000).</td></tr>
</table>

<h2>8.2 CI/CD Pipeline</h2>
<p>GitHub Actions triggers on push to <code>main</code>:</p>
<ol style="margin:8px 0 16px 24px">
<li>Checkout code</li>
<li>SSH into EC2 instance</li>
<li>git pull latest</li>
<li>docker compose up --build -d</li>
<li>Health check on /api/stocks/market-status</li>
</ol>

<h1>9. Feature Matrix</h1>
<table>
<tr><th>Feature</th><th>Status</th><th>Notes</th></tr>
<tr><td>User registration / login</td><td><span class="badge">Complete</span></td><td>Email, MPIN, Google Firebase</td></tr>
<tr><td>Live stock quotes (NSE)</td><td><span class="badge">Complete</span></td><td>Yahoo Finance, 5 s polling</td></tr>
<tr><td>Candlestick / line charts</td><td><span class="badge">Complete</span></td><td>lightweight-charts v5, 5 range options</td></tr>
<tr><td>Chart drawing tools (9 types)</td><td><span class="badge">Complete</span></td><td>Trendline, hline, channel, text, emoji, measure, zoom, magnet</td></tr>
<tr><td>Technical indicators</td><td><span class="badge">Complete</span></td><td>SMA, EMA, Bollinger Bands, RSI, MACD</td></tr>
<tr><td>MARKET / LIMIT / SL / SL-M orders</td><td><span class="badge">Complete</span></td><td>CNC and MIS product types</td></tr>
<tr><td>GTT (Good Till Triggered)</td><td><span class="badge">Complete</span></td><td>Persistent trigger orders</td></tr>
<tr><td>Intraday short selling (MIS)</td><td><span class="badge">Complete</span></td><td>5× margin; auto square-off 3:20 PM</td></tr>
<tr><td>Portfolio analytics (P&amp;L, XIRR)</td><td><span class="badge">Complete</span></td><td>Unrealised + realised, sector allocation</td></tr>
<tr><td>Price alerts</td><td><span class="badge">Complete</span></td><td>Minute-by-minute check, in-app notification</td></tr>
<tr><td>Watchlists</td><td><span class="badge">Complete</span></td><td>Multiple named lists</td></tr>
<tr><td>Stock screener</td><td><span class="badge">Complete</span></td><td>Filter by PE, return, market cap, sector</td></tr>
<tr><td>AI chat (Claude)</td><td><span class="badge">Complete</span></td><td>Portfolio-aware context, streaming</td></tr>
<tr><td>Community social feed</td><td><span class="badge">Complete</span></td><td>Posts, votes, AI daily strategy bot</td></tr>
<tr><td>Leaderboard</td><td><span class="badge">Complete</span></td><td>Global P&amp;L rankings</td></tr>
<tr><td>Achievements / badges</td><td><span class="badge">Complete</span></td><td>12 badge types</td></tr>
<tr><td>Admin dashboard</td><td><span class="badge">Complete</span></td><td>User management, stats, balance reset</td></tr>
<tr><td>Docker / CI-CD deployment</td><td><span class="badge">Complete</span></td><td>GitHub Actions → EC2</td></tr>
<tr><td>Algorithmic trading</td><td>Partial</td><td>Strategy builder; execution engine in progress</td></tr>
<tr><td>Futures &amp; Options</td><td>Partial</td><td>Position tracking; full order flow limited</td></tr>
</table>

</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────
// Generate PDF via Puppeteer
// ─────────────────────────────────────────────────────────────
async function generatePdf() {
  const htmlPath = path.resolve(`${OUT_DIR}/TechnicalDocument.html`);
  fs.writeFileSync(htmlPath, HTML_CONTENT, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'shell',
    timeout: 90000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: `${OUT_DIR}/TechnicalDocument.pdf`,
    format: 'A4',
    margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
    printBackground: true,
  });
  await browser.close();
  fs.unlinkSync(htmlPath); // clean up temp HTML
  console.log('✅  docs/TechnicalDocument.pdf generated');
}

// ─────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────
(async () => {
  console.log('Generating technical documentation...');
  await generateDocx();
  await generatePdf();
  console.log('\n📄  Both documents saved to docs/');
})();
