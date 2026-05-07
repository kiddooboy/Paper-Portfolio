import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { X, ArrowUpRight, ArrowDownRight, Wallet, History, Info, Settings } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

export default function WalletModal({ onClose }: { onClose: () => void }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const balance = user?.balance ?? 0;
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/wallet/transactions')
      .then((r) => setTransactions(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-groww-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 dark:from-indigo-900 dark:to-purple-900 p-5 text-white shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-base font-bold">
                {user?.name ? getInitials(user.name) : 'U'}
              </div>
              <div>
                <p className="text-xs text-white/70">Welcome back</p>
                <p className="font-semibold text-sm">{user?.name || 'User'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Wallet className="w-6 h-6 text-white/70" />
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-white/70 mb-1">Available Balance</p>
          <h2 className="text-3xl font-bold tabular-nums">{formatCurrency(balance)}</h2>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Admin / info note */}
          {user?.role === 'admin' ? (
            <button
              onClick={() => { onClose(); navigate('/admin'); }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-900/20 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Manage user balances</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Top up or reset balances</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-indigo-500 shrink-0" />
            </button>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
              <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Balances are admin-managed. Contact your administrator for any balance changes.
              </p>
            </div>
          )}

          {/* Transaction history */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm">Wallet History</h3>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-6">No wallet transactions yet</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        tx.type === 'DEPOSIT'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      )}>
                        {tx.type === 'DEPOSIT' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tx.type}</p>
                        <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <span className={cn('font-semibold text-sm tabular-nums', tx.type === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                      {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
