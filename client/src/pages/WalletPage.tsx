import { useEffect, useState } from 'react';
import axios from 'axios';
import { formatCurrency, cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { ArrowUpRight, ArrowDownRight, Wallet, History, Plus, Minus } from 'lucide-react';

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  
  const user = useAuthStore((s) => s.user);
  const updateBalance = useAuthStore((s) => s.updateBalance);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [balanceRes, txRes] = await Promise.all([
        axios.get('/api/wallet/balance'),
        axios.get('/api/wallet/transactions')
      ]);
      setBalance(balanceRes.data.balance || 0);
      setTransactions(txRes.data || []);
    } catch (error) {
      console.error('Error fetching wallet data:', error);
    }
    setLoading(false);
  };

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount <= 0) return;
    
    setProcessing(true);
    try {
      await axios.post('/api/wallet/deposit', { amount: depositAmount });
      setBalance(prev => prev + depositAmount);
      updateBalance(balance + depositAmount);
      setAmount('');
      setShowDeposit(false);
      await fetchWalletData();
    } catch (error) {
      console.error('Deposit failed:', error);
    }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || withdrawAmount <= 0 || withdrawAmount > balance) return;
    
    setProcessing(true);
    try {
      await axios.post('/api/wallet/withdraw', { amount: withdrawAmount });
      setBalance(prev => prev - withdrawAmount);
      updateBalance(balance - withdrawAmount);
      setAmount('');
      setShowWithdraw(false);
      await fetchWalletData();
    } catch (error) {
      console.error('Withdraw failed:', error);
    }
    setProcessing(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wallet Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 dark:from-indigo-900 dark:to-purple-900 rounded-2xl p-6 text-white shadow-lg">
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
        
        <div className="mb-6">
          <p className="text-sm text-white/70 mb-1">Available Balance</p>
          <h2 className="text-4xl font-bold">{formatCurrency(balance)}</h2>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowDeposit(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 transition py-3 rounded-xl font-medium"
          >
            <Plus className="w-5 h-5" />
            Deposit
          </button>
          <button
            onClick={() => setShowWithdraw(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 transition py-3 rounded-xl font-medium"
          >
            <Minus className="w-5 h-5" />
            Withdraw
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-indigo-500" />
          <h3 className="font-semibold">Transaction History</h3>
        </div>
        
        {transactions.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    tx.type === 'DEPOSIT' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  )}>
                    {tx.type === 'DEPOSIT' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium">{tx.type}</p>
                    <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <span className={cn(
                  'font-semibold',
                  tx.type === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-groww-card rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4">Deposit Funds</h3>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeposit(false)}
                className="flex-1 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={processing}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-groww-card rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4">Withdraw Funds</h3>
            <p className="text-sm text-gray-500 mb-2">Available: {formatCurrency(balance)}</p>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              max={balance}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdraw(false)}
                className="flex-1 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={processing || parseFloat(amount) > balance}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
