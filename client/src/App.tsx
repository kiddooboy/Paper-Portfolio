import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import SetupMpinPage from './pages/SetupMpinPage';
import MpinLoginPage from './pages/MpinLoginPage';
import MarketExplorer from './pages/MarketExplorer';
import StockDetail from './pages/StockDetail';
import TerminalPage from './pages/TerminalPage';
import PortfolioPage from './pages/PortfolioPage';
import OrdersPage from './pages/OrdersPage';
import WatchlistPage from './pages/WatchlistPage';
import LeaderboardPage from './pages/LeaderboardPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import PositionsPage from './pages/PositionsPage';
import AIChatPage from './pages/AIChatPage';
import SectorsPage from './pages/SectorsPage';
import WalletPage from './pages/WalletPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import PortfolioCompassPage from './pages/PortfolioCompassPage';
import { useAuthStore } from './store/authStore';
import { bootstrap, teardown, installFocusRevalidation } from './store/bootstrap';

function App() {
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    
    // Always attempt bootstrap on load since we rely on cookies.
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
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/mpin-login" element={<MpinLoginPage />} />
      <Route path="/setup-mpin" element={<SetupMpinPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/market" element={<MarketExplorer />} />
        <Route path="/terminal/:symbol" element={<TerminalPage />} />
        <Route path="/stock/:symbol" element={<StockDetail />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/compass" element={<PortfolioCompassPage />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/ai-chat" element={<AIChatPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/sectors" element={<SectorsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
