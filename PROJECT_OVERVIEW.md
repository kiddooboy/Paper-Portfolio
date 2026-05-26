# Paper Portfolio — Project Overview

A full-stack **paper-trading platform** for Indian equities (NSE/BSE). Users get
₹1,00,000 of virtual cash to trade live market data with zero real-money risk.
Ships as a **website** (paperportfolio.in) and a **native Android app** (Capacitor).

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Client** | React 18 + TypeScript, Vite 7, Tailwind CSS, Zustand (state), React Router 6, Axios |
| **Charts** | lightweight-charts (price), Recharts (analytics) |
| **Mobile** | Capacitor 8 (Android) — App, StatusBar, SplashScreen, PushNotifications, Firebase Auth, native biometric |
| **Server** | Node.js (≥22.5 for `node:sqlite`), Express 4, TypeScript |
| **Database** | SQLite via built-in `node:sqlite` (`DatabaseSync`), wrapped for async/transaction ergonomics |
| **Market data** | yahoo-finance2 (live quotes, candles, search) |
| **Auth** | JWT (cookie on web + Bearer on app), bcrypt passwords, 4-digit MPIN, Firebase Google sign-in |
| **AI** | Anthropic Claude SDK (AI chat, news sentiment, AI Trade council) |
| **Notifications** | Firebase Cloud Messaging (push), nodemailer (email) |
| **Deploy** | Docker (`node:24-alpine`) + docker-compose, behind nginx + Let's Encrypt, on Amazon EC2 |

---

## 2. Repository Layout

```
Paper-Portfolio/
├── client/                 # React + Vite SPA (also the Capacitor web layer)
│   ├── src/
│   │   ├── pages/          # ~32 route pages (Dashboard, Market, Portfolio, Orders, …)
│   │   ├── components/     # Layout, Sidebar, MobileNav, charts, ProductTour, …
│   │   ├── store/          # Zustand stores + bootstrap()
│   │   ├── lib/            # axios setup, firebase, googleAuth, authToken, biometric, push, utils
│   │   └── App.tsx / main.tsx
│   ├── android/            # Capacitor Android project (Gradle, signing config)
│   └── .env.app            # VITE_API_URL for the app build (build:app)
├── server/
│   └── src/
│       ├── routes/         # 27 Express routers (REST API under /api/*)
│       ├── services/       # marketData, orderExecution, fees, indicators, push, aiTrader/, …
│       ├── middleware/     # auth (JWT cookie OR Bearer)
│       ├── lib/            # firebaseAdmin
│       └── db/index.ts     # schema, migrations, WrappedDatabase
├── Dockerfile / docker-compose.yml
└── deploy.sh
```

---

## 3. Client Pages (high level)

Trading: **Dashboard, MarketExplorer, StockDetail, TerminalPage, OrdersPage,
PositionsPage (holdings + intraday), PortfolioPage, PortfolioCompassPage (Monte-Carlo),
WatchlistPage, ScreenerPage, SectorsPage, OptionsPage, WalletPage**.
Discovery/learning: **NewsPage, LearnPage (academy), CompanyPage, LeaderboardPage,
AchievementsPage, CommunityPage, AIChatPage, DailyInsightsPage**.
Auth: **LandingPage, Login, Register, MpinLoginPage, SetupMpinPage, ForgotPasswordPage**.
Admin: **AdminPage, AdminAnalyticsPage**.

State is in Zustand stores: `auth`, `portfolio`, `market`, `orders`, `watchlist`,
`notifications`, orchestrated by `store/bootstrap.ts` (validates session via
`/api/auth/me`, pre-fetches data, starts adaptive market polling).

---

## 4. Server API (routers under `/api`)

`auth, stocks, orders, portfolio, watchlists, notifications, leaderboard, admin,
insights, ai, wallet, monte-carlo, news, market, gtt, collections, contests,
achievements, sip, baskets, corporate-actions, research, strategies, community,
fo, algo, learn`.

Key services: `marketData` (two-tier live-quote poller + cache, IST market hours),
`orderExecution` (scheduler: market-open sweep, intraday fills, MIS square-off,
trailing stops, GTT expiry, portfolio snapshots), `fees` (brokerage/STT/GST/stamp),
`indicators` (RSI/MACD/EMA/SMA/VWAP/ATR/Bollinger/Supertrend), `push` (FCM),
`aiTrader/` (autonomous trading engine — see §7).

