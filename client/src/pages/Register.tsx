import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/register', { name, email, password });
      login(res.data.token, res.data.user);
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
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
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
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50"
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
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-groww-primary/50 pr-10"
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
