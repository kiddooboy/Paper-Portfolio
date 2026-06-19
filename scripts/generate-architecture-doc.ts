import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
  UnderlineType,
} from "docx";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BRAND_BLUE = "1E40AF";   // Tailwind blue-800
const LIGHT_BLUE = "DBEAFE";   // Tailwind blue-100
const HEADER_BG  = "1E3A5F";   // dark navy for table headers
const WHITE      = "FFFFFF";
const GREY_BG    = "F1F5F9";   // light slate for alt rows

function h1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_BLUE },
    },
    run: { color: BRAND_BLUE, bold: true, size: 32 },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    run: { color: BRAND_BLUE, bold: true, size: 26 },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    run: { color: "334155", bold: true, size: 22 },
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: "1E293B" })],
    spacing: { after: 120 },
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: "1E293B" })],
    bullet: { level },
    spacing: { after: 80 },
  });
}

function code(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "0F172A" })],
    shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
    spacing: { after: 40 },
    indent: { left: convertInchesToTwip(0.3) },
  });
}

function gap(): Paragraph {
  return new Paragraph({ text: "", spacing: { after: 120 } });
}

function bold(text: string): TextRun {
  return new TextRun({ text, bold: true, size: 22, color: "1E293B" });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 20 })],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { type: ShadingType.CLEAR, fill: HEADER_BG },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function cell(text: string, shade?: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, color: "1E293B" })],
      }),
    ],
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  });
}

function stackTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(h => headerCell(h)),
        tableHeader: true,
      }),
      ...rows.map((row, i) =>
        new TableRow({
          children: row.map(t => cell(t, i % 2 === 1 ? GREY_BG : WHITE)),
        })
      ),
    ],
  });
}

