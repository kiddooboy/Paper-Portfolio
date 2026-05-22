import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getRedirectResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { googleSignIn } from '../lib/googleAuth';
import { useAuthStore } from '../store/authStore';
import { bootstrap } from '../store/bootstrap';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../components/AuthLayout';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  // Pick up the result if user came back from a Google redirect
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        setLoading(true);
        try {
          const idToken = await result.user.getIdToken();
          const res = await axios.post('/api/auth/firebase', { idToken });
          login(res.data.user);
          await bootstrap();
          toast.success('Account created! You got ₹1,00,000 virtual balance.');
          navigate('/dashboard');
        } catch (err: any) {
          toast.error(err?.response?.data?.error || 'Google sign-in failed. Please try again.');
        } finally {
          setLoading(false);
        }
      })
      .catch((err: any) => {
        const code: string = err?.code || '';
        if (code && code !== 'auth/no-redirect-result') {
          console.error('[google-auth redirect-result]', code, err.message);
          toast.error('Google sign-in failed. Please try again.');
        }
      });
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const idToken = await googleSignIn();
      if (!idToken) return; // web redirect started; getRedirectResult finishes it
      const res = await axios.post('/api/auth/firebase', { idToken });
      login(res.data.user);
      await bootstrap();
      toast.success('Account created! You got ₹1,00,000 virtual balance.');
      navigate('/dashboard');
    } catch (err: any) {
      const code: string = err?.code || '';
      console.error('[google-auth]', code, err?.message);
      if (code === 'auth/unauthorized-domain') {
        const host = window.location.hostname;
        toast.error(`Domain "${host}" is not authorized. Admin: add it to Firebase → Authentication → Authorized domains.`);
      } else if (err?.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error('Google sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/register', { name, email, password });
      login(res.data.user);
      await bootstrap();
      toast.success('Account created! You got ₹1,00,000 virtual balance.');
      navigate(`/setup-mpin?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Start paper trading with ₹1,00,000 virtual balance
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium mb-1.5">Full Name</label>
            <input
              id="reg-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium mb-1.5">Email</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium mb-1.5">Password</label>
            <div className="relative">
              <input
                id="reg-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50 pr-10"
                placeholder="Min 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-semibold hover:bg-green-600 transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-groww-dark px-2 text-gray-400">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-groww-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}


