import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { ArrowUpRight, ArrowDownRight, Wallet, History, Info, Settings } from 'lucide-react';

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [balanceRes, txRes] = await Promise.all([
        axios.get('/api/wallet/balance'),
        axios.get('/api/wallet/transactions'),
      ]);
      setBalance(balanceRes.data.balance || 0);
      setTransactions(txRes.data || []);
    } catch (error) {
      console.error('Error fetching wallet data:', error);
    }
    setLoading(false);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Wallet Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 dark:from-indigo-900 dark:to-purple-900 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
              {user?.name ? getInitials(user.name) : 'U'}
            </div>
            <div>
              <p className="text-sm text-white/70">Welcome back</p>
              <p className="font-semibold">{user?.name || 'User'}</p>
            </div>
          </div>
          <Wallet className="w-8 h-8 text-white/80" />
        </div>

        <div className="mb-2">
          <p className="text-sm text-white/70 mb-1">Available Balance</p>
          <h2 className="text-4xl font-bold">{formatCurrency(balance)}</h2>
        </div>
      </div>

      {/* Info / admin link */}
      {isAdmin ? (
        <Link
          to="/admin"
          className="flex items-center justify-between gap-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-900/20"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Manage user balances</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Top up or reset balances for any team member
              </p>
            </div>
          </div>
          <ArrowUpRight className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
        </Link>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          <Info className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">
              Wallet adjustments are admin-managed
            </p>
            <p>
              You cannot deposit or withdraw funds from your account. All paper-trading
              balances are allocated and adjusted by your administrator. Reach out to
              your admin for any balance changes.
            </p>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-indigo-500" />
          <h3 className="font-semibold">Wallet History</h3>
        </div>

        {transactions.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No wallet transactions yet</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      tx.type === 'DEPOSIT'
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                    )}
                  >
                    {tx.type === 'DEPOSIT' ? (
                      <ArrowDownRight className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{tx.type}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(tx.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'font-semibold',
                    tx.type === 'DEPOSIT'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {tx.type === 'DEPOSIT' ? '+' : '-'}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
