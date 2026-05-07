import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { bootstrap } from '../store/bootstrap';
import AuthLayout from '../components/AuthLayout';

export default function MpinLoginPage() {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('last_email') || '' : '';
  const [email, setEmail] = useState(stored);
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') setMpin(prev => prev.length < 4 ? prev + e.key : prev);
      else if (e.key === 'Backspace') setMpin(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && mpin.length === 4 && email) handleSubmit();
    };
    window.addEventListener('keydown', onEnter);
    return () => window.removeEventListener('keydown', onEnter);
  }, [mpin, email]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!email || mpin.length !== 4) {
      toast.error('Enter email and 4-digit MPIN');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login-mpin', { email, mpin });
      login(res.data.user);
      await bootstrap();
      toast.success('Welcome back!');
      navigate('/dashboard');
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

          {/* Dot indicators */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn(
                'w-11 h-11 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center text-lg sm:text-xl font-bold transition-all duration-150',
                mpin[i] ? 'border-groww-primary bg-groww-primary/10 text-groww-primary scale-105' : 'border-gray-300 dark:border-gray-700'
              )}>
                {mpin[i] ? (showMpin ? mpin[i] : 'â—') : ''}
              </div>
            ))}
          </div>

          <p className="text-xs text-center text-gray-400">Use number keys Â· Backspace to delete Â· Enter to sign in</p>
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
