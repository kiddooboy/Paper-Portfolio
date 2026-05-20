import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ArrowLeft, BarChart3, TrendingUp, TrendingDown, Users, UserPlus,
  Activity, DollarSign, Wallet, ShoppingCart, Trophy, Skull, Calendar,
  RefreshCw, Layers, Zap, Target, Award, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, cn, formatDbDate } from '../lib/utils';

// ── Types ──
interface AnalyticsResponse {
  range: { from: string; to: string };
  kpis: {
    newUsers: number; activeUsers: number; loginsInRange: number;
    tradesCount: number; tradesBuy: number; tradesSell: number;
    tradeVolume: number; buyVolume: number; sellVolume: number;
    realizedPnl: number; closedTrades: number; winningTrades: number; losingTrades: number;
    avgTradeSize: number;
    totalUsers: number; activeHolders: number; totalCash: number;
    investedValue: number; currentValue: number; unrealizedPnl: number; aum: number;
  };
  largestTrade: null | {
    symbol: string; type: 'BUY' | 'SELL'; quantity: number; price: number; total: number;
    createdAt: string; userName: string; userEmail: string;
  };
  series: {
    dailyTrades: { day: string; count: number; buys: number; sells: number; volume: number }[];
    dailyRealized: { day: string; realized: number; trades: number }[];
    dailyNewUsers: { day: string; count: number }[];
    dailyActiveUsers: { day: string; count: number }[];
  };
  topStocks: { symbol: string; trades: number; volume: number; buyVolume: number; sellVolume: number }[];
  topTraders: { userId: number; name: string; email: string; trades: number; volume: number }[];
  topWinners: { userId: number; name: string; email: string; realized: number; closedTrades: number }[];
  topLosers: { userId: number; name: string; email: string; realized: number; closedTrades: number }[];
  actionBreakdown: { action: string; count: number }[];
  sectorBreakdown: { sector: string; trades: number; volume: number }[];
}

// ── Date helpers ──
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PIE_COLORS = ['D5367FF', 'DD4AF37', 'DFF725E', 'DFFC107', 'D9C6BFF', 'D26C6DA', 'DEC407A', 'D66BB6A', 'DFFA726', 'D42A5F5', 'DAB47BC', 'D26A69A'];