// ─── Document content ────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Paper Portfolio",
  title: "Paper Portfolio — Overall Architecture",
  description: "Full-stack architecture overview",
  styles: {
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        run: { color: BRAND_BLUE, bold: true, size: 32 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        run: { color: BRAND_BLUE, bold: true, size: 26 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        run: { color: "334155", bold: true, size: 22 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.1),
            right: convertInchesToTwip(1.1),
          },
        },
      },
      children: [

        // ── Cover ──────────────────────────────────────────────────────────
        new Paragraph({
          children: [new TextRun({ text: "Paper Portfolio", bold: true, size: 52, color: BRAND_BLUE })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 160 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Overall Architecture", bold: true, size: 36, color: "334155" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Full-stack design reference for the paper trading platform", size: 24, color: "64748B", italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Generated: ${new Date().toDateString()}`, size: 20, color: "94A3B8" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 1200 },
        }),
        new Paragraph({ text: "", pageBreakBefore: true }),

        // ── 1. What it is ──────────────────────────────────────────────────
        h1("1. Project Overview"),
        body(
          "Paper Portfolio is a full-stack paper trading platform for Indian equities (NSE/BSE). " +
          "Users receive ₹1,00,000 of virtual capital and can trade using real-time market data. " +
          "The product ships as both a progressive web application (paperportfolio.in) and a native " +
          "Android app built with Capacitor."
        ),
        gap(),

        // ── 2. Repository layout ───────────────────────────────────────────
        h1("2. Repository Structure"),
        body("The project is a monorepo with three top-level directories:"),
        bullet("client/  — React 18 + TypeScript frontend; also contains the Capacitor Android project"),
        bullet("server/  — Node.js / Express backend with all API routes, services, and the SQLite database"),
        bullet("shared/  — Shared TypeScript types used by both client and server"),
        gap(),
        body("Key root-level files:"),
        bullet("Dockerfile / docker-compose.yml — multi-stage image; single container on port 5000"),
        bullet("deploy.sh — EC2 deployment automation"),
        bullet("package.json — root workspace with docx and puppeteer for documentation generation"),
        gap(),

        // ── 3. Tech stack ──────────────────────────────────────────────────
        h1("3. Technology Stack"),

        h2("3.1 Frontend"),
        stackTable(
          ["Layer", "Technology"],
          [
            ["Framework", "React 18 + TypeScript, built with Vite 7"],
            ["Styling", "TailwindCSS 3 + Lucide React icons"],
            ["State management", "Zustand 4 — 7 stores (auth, market, portfolio, orders, watchlist, notifications)"],
            ["Routing", "React Router v6 with lazy-loaded pages"],
            ["HTTP client", "Axios 1.6"],
            ["Price charts", "lightweight-charts 5 (TradingView-style candlesticks)"],
            ["Analytics charts", "Recharts 2 (waterfall, pie, line)"],
            ["Mobile bridge", "Capacitor 8 — native biometric, push notifications, status bar, splash screen"],
            ["Auth (mobile)", "@capacitor-firebase/authentication + Firebase SDK 12"],
          ]
        ),
        gap(),

        h2("3.2 Backend"),
        stackTable(
          ["Layer", "Technology"],
          [
            ["Runtime", "Node.js ≥22.5 (uses native node:sqlite)"],
            ["Framework", "Express 4 + TypeScript"],
            ["Database", "SQLite via node:sqlite — WAL mode, no external DB required"],
            ["Auth", "JWT (httpOnly cookie for web, Bearer for app), bcryptjs 2"],
            ["Validation", "Zod 3"],
            ["Market data", "yahoo-finance2 3 (quotes, historical bars, search, fundamentals)"],
            ["Scheduling", "node-cron 3 (market-open sweep, MIS square-off, GTT expiry)"],
            ["AI integration", "@anthropic-ai/sdk 0.92 (Claude multi-agent council + chat)"],
            ["Push notifications", "Firebase Admin 13 (FCM)"],
            ["Email (OTP)", "Nodemailer 8"],
            ["Real-time", "ws 8 (WebSocket tick broadcast)"],
            ["News", "rss-parser 3"],
          ]
        ),
        gap(),

        h2("3.3 Deployment"),
        stackTable(
          ["Component", "Technology"],
          [
            ["Container", "Docker — node:24-alpine multi-stage build"],
            ["Orchestration", "docker-compose — 1 service, port 5000"],
            ["Reverse proxy", "nginx — TLS termination + HTTP → localhost:5000"],
            ["TLS", "Let's Encrypt (Certbot)"],
            ["Hosting", "Amazon EC2 (2 GB RAM + 5 GB swap), SQLite on EBS volume"],
            ["UAT environment", "Separate EC2 container on port 5001 — uat.paperportfolio.in"],
          ]
        ),
        gap(),

        // ── 4. Authentication ──────────────────────────────────────────────
        h1("4. Authentication & Authorization"),
        body("Three login methods feed the same JWT session:"),
        bullet("Email + password — bcrypt-hashed, standard registration flow"),
        bullet("4-digit MPIN — quick re-login stored as a bcrypt hash in the users table"),
        bullet("Google Sign-In — Firebase Auth (web: popup; Android: native credential manager)"),
        gap(),
        body("Session tokens:"),
        bullet("Web: JWT stored as an httpOnly, secure, sameSite=lax cookie (auth_token)"),
        bullet("App: JWT returned in the response body → stored in localStorage as pp_auth_token → sent as Authorization: Bearer"),
        bullet("The auth middleware accepts either channel, which is necessary because Android cannot set same-site cookies cross-origin"),
        bullet("The first user registered at ADMIN_EMAIL is automatically granted role = 'admin'"),
        gap(),

        // ── 5. Market data ─────────────────────────────────────────────────
        h1("5. Market Data & Real-time Updates"),
        body("All market data comes from Yahoo Finance (no paid API key required). The server applies a two-tier caching strategy to stay within rate limits while keeping prices live:"),
        gap(),
        stackTable(
          ["Tier", "Frequency", "Symbols covered"],
          [
            ["Tier 1 — Hot path", "Every 10 seconds during NSE hours", "~180: NIFTY50 + top 150 by turnover + every symbol any user holds, watches, or is currently viewing"],
            ["Tier 2 — Cold path", "Every 60 seconds", "Full NSE universe (~2,000 symbols) — keeps long-tail stocks fresh for P&L calculations"],
          ]
        ),
        gap(),
        body("Market hours are IST 9:15 AM – 3:30 PM. Outside hours both tiers slow to 5-minute intervals. NSE trading holidays are fetched daily and polling is skipped on those days."),
        gap(),
        body("Real-time push:"),
        bullet("WebSocket tick broadcast (tickBroadcast.ts) fans out Tier 1 results to all connected tabs"),
        bullet("The client also keeps a 10-second HTTP fallback poll so a dead WebSocket connection never stalls the UI"),
        gap(),

        // ── 6. Order execution ─────────────────────────────────────────────
        h1("6. Order Execution & Trading Logic"),

        h2("6.1 Order Types"),
        stackTable(
          ["Type", "Behaviour"],
          [
            ["MARKET", "Instant fill at the last traded price"],
            ["LIMIT", "Held pending until the price crosses the specified level"],
            ["SL (Stop-Loss)", "Triggers a MARKET fill when price touches trigger_price"],
            ["SL-M", "Triggers a LIMIT fill at trigger_price, fills at limit_price or better"],
          ]
        ),
        gap(),

        h2("6.2 Product Types"),
        stackTable(
          ["Product", "Behaviour"],
          [
            ["CNC", "Carry-forward — position lives indefinitely"],
            ["MIS", "Margin Intraday Square-off — auto-closed at 3:20 PM IST every day"],
            ["DAY", "US markets — auto-squared at US market close"],
            ["GTC", "Good Till Cancelled — US markets, lives until manually cancelled"],
          ]
        ),
        gap(),

        h2("6.3 Advanced Order Features"),
        bullet("Bracket Orders — one BUY spawns two child SELL legs (take-profit + stop-loss) with OCO logic: when one leg fills the other is auto-cancelled"),
        bullet("Trailing Stops — the stop-loss anchor trails up/down by N% as price moves favourably"),
        bullet("GTT (Good Till Trigger) — conditional orders valid until an expiry date"),
        bullet("AMO (After Market Order) — queued and filled at the next market open"),
        gap(),

        h2("6.4 Scheduled Order Execution (Cron Jobs)"),
        bullet("9:15 AM IST — Market open: sweep all pending and GTT orders, fill eligible MARKET / LIMIT / SL orders"),
        bullet("9:15 AM – 3:20 PM IST — Every 10 seconds: intraday fill checks and trailing stop updates"),
        bullet("3:20 PM – 3:30 PM IST — Auto-square-off all open MIS positions at LTP"),
        bullet("3:30 PM IST — GTT expiry cleanup and daily portfolio snapshot"),
        gap(),

        h2("6.5 Cost Basis & P&L"),
        bullet("Brokerage, STT, GST, and stamp duty are folded into the average buy price rather than shown as separate deductions"),
        bullet("Formula: avg_buy_price = (qty × price + total_charges) / qty"),
        bullet("Unrealised P&L = (current_price − avg_buy_price) × quantity"),
        bullet("Realised P&L is captured in the trade_pnl table only when a matched buy→sell round-trip closes"),
        gap(),

        // ── 7. Database ────────────────────────────────────────────────────
        h1("7. Database"),
        body("The entire application uses a single SQLite file (papertrade.db) via Node's built-in node:sqlite module. WAL mode and a 5-second busy timeout provide safe concurrent reads. Schema migrations run as idempotent ALTER TABLE statements on every server boot."),
        gap(),
        h2("Core Tables"),
        stackTable(
          ["Table", "Purpose"],
          [
            ["users", "Auth credentials, MPIN hash, wallet balance, Firebase UID, AI credit counter, role"],
            ["holdings", "Open CNC positions per user (symbol, quantity, avg_buy_price)"],
            ["orders", "All order records — type, status, price, trigger/target, charges, bracket/trailing links"],
            ["transactions", "Fill records — quantity, executed price, individual charge breakdown"],
            ["trade_pnl", "Realised P&L for closed round-trip trades"],
            ["mis_shorts", "Open intraday short positions"],
            ["watchlists / watchlist_items", "User-curated symbol lists"],
            ["portfolio_history", "Daily P&L snapshots for history charting"],
            ["nse_holidays", "Trading calendar fetched from NSE"],
            ["symbol_sentiment", "Daily aggregated news sentiment score per symbol"],
            ["daily_recommendations", "Claude's morning stock picks (one row per date)"],
            ["price_alerts", "Price and indicator-based alert definitions"],
            ["ai_trader_config / ai_positions / ai_console_log", "AI trading engine state (UAT branch only)"],
          ]
        ),
        gap(),

        // ── 8. Frontend architecture ───────────────────────────────────────
        h1("8. Frontend Architecture"),

        h2("8.1 Pages (32+)"),
        stackTable(
          ["Category", "Pages"],
          [
            ["Auth", "LandingPage, Login, Register, MpinLogin, SetupMpin, ForgotPassword"],
            ["Trading", "Dashboard, MarketExplorer, StockDetail, Terminal, Orders, Positions, Portfolio, Watchlist, Screener"],
            ["Analytics", "PortfolioCompass (Monte-Carlo), Sectors, Leaderboard, DailyRecommendations"],
            ["Discovery", "News, Learn (academy), Company, GlobalMarkets"],
            ["Social", "Community, Achievements"],
            ["AI", "AIChatPage (Claude conversational assistant)"],
            ["Admin", "AdminPage (user management), AdminAnalytics"],
          ]
        ),
        gap(),

        h2("8.2 Zustand Stores"),
        bullet("authStore — current user session, JWT token, role"),
        bullet("marketStore — live quotes cache, market status, last tick timestamp"),
        bullet("portfolioStore — holdings, calculated P&L, history snapshots"),
        bullet("ordersStore — pending and filled orders, intraday day-positions"),
        bullet("watchlistStore — user watchlists"),
        bullet("notificationsStore — toast notification queue"),
        gap(),

        h2("8.3 Bootstrap Flow (bootstrap.ts)"),
        body("On every login or page refresh:"),
        bullet("1. Validate session via GET /api/auth/me"),
        bullet("2. Pre-fetch portfolio, watchlists, and market status"),
        bullet("3. Start adaptive market polling (10 s during hours, 5 min outside)"),
        bullet("4. Optionally open WebSocket tick stream"),
        bullet("5. Install window-focus revalidation (re-fetch when tab becomes active)"),
        gap(),

        // ── 9. API routes ──────────────────────────────────────────────────
        h1("9. API Routes (27+ Routers)"),
        stackTable(
          ["Router prefix", "Key endpoints"],
          [
            ["/api/auth", "POST /register, /login, /login-mpin, /set-mpin, /login-google | GET /me, /logout"],
            ["/api/stocks", "GET /search, /market-status, /live, /:symbol, /indices, /us/indices | POST /subscribe (SSE)"],
            ["/api/orders", "POST / (place order) | GET / (list), /day-positions | PATCH /:id | DELETE /:id"],
            ["/api/portfolio", "GET / (holdings + P&L), /history (snapshots), /stats (Sharpe etc.)"],
            ["/api/watchlists", "CRUD for lists and items"],
            ["/api/market", "GET /indices, /sector-allocation"],
            ["/api/news", "GET / (aggregated + sentiment), /:symbol"],
            ["/api/ai", "POST /chat (streaming Claude), /analyze, /recommend (council — UAT)"],
            ["/api/admin", "GET /users, /analytics | PATCH /users/:id/role | DELETE /users/:id"],
            ["Others", "/notifications, /leaderboard, /contests, /achievements, /community, /wallet, /baskets, /collections, /learn, /research"],
          ]
        ),
        gap(),

        // ── 10. Key integrations ───────────────────────────────────────────
        h1("10. Key External Integrations"),
        stackTable(
          ["Integration", "Purpose", "Cost"],
          [
            ["Yahoo Finance (yahoo-finance2)", "Live quotes, OHLCV history, fundamentals, indices", "Free"],
            ["Firebase Auth", "Google Sign-In identity verification", "Free tier"],
            ["Firebase Admin (FCM)", "Push notifications to Android devices", "Free tier"],
            ["Anthropic Claude API", "Daily stock picks (Haiku), AI chat (Haiku), trade council (Opus — UAT)", "Pay-per-token"],
            ["Nodemailer (SMTP)", "OTP emails for password reset", "Depends on SMTP provider"],
            ["RSS Parser", "News feed aggregation (ET, Moneycontrol, LiveMint, Google News)", "Free"],
            ["NSE India website", "Trading holiday calendar", "Free (scraped)"],
            ["Capacitor", "Bridge to native Android APIs (biometric, push, status bar)", "Free / open source"],
          ]
        ),
        gap(),

        // ── 11. AI systems ─────────────────────────────────────────────────
        h1("11. AI Systems"),

        h2("11.1 Daily Stock Picks (Production)"),
        body(
          "A cron job runs at 8:45 AM IST every trading day. It assembles a context bundle containing " +
          "Indian index snapshots, global cues (S&P 500, NASDAQ, Nikkei, FTSE), the top 30 positive-momentum NSE stocks " +
          "with full technicals (RSI, MACD, EMA, Supertrend, Bollinger, ATR), and per-symbol sentiment scores. " +
          "This bundle is sent to Claude Haiku which returns 5 long picks with entry, target, stop, and rationale. " +
          "Results are upserted into the daily_recommendations table and shown on the Daily Recommendations page."
        ),
        gap(),

        h2("11.2 AI Chat Assistant (Production)"),
        body(
          "Users can chat with a Claude Haiku assistant that has access to their personal portfolio context: " +
          "actual holdings, P&L, sector weights, recent orders, current market indices, and news sentiment for held symbols. " +
          "Usage is metered (10 credits per user) and tracked in users.ai_credits_used."
        ),
        gap(),

        h2("11.3 AI Trade Council (UAT Branch Only)"),
        body(
          "An autonomous trading engine that screens the NSE universe with deterministic signal agents " +
          "(trend, momentum, volatility, breakout, volume, VWAP), reduces candidates to a high-confidence shortlist, " +
          "and then runs a Claude Opus multi-agent council debate (5 specialised agents: Market Analysis, Momentum, " +
          "Risk Management, Strategy, Sentiment). The council outputs a structured verdict and the PaperBroker executes " +
          "the resulting paper trades. The live agent debate is streamed to the UI console in real time. " +
          "This feature is isolated to the UAT branch and never deployed to production."
        ),
        gap(),

        // ── 12. Build & deployment ─────────────────────────────────────────
        h1("12. Build & Deployment"),

        h2("12.1 Web Build"),
        bullet("npm --prefix client run build → Vite outputs to client/dist/ with relative /api URLs"),
        bullet("The Express server serves client/dist/ as static files in production, so a single container handles both API and frontend"),
        gap(),

        h2("12.2 Android Build"),
        bullet("npm --prefix client run build:app → injects VITE_API_URL=https://paperportfolio.in"),
        bullet("npx cap sync android → copies web assets into the Capacitor Android project"),
        bullet("Gradle builds the debug or release APK from the android/ folder"),
        gap(),

        h2("12.3 Docker & EC2"),
        bullet("Multi-stage Dockerfile: build stage (install + compile) → runtime stage (node:24-alpine, ~200 MB image)"),
        bullet("docker-compose mounts ./server/data for SQLite persistence and ./firebase-service-account.json (read-only)"),
        bullet("EC2 instance: 2 GB RAM + 5 GB swap (swap is essential on the t3.small-equivalent box)"),
        bullet("nginx handles TLS termination, forwards HTTP(S) → localhost:5000; proxy_buffering off for the SSE route"),
        bullet("UAT: identical stack on port 5001 pointing at a separate SQLite database"),
        gap(),

        h2("12.4 Environment Variables"),
        stackTable(
          ["Variable", "Where used", "Purpose"],
          [
            ["JWT_SECRET", "server/.env", "Signing and verifying auth tokens"],
            ["ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME", "server/.env", "Auto-bootstrap the first admin account"],
            ["FIREBASE_SERVICE_ACCOUNT", "server/.env", "One-line JSON for Firebase Admin SDK"],
            ["SMTP_HOST / SMTP_USER / SMTP_PASS", "server/.env", "OTP email delivery"],
            ["VITE_API_URL", "client/.env.app", "API base URL for the Android build (production URL)"],
          ]
        ),
        gap(),

        // ── 13. Key design decisions ───────────────────────────────────────
        h1("13. Key Design Decisions"),
        bullet("SQLite over PostgreSQL — zero external dependencies; WAL mode provides safe multi-reader concurrency; migrations run as idempotent ALTERs on boot"),
        bullet("Two-tier JWT — httpOnly cookie for the web (XSS-safe, SameSite=Lax), Bearer token for Android (cross-origin without a shared domain)"),
        bullet("Charge-inclusive cost basis — brokerage and taxes are folded into avg_buy_price so displayed P&L is always net, matching how Indian brokers report"),
        bullet("IST-aware caching — poll frequency and cron schedules are tied to the NSE trading calendar; the server fetches the holiday list from NSE daily with a hardcoded fallback"),
        bullet("Lazy-loaded routes — critical auth pages are eagerly bundled; all 32+ other pages are lazy-loaded via React.lazy to minimise first-load bundle size"),
        bullet("AI isolation — the autonomous trade engine lives exclusively on the UAT branch; its tables, routes, nav links, and engine startup are not present in the main/production branch"),
        bullet("Monorepo — single docker-compose deploy for the entire stack; shared/types.ts enforces a single source of truth for data contracts between client and server"),
        gap(),

        // ── 14. Entry points ───────────────────────────────────────────────
        h1("14. Entry Points & Service Connections"),

        h2("Server (server/src/index.ts)"),
        code("1. Load .env variables"),
        code("2. initSchema() → create tables + run idempotent migrations"),
        code("3. Mount Express routers (/api/auth, /api/orders, /api/stocks, …)"),
        code("4. Start cron scheduler (9:15 AM open, 3:20 PM MIS close, 3:30 PM GTT expiry)"),
        code("5. Start market data pollers (Tier 1 every 10 s, Tier 2 every 60 s during hours)"),
        code("6. Start symbol ingest (NSE + US universes refreshed daily)"),
        code("7. Listen on PORT (default 5000)"),
        gap(),

        h2("Client (client/src/main.tsx)"),
        code("1. React.createRoot()"),
        code("2. App.tsx loads → useAuthStore().bootstrap()"),
        code("3.   GET /api/auth/me → validate JWT"),
        code("4.   Fetch portfolio, watchlists, market status"),
        code("5.   Start adaptive market polling"),
        code("6. React Router renders the matched lazy page"),
        gap(),

        h2("Service Dependency Map"),
        bullet("marketData ← yahoo-finance2 (live quotes)"),
        bullet("orderExecution ← marketData (price checks) + fees (charge calc) + indicators (trailing stops)"),
        bullet("API routes ← services ← db (SQLite queries)"),
        bullet("Client ← Axios (REST) + EventSource (SSE ticks)"),
        bullet("Push notifications ← push.ts (FCM) + mailer.ts (email OTP)"),
        bullet("AI systems ← @anthropic-ai/sdk (Haiku for picks/chat, Opus for council)"),
        gap(),

        // ── Footer ─────────────────────────────────────────────────────────
        new Paragraph({
          children: [
            new TextRun({ text: "Paper Portfolio — Architecture Reference  |  ", size: 18, color: "94A3B8" }),
            new TextRun({ text: `Generated ${new Date().toDateString()}`, size: 18, color: "94A3B8" }),
          ],
          alignment: AlignmentType.CENTER,
          border: {
            top: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
          },
          spacing: { before: 400 },
        }),
      ],
    },
  ],
});

// ─── Write file ───────────────────────────────────────────────────────────────

const outPath = path.join(process.cwd(), "docs", "Architecture.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Saved → ${outPath}`);
});