---

## 5. Data Model (core tables)

`users` (balance, role, mpin_hash, firebase_uid, tour_seen), `holdings`
(qty, avg_buy_price — charges folded into cost basis), `orders` (MARKET/LIMIT/
SL/SL-M, GTT, AMO, bracket target+SL via `parent_order_id`, trailing_pct),
`transactions` (fee breakdown + net_amount), `trade_pnl` (realized round-trips),
`mis_shorts` (intraday short positions), `watchlist_items`, `price_alerts`
(price / pct-move / indicator conditions), `notifications`, `device_tokens` (FCM),
`community_posts`/`community_votes`, `index_history`, plus AI-Trade tables
(`ai_trader_config`, `ai_positions`, `ai_console_log`).

---

## 6. Authentication & Sessions

- **Password** (bcrypt) and **4-digit MPIN** (quick login) and **Google** (Firebase).
- Server issues a **JWT**: set as an httpOnly cookie (web, same-origin) **and**
  returned in the response body as `token`.
- The client captures `token` from any `/api/auth/*` response and stores it
  (`pp_auth_token` in localStorage); an axios request interceptor sends it as
  `Authorization: Bearer` — required by the Android app, whose `https://localhost`
  origin can't send the cookie cross-site.
- `authMiddleware` accepts **either** the cookie or the Bearer token.
- Google sign-in: **web** uses `signInWithPopup` (popup-first — redirect loses
  the result across the Firebase auth domain); **app** uses the native
  `@capacitor-firebase/authentication` flow (`useCredentialManager: false`).
  The server verifies the Firebase ID token with `firebase-admin`.

> **Android note:** native Google sign-in requires the signing certificate's
> SHA-1 to be registered in Firebase. The **debug** SHA-1 is registered (debug
> APK works); the **release** SHA-1 must be added in Firebase Console + a refreshed
> `google-services.json` before release-APK Google sign-in works.

---

## 7. AI Trade (autonomous engine) — on the `UAT` branch

An autonomous, multi-agent intraday trading engine lives in
`server/src/services/aiTrader/`:

- **Discovery** — screens the whole polled NSE universe for the strongest
  intraday long setups (no user watchlist).
- **Signals** — deterministic agents (trend/momentum/volatility/breakout/volume/VWAP).
- **Council** — a Claude (Opus) multi-agent deliberation makes the final call;
  the debate streams to a live console. Falls back to deterministic scoring if the
  API is unavailable.
- **Risk profiles** — Low/Medium/High drive ATR-based stops, reward:risk targets,
  risk-per-trade position sizing, and portfolio risk caps.
- **Broker adapter** — `PaperBroker` today (virtual money); a `BrokerAdapter`
  interface lets real brokers (Groww/Zerodha/…) plug in later.

It is **removed from `main`** (the page/route/nav are gone and the engine is not
started in production) and **isolated on the `UAT` branch**, deployed separately at
`uat.paperportfolio.in` (container `ppuat`, port 5001, its own database). It is
merged to `main` only on explicit approval.

---

## 8. Build & Deploy

- **Website build:** `npm --prefix client run build` → relative `/api` (same-origin).
- **App build:** `npm --prefix client run build:app` → bakes
  `VITE_API_URL=https://paperportfolio.in`, then `npx cap sync android` +
  Gradle `assembleDebug` / `assembleRelease`.
- **Production web:** Docker image (`node:24-alpine`) via docker-compose on EC2;
  nginx terminates TLS for `paperportfolio.in` → `localhost:5000`. Deploy:
  `git pull && docker compose build && docker compose up -d` (build separately
  from recreate to avoid OOM-killing the live container on the 1.9 GB box; 5 GB
  swap added).

---

## 9. Audit Notes (this pass)

A focused bug audit was performed across the auth, money, and market-data paths.
The codebase is mature and the critical paths are well-guarded (parameterised SQL,
transactional fills, charge-inclusive cost basis, division-by-zero guards, timer
cleanup, try/catch around storage).

**Fixed:** bracket orders lacked **OCO (one-cancels-other)** cleanup — a BUY with
both take-profit and stop-loss left both child SELL legs PENDING; filling one now
cancels its sibling (`routes/orders.ts` `fillOrder`). The pre-existing holdings
check already prevented catastrophic overselling, so the impact was a stale leg
that could fire on later-acquired shares.

**No other functional bugs found.** Both client and server typecheck clean.
