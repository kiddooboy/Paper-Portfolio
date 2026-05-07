import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, cn } from '../lib/utils';
import {
  Users, Activity, DollarSign, ShieldCheck, Trash2,
  RefreshCw, ChevronUp, Eye, List, Search, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Activity Log State
  const [activities, setActivities] = useState<any[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [activityLoading, setActivityLoading] = useState(false);

  // Guard: only admin can view
  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const fetchUsers = async () => {
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
        navigate('/dashboard');
      }
    }
    setLoading(false);
  };

  const fetchActivityLog = async (page: number, action: string) => {
    setActivityLoading(true);
    try {
      const res = await axios.get(`/api/admin/activity?page=${page}&limit=50${action ? `&action=${action}` : ''}`);
      setActivities(res.data.activities);
      setActivityPage(res.data.page);
      setActivityTotalPages(res.data.totalPages);
      setActionTypes(res.data.actionTypes);
    } catch (err) {
      toast.error('Failed to load activity log');
    }
    setActivityLoading(false);
  };

  const fetchData = async () => {
    await fetchUsers();
    await fetchActivityLog(1, filterAction);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!loading) fetchActivityLog(1, filterAction);
  }, [filterAction]);

  const handleResetBalance = async (userId: number, currentBalance: number) => {
    const input = prompt(`Reset balance for user #${userId}\nCurrent: â‚¹${currentBalance.toLocaleString()}\n\nEnter new balance:`, '100000');
    if (!input) return;
    const newBal = parseFloat(input);
    if (isNaN(newBal) || newBal < 0) { toast.error('Invalid amount'); return; }
    try {
      await axios.post(`/api/admin/users/${userId}/reset-balance`, { balance: newBal });
      toast.success(`Balance reset to â‚¹${newBal.toLocaleString()}`);
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Total Users" value={stats.userCount} />
          <StatCard icon={Activity} label="Active Traders" value={stats.activeTraders} />
          <StatCard icon={DollarSign} label="Total Transactions" value={stats.totalTransactions} />
          <StatCard icon={Activity} label="Total Activities" value={stats.totalActivities} />
          <StatCard icon={DollarSign} label="Cash in System" value={formatCurrency(stats.totalCashInSystem)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors",
            activeTab === 'users' ? "border-groww-primary text-groww-primary" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
          )}
        >
          <Users className="w-4 h-4" /> Users
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={cn(
            "px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors",
            activeTab === 'activity' ? "border-groww-primary text-groww-primary" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
          )}
        >
          <List className="w-4 h-4" /> Activity Log
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
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
                  <th className="px-3 py-3">Last Login</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.id}>
                    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium flex items-center gap-1.5">
                              {u.name}
                              {u.has_mpin && <span title="MPIN Set"><Lock className="w-3 h-3 text-groww-primary" /></span>}
                            </p>
                            <p className="text-[11px] text-gray-500">{u.email}</p>
                          </div>
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
                      <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                        {u.last_login ? new Date(u.last_login).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : 'â€”'}
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
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <List className="w-4 h-4" /> Platform Activity
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="pl-9 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-groww-primary"
                >
                  <option value="">All Actions</option>
                  {actionTypes.map(type => (
                    <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => fetchActivityLog(activityPage, filterAction)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <RefreshCw className={cn("w-4 h-4", activityLoading && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 w-40">Time</th>
                  <th className="px-4 py-3 w-48">User</th>
                  <th className="px-4 py-3 w-32">Action</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3 w-28 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No activities found
                    </td>
                  </tr>
                ) : (
                  activities.map((act) => (
                    <tr key={act.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                      <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                        {new Date(act.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[13px]">{act.user_name}</div>
                        <div className="text-[11px] text-gray-500">{act.user_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap uppercase",
                          act.action.includes('LOGIN') || act.action.includes('REGISTER') || act.action.includes('MPIN') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          act.action.includes('BUY') || act.action.includes('DEPOSIT') || act.action === 'ORDER_FILLED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          act.action.includes('SELL') || act.action.includes('WITHDRAW') || act.action.includes('CANCEL') || act.action.includes('FAIL') || act.action.includes('DELETE') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        )}>
                          {act.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[12px] font-mono text-gray-600 dark:text-gray-400 break-words max-w-md">
                          {act.details ? JSON.stringify(act.details) : 'â€”'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-gray-500 font-mono">
                        {act.ip_address || 'â€”'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {activityTotalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500">
              <div>Page {activityPage} of {activityTotalPages}</div>
              <div className="flex items-center gap-2">
                <button
                  disabled={activityPage <= 1}
                  onClick={() => fetchActivityLog(activityPage - 1, filterAction)}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Previous
                </button>
                <button
                  disabled={activityPage >= activityTotalPages}
                  onClick={() => fetchActivityLog(activityPage + 1, filterAction)}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
                  <span className="text-gray-500">{t.quantity} Ã— {formatCurrency(t.price)}</span>
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

