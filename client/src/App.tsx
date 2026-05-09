import { Routes, Route } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import { useAuthStore } from './store/authStore';
import { bootstrap, teardown, installFocusRevalidation } from './store/bootstrap';

// ── Critical path: load eagerly (these pages are hit immediately on first visit) ──
import LandingPage    from './pages/LandingPage';
import Login          from './pages/Login';
import Register       from './pages/Register';
import MpinLoginPage  from './pages/MpinLoginPage';
import SetupMpinPage  from './pages/SetupMpinPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

// ── All authenticated pages: lazy-load on demand ──
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const MarketExplorer     = lazy(() => import('./pages/MarketExplorer'));
const TerminalPage       = lazy(() => import('./pages/TerminalPage'));
const StockDetail        = lazy(() => import('./pages/StockDetail'));
const PortfolioPage      = lazy(() => import('./pages/PortfolioPage'));
const PortfolioCompassPage = lazy(() => import('./pages/PortfolioCompassPage'));
const PositionsPage      = lazy(() => import('./pages/PositionsPage'));
const OrdersPage         = lazy(() => import('./pages/OrdersPage'));
const WatchlistPage      = lazy(() => import('./pages/WatchlistPage'));
const LeaderboardPage    = lazy(() => import('./pages/LeaderboardPage'));
const NotificationsPage  = lazy(() => import('./pages/NotificationsPage'));
const AdminPage          = lazy(() => import('./pages/AdminPage'));
const AIChatPage         = lazy(() => import('./pages/AIChatPage'));
const SectorsPage        = lazy(() => import('./pages/SectorsPage'));
const NewsPage           = lazy(() => import('./pages/NewsPage'));
const ScreenerPage       = lazy(() => import('./pages/ScreenerPage'));
const CompanyPage        = lazy(() => import('./pages/CompanyPage'));
const MarketOverviewPage = lazy(() => import('./pages/MarketOverviewPage'));
const CollectionsPage    = lazy(() => import('./pages/CollectionsPage'));
const ContestsPage       = lazy(() => import('./pages/ContestsPage'));
const AchievementsPage   = lazy(() => import('./pages/AchievementsPage'));
const SIPPage            = lazy(() => import('./pages/SIPPage'));
const BasketPage         = lazy(() => import('./pages/BasketPage'));
const StrategiesPage     = lazy(() => import('./pages/StrategiesPage'));
const EarningsCalendarPage = lazy(() => import('./pages/EarningsCalendarPage'));
const FIIDIIPage         = lazy(() => import('./pages/FIIDIIPage'));
const BacktestPage       = lazy(() => import('./pages/BacktestPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    bootstrap().finally(() => {
      useAuthStore.getState().setInitialized();
      if (useAuthStore.getState().isAuthenticated) {
        installFocusRevalidation();
      } else {
        teardown();
      }
    });
    return () => teardown();
  }, [hydrated]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"             element={<LandingPage />} />
        <Route path="/login"        element={<Login />} />
        <Route path="/register"     element={<Register />} />
        <Route path="/mpin-login"   element={<MpinLoginPage />} />
        <Route path="/setup-mpin"   element={<SetupMpinPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route element={<Layout />}>
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/market"          element={<MarketExplorer />} />
          <Route path="/terminal/:symbol" element={<TerminalPage />} />
          <Route path="/stock/:symbol"   element={<StockDetail />} />
          <Route path="/portfolio"       element={<PortfolioPage />} />
          <Route path="/compass"         element={<PortfolioCompassPage />} />
          <Route path="/positions"       element={<PositionsPage />} />
          <Route path="/orders"          element={<OrdersPage />} />
          <Route path="/watchlist"       element={<WatchlistPage />} />
          <Route path="/leaderboard"     element={<LeaderboardPage />} />
          <Route path="/notifications"   element={<NotificationsPage />} />
          <Route path="/admin"           element={<AdminPage />} />
          <Route path="/ai-chat"         element={<AIChatPage />} />
          <Route path="/sectors"         element={<SectorsPage />} />
          <Route path="/news"            element={<NewsPage />} />
          <Route path="/screener"        element={<ScreenerPage />} />
          <Route path="/company/:symbol" element={<CompanyPage />} />
          <Route path="/market-overview" element={<MarketOverviewPage />} />
          <Route path="/collections"     element={<CollectionsPage />} />
          <Route path="/contests"        element={<ContestsPage />} />
          <Route path="/achievements"    element={<AchievementsPage />} />
          <Route path="/sip"             element={<SIPPage />} />
          <Route path="/baskets"         element={<BasketPage />} />
          <Route path="/strategies"      element={<StrategiesPage />} />
          <Route path="/earnings"        element={<EarningsCalendarPage />} />
          <Route path="/fii-dii"         element={<FIIDIIPage />} />
          <Route path="/backtest"        element={<BacktestPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
