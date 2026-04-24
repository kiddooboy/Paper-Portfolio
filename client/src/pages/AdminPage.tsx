import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, cn } from '../lib/utils';
import {
  Users, Activity, DollarSign, ShieldCheck, Trash2,
  RefreshCw, ChevronUp, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Guard: only admin can view
  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      const [s, u] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/admin/users'),
      ]);
      setStats(s.data);
      setUsers(u.data.users);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('Admin access denied');
        navigate('/');
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleResetBalance = async (userId: number, currentBalance: number) => {
    const input = prompt(`Reset balance for user #${userId}\nCurrent: ₹${currentBalance.toLocaleString()}\n\nEnter new balance:`, '100000');
    if (!input) return;
    const newBal = parseFloat(input);
    if (isNaN(newBal) || newBal < 0) { toast.error('Invalid amount'); return; }
    try {
      await axios.post(`/api/admin/users/${userId}/reset-balance`, { balance: newBal });
      toast.success(`Balance reset to ₹${newBal.toLocaleString()}`);
      fetchData();
    } catch { toast.error('Failed to reset balance'); }
  };

  const handleDeleteUser = async (userId: number, email: string) => {
    if (!confirm(`Delete user ${email}?\n\nThis will permanently remove ALL their data (holdings, orders, transactions, watchlists).`)) return;
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      toast.success('User deleted');
      fetchData();
      if (expandedUser === userId) { setExpandedUser(null); setUserDetail(null); }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete');
    }
  };

  const handleViewDetail = async (userId: number) => {
    if (expandedUser === userId) { setExpandedUser(null); setUserDetail(null); return; }
    setExpandedUser(userId);
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/admin/users/${userId}`);
      setUserDetail(res.data);
    } catch { toast.error('Failed to load user details'); }
    setDetailLoading(false);
  };

  if (user?.role !== 'admin') return null;

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
      <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-500" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage users and monitor platform activity</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Total Users" value={stats.userCount} />
          <StatCard icon={Activity} label="Active Traders" value={stats.activeTraders} />
          <StatCard icon={DollarSign} label="Total Transactions" value={stats.totalTransactions} />
          <StatCard icon={Activity} label="Total Orders" value={stats.totalOrders} />
          <StatCard icon={DollarSign} label="Cash in System" value={formatCurrency(stats.totalCashInSystem)} />
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Registered Users ({users.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3">User</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Cash</th>
                <th className="px-3 py-3">Portfolio</th>
                <th className="px-3 py-3">Total Value</th>
                <th className="px-3 py-3">P&L</th>
                <th className="px-3 py-3">Holdings</th>
                <th className="px-3 py-3">Trades</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-[11px] text-gray-500">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                        u.role === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(u.balance)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(u.currentValue)}</td>
                    <td className="px-3 py-3 tabular-nums font-medium">{formatCurrency(u.totalValue)}</td>
                    <td className={cn('px-3 py-3 tabular-nums font-medium', u.totalPnl >= 0 ? 'text-gain' : 'text-loss')}>
                      {u.totalPnl >= 0 ? '+' : ''}{formatCurrency(u.totalPnl)}
                    </td>
                    <td className="px-3 py-3 text-center">{u.holdingsCount}</td>
                    <td className="px-3 py-3 text-center">{u.transactionCount}</td>
                    <td className="px-3 py-3 text-[11px] text-gray-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleViewDetail(u.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="View details">
                          {expandedUser === u.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                                                <button onClick={() => handleResetBalance(u.id, u.balance)} className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-yellow-600 transition" title="Reset balance">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => handleDeleteUser(u.id, u.email)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition" title="Delete user">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedUser === u.id && (
                    <tr key={`detail-${u.id}`} className="bg-gray-50 dark:bg-gray-800/60">
                      <td colSpan={10} className="px-4 py-4">
                        {detailLoading ? (
                          <div className="text-sm text-gray-500 animate-pulse">Loading user details...</div>
                        ) : userDetail ? (
                          <UserDetailPanel data={userDetail} />
                        ) : null}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 uppercase">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function UserDetailPanel({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {/* Holdings */}
      {data.holdings?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Holdings ({data.holdings.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.holdings.map((h: any) => (
              <div key={h.symbol} className="bg-white dark:bg-groww-card rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                <p className="font-medium text-sm">{h.symbol}</p>
                <p className="text-[11px] text-gray-500">{h.quantity} qty @ {formatCurrency(h.avg_buy_price)}</p>
                {h.current_price && (
                  <p className={cn('text-xs font-medium mt-0.5', (h.pnl || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                    {formatCurrency(h.current_value)} ({(h.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(h.pnl || 0)})
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {data.transactions?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Transactions</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {data.transactions.slice(0, 10).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1">
                <span className="flex items-center gap-2">
                  <span className={cn('font-bold px-1.5 py-0.5 rounded text-[10px]',
                    t.type === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  )}>{t.type}</span>
                  <span className="font-medium">{t.symbol}</span>
                  <span className="text-gray-500">{t.quantity} × {formatCurrency(t.price)}</span>
                </span>
                <span className="tabular-nums">{formatCurrency(t.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data.holdings?.length && !data.transactions?.length && (
        <p className="text-sm text-gray-500">No trading activity yet</p>
      )}
    </div>
  );
}