// ── Reusable bits ──
function KpiCard({
  icon: Icon, label, value, sub, tone = 'neutral',
}: {
  icon: any; label: string; value: string; sub?: string;
  tone?: 'gain' | 'loss' | 'neutral' | 'primary';
}) {
  const toneCls =
    tone === 'gain' ? 'text-gain' :
    tone === 'loss' ? 'text-loss' :
    tone === 'primary' ? 'text-groww-primary' :
    'text-gray-800 dark:text-gray-100';
  const iconBg =
    tone === 'gain' ? 'bg-gain/10 text-gain' :
    tone === 'loss' ? 'bg-loss/10 text-loss' :
    tone === 'primary' ? 'bg-groww-primary/10 text-groww-primary' :
    'bg-gray-100 dark:bg-gray-800 text-gray-500';
  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
          <p className={cn('text-xl font-bold mt-1 truncate', toneCls)}>{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title, icon: Icon, children, right,
}: { title: string; icon: any; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-groww-primary" /> {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// ── Main page ──
export default function AdminAnalyticsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoToday());
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  const fetchAnalytics = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await axios.get('/api/admin/analytics', { params: { from, to } });
      setData(res.data);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('Admin access denied');
        navigate('/dashboard');
        return;
      }
      toast.error(err?.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick range presets
  const applyPreset = (days: number) => {
    const newFrom = isoDaysAgo(days - 1);
    const newTo = isoToday();
    setFrom(newFrom);
    setTo(newTo);
    setTimeout(() => fetchAnalytics(), 0);
  };

  // Build combined daily-users series for chart
  const usersSeries = useMemo(() => {
    if (!data) return [] as { day: string; new: number; active: number }[];
    const byDay = new Map<string, { day: string; new: number; active: number }>();
    for (const r of data.series.dailyNewUsers) byDay.set(r.day, { day: r.day, new: r.count, active: 0 });
    for (const r of data.series.dailyActiveUsers) {
      const cur = byDay.get(r.day) || { day: r.day, new: 0, active: 0 };
      cur.active = r.count;
      byDay.set(r.day, cur);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [data]);

  if (user?.role !== 'admin') return null;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const k = data.kpis;
  const winRate = k.closedTrades > 0 ? (k.winningTrades / k.closedTrades) * 100 : 0;
  const buyShare = k.tradeVolume > 0 ? (k.buyVolume / k.tradeVolume) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-1.5 mt-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            title="Back to Admin"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-indigo-500" />
              Platform Analytics
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              End-to-end view of users, trades and P&L across the platform.
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchAnalytics(false)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* Date range bar */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
          <Calendar className="w-4 h-4" /> Date range
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            max={to}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-groww-primary"
          />
          <span className="text-gray-400 text-sm">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from}
            max={isoToday()}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-groww-primary"
          />
          <button
            onClick={() => fetchAnalytics(false)}
            disabled={refreshing}
            className="px-4 py-1.5 text-sm rounded-lg bg-groww-primary text-white font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            Apply
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap lg:ml-auto">
          {[
            { label: '7D', days: 7 },
            { label: '30D', days: 30 },
            { label: '90D', days: 90 },
            { label: '1Y', days: 365 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="px-2.5 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 hover:border-groww-primary hover:text-groww-primary transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Grid: Snapshot ── */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Platform snapshot</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Wallet} label="AUM" tone="primary" value={formatCurrency(k.aum)}
            sub={`Cash ${formatCurrency(k.totalCash)} + Stocks ${formatCurrency(k.currentValue)}`} />
          <KpiCard icon={Users} label="Total Users" value={k.totalUsers.toLocaleString()}
            sub={`${k.activeHolders} with active holdings`} />
          <KpiCard icon={TrendingUp} label="Unrealized P&L"
            tone={k.unrealizedPnl >= 0 ? 'gain' : 'loss'}
            value={`${k.unrealizedPnl >= 0 ? '+' : ''}${formatCurrency(k.unrealizedPnl)}`}
            sub={`Invested ${formatCurrency(k.investedValue)}`} />
          <KpiCard icon={DollarSign} label="Cash in System" value={formatCurrency(k.totalCash)}
            sub="Across all wallets" />
        </div>
      </div>

      {/* ── KPI Grid: In-range ── */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">
          In selected range · {data.range.from} → {data.range.to}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={UserPlus} label="New Users" value={k.newUsers.toLocaleString()}
            sub={`${k.loginsInRange.toLocaleString()} logins`} />
          <KpiCard icon={Activity} label="Active Users" value={k.activeUsers.toLocaleString()}
            sub="Distinct users with any activity" />
          <KpiCard icon={ShoppingCart} label="Trades" value={k.tradesCount.toLocaleString()}
            sub={`${k.tradesBuy.toLocaleString()} buy · ${k.tradesSell.toLocaleString()} sell`} />
          <KpiCard icon={DollarSign} label="Trade Volume" tone="primary" value={formatCurrency(k.tradeVolume)}
            sub={`Avg ${formatCurrency(k.avgTradeSize)} / trade`} />
          <KpiCard icon={TrendingUp} label="Realized P&L"
            tone={k.realizedPnl >= 0 ? 'gain' : 'loss'}
            value={`${k.realizedPnl >= 0 ? '+' : ''}${formatCurrency(k.realizedPnl)}`}
            sub={`${k.closedTrades.toLocaleString()} closed trades`} />
          <KpiCard icon={Target} label="Win Rate" value={`${winRate.toFixed(1)}%`}
            tone={winRate >= 50 ? 'gain' : winRate > 0 ? 'loss' : 'neutral'}
            sub={`${k.winningTrades}W · ${k.losingTrades}L`} />
          <KpiCard icon={Zap} label="Buy Share" value={`${buyShare.toFixed(1)}%`}
            sub={`${formatCurrency(k.buyVolume)} buys`} />
          <KpiCard icon={AlertTriangle} label="Sell Share" value={`${(100 - buyShare).toFixed(1)}%`}
            sub={`${formatCurrency(k.sellVolume)} sells`} />
        </div>
      </div>

      {/* ── Charts row 1: Volume + Trades over time ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Daily Trade Volume" icon={DollarSign}>
          <div className="h-64">
            {data.series.dailyTrades.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series.dailyTrades} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="D5367FF" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="D5367FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={shortDay} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => compactNum(v)} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} labelFormatter={(l) => `Day ${l}`} />
                  <Area type="monotone" dataKey="volume" stroke="D5367FF" fill="url(DvolFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Buys vs Sells" icon={ShoppingCart}>
          <div className="h-64">
            {data.series.dailyTrades.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series.dailyTrades} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={shortDay} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="buys" stackId="a" fill="DD4AF37" name="Buys" />
                  <Bar dataKey="sells" stackId="a" fill="DFF725E" name="Sells" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Daily Realized P&L" icon={TrendingUp}>
          <div className="h-64">
            {data.series.dailyRealized.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series.dailyRealized} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={shortDay} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => compactNum(v)} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="realized" name="Realized P&L">
                    {data.series.dailyRealized.map((d, i) => (
                      <Cell key={i} fill={d.realized >= 0 ? 'DD4AF37' : 'DFF725E'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Charts row 2: Users over time + Top stocks ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="User Activity Over Time" icon={Users}>
          <div className="h-64">
            {usersSeries.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usersSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={shortDay} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="active" stroke="D5367FF" strokeWidth={2} dot={false} name="Active users" />
                  <Line type="monotone" dataKey="new" stroke="DD4AF37" strokeWidth={2} dot={false} name="New signups" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Top Traded Stocks" icon={Layers}>
          <div className="h-64">
            {data.topStocks.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topStocks} layout="vertical" margin={{ top: 5, right: 10, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => compactNum(v)} />
                  <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="volume" fill="D5367FF" name="Volume" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Charts row 3: Sector pie + Action breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Volume by Sector" icon={BarChart3}>
          <div className="h-64">
            {data.sectorBreakdown.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sectorBreakdown}
                    dataKey="volume"
                    nameKey="sector"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    label={({ sector, percent }: any) => `${sector} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data.sectorBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Activity Action Breakdown" icon={Activity}>
          <div className="h-64">
            {data.actionBreakdown.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.actionBreakdown} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="action"
                    tick={{ fontSize: 10 }}
                    width={140}
                    tickFormatter={(s: string) => s.replace(/_/g, ' ').toLowerCase()}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="D9C6BFF" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Top tables row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Top Traders by Volume" icon={Trophy}>
          <DataTable
            empty="No trades in this range"
            head={['Trader', 'Trades', 'Volume']}
            rows={data.topTraders.map((t) => [
              <UserCell key="u" name={t.name} email={t.email} />,
              <span key="c" className="tabular-nums">{t.trades.toLocaleString()}</span>,
              <span key="v" className="tabular-nums font-medium">{formatCurrency(t.volume)}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Top Stocks" icon={Award}>
          <DataTable
            empty="No trades in this range"
            head={['Symbol', 'Trades', 'Buy Vol', 'Sell Vol']}
            rows={data.topStocks.map((s) => [
              <span key="s" className="font-semibold">{s.symbol}</span>,
              <span key="c" className="tabular-nums">{s.trades.toLocaleString()}</span>,
              <span key="b" className="tabular-nums text-gain">{formatCurrency(s.buyVolume)}</span>,
              <span key="r" className="tabular-nums text-loss">{formatCurrency(s.sellVolume)}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Top Winning Traders (Realized)" icon={TrendingUp}>
          <DataTable
            empty="No realized winners in this range"
            head={['Trader', 'Closed', 'Realized P&L']}
            rows={data.topWinners.map((t) => [
              <UserCell key="u" name={t.name} email={t.email} />,
              <span key="c" className="tabular-nums">{t.closedTrades.toLocaleString()}</span>,
              <span key="p" className="tabular-nums font-medium text-gain">+{formatCurrency(t.realized)}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Top Losing Traders (Realized)" icon={Skull}>
          <DataTable
            empty="No realized losers in this range"
            head={['Trader', 'Closed', 'Realized P&L']}
            rows={data.topLosers.map((t) => [
              <UserCell key="u" name={t.name} email={t.email} />,
              <span key="c" className="tabular-nums">{t.closedTrades.toLocaleString()}</span>,
              <span key="p" className="tabular-nums font-medium text-loss">{formatCurrency(t.realized)}</span>,
            ])}
          />
        </SectionCard>
      </div>

      {/* ── Largest trade ── */}
      {data.largestTrade && (
        <SectionCard title="Largest Single Trade" icon={TrendingDown}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <span className={cn(
                'text-[10px] font-bold px-2 py-1 rounded-full uppercase',
                data.largestTrade.type === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>{data.largestTrade.type}</span>
              <div>
                <p className="font-semibold">
                  <Link to={`/terminal/${data.largestTrade.symbol}?exchange=NSE&fullscreen=1`} target="_blank" rel="noopener noreferrer" className="hover:text-groww-primary">
                    {data.largestTrade.symbol}
                  </Link>
                </p>
                <p className="text-[11px] text-gray-500">
                  {data.largestTrade.quantity.toLocaleString()} @ {formatCurrency(data.largestTrade.price)}
                </p>
              </div>
            </div>
            <div className="text-sm">
              <p className="font-medium">{data.largestTrade.userName}</p>
              <p className="text-[11px] text-gray-500">{data.largestTrade.userEmail}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">{formatCurrency(data.largestTrade.total)}</p>
              <p className="text-[11px] text-gray-500">
                {formatDbDate(data.largestTrade.createdAt, { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Small helpers ──
function UserCell({ name, email }: { name: string; email: string }) {
  return (
    <div className="min-w-0">
      <p className="font-medium truncate">{name}</p>
      <p className="text-[11px] text-gray-500 truncate">{email}</p>
    </div>
  );
}

function DataTable({
  head, rows, empty,
}: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-6">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
            {head.map((h, i) => (
              <th key={i} className={cn('px-2 py-2', i > 0 && 'text-right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
              {r.map((c, ci) => (
                <td key={ci} className={cn('px-2 py-2', ci > 0 && 'text-right')}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-gray-400">
      No data in this range
    </div>
  );
}

function shortDay(s: string) {
  // YYYY-MM-DD → DD/MM
  if (!s || s.length < 10) return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

function compactNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (abs >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
