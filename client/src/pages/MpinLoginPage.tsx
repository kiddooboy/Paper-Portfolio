import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import AuthLayout from '../components/AuthLayout';

export default function MpinLoginPage() {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('last_email') || '' : '';
  const [email, setEmail] = useState(stored);
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleDigitClick = (digit: string) => {
    if (mpin.length < 4) setMpin(prev => prev + digit);
  };
  const handleDelete = () => setMpin(prev => prev.slice(0, -1));

  const handleSubmit = async () => {
    if (!email || mpin.length !== 4) {
      toast.error('Enter email and 4-digit MPIN');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login-mpin', { email, mpin });
      login(res.data.token, res.data.user);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Invalid MPIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="w-12 h-12 rounded-xl bg-groww-primary/10 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-groww-primary" />
          </div>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your email and MPIN for quick access
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">MPIN</label>
            <button
              type="button"
              onClick={() => setShowMpin(!showMpin)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-groww-primary"
            >
              {showMpin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showMpin ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all',
                  mpin[i]
                    ? 'border-groww-primary bg-groww-primary/10 text-groww-primary'
                    : 'border-gray-300 dark:border-gray-700'
                )}
              >
                {showMpin ? mpin[i] : mpin[i] ? '●' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigitClick(digit)}
              className="py-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-100 transition"
          >
            DEL
          </button>
          <button
            onClick={() => handleDigitClick('0')}
            className="py-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            0
          </button>
          <button
            onClick={() => setMpin('')}
            className="py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:bg-gray-100 transition"
          >
            CLR
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !email || mpin.length !== 4}
          className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-groww-primary font-medium hover:underline">
            Use password instead
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
