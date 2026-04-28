import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Mail, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import AuthLayout from '../components/AuthLayout';

export default function OtpLoginPage() {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('last_email') || '' : '';
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState(stored);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const requestOtp = async () => {
    if (!email) {
      toast.error('Enter your email');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/request-otp', { email });
      toast.success(res.data.message || 'OTP sent');
      setDevMode(!!res.data.dev);
      setStep('otp');
      setResendIn(60);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (code.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login-otp', { email, code });
      login(res.data.token, res.data.user);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const arr = code.padEnd(6, ' ').split('');
    arr[i] = v || ' ';
    const joined = arr.join('').replace(/\s+$/, '');
    setCode(joined);
    if (v && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      document.getElementById(`otp-${i - 1}`)?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      e.preventDefault();
      setCode(pasted);
      document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus();
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="w-12 h-12 rounded-xl bg-groww-primary/10 flex items-center justify-center mb-3">
            {step === 'email' ? (
              <Mail className="w-6 h-6 text-groww-primary" />
            ) : (
              <Shield className="w-6 h-6 text-groww-primary" />
            )}
          </div>
          <h1 className="text-3xl font-bold">
            {step === 'email' ? 'Sign in with OTP' : 'Enter verification code'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {step === 'email'
              ? 'We will email a 6-digit code to your registered address'
              : `Code sent to ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestOtp();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-semibold hover:bg-green-600 transition disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={code[i] || ''}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  autoFocus={i === 0}
                  className={cn(
                    'w-11 h-12 text-center text-xl font-bold rounded-lg border-2 focus:outline-none transition',
                    code[i]
                      ? 'border-groww-primary bg-groww-primary/10'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900',
                    'focus:border-groww-primary focus:ring-2 focus:ring-groww-primary/30'
                  )}
                />
              ))}
            </div>

            {devMode && (
              <p className="text-xs text-amber-600 text-center">
                SMTP not configured — check the server logs for the OTP.
              </p>
            )}

            <button
              onClick={verifyOtp}
              disabled={loading || code.length !== 6}
              className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-semibold hover:bg-green-600 transition disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Sign in'}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setStep('email')}
                className="text-gray-500 dark:text-gray-400 hover:text-groww-primary"
              >
                Change email
              </button>
              <button
                onClick={requestOtp}
                disabled={resendIn > 0 || loading}
                className="text-groww-primary disabled:text-gray-400 hover:underline"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-x-3">
          <Link to="/login" className="text-groww-primary font-medium hover:underline">
            Use password
          </Link>
          <span>·</span>
          <Link to="/register" className="text-groww-primary font-medium hover:underline">
            Sign up
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
