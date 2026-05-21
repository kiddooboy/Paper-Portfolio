import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { bootstrap } from '../store/bootstrap';
import { Eye, EyeOff, TrendingUp, ShieldCheck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

type Mode = 'login' | 'signup';

export default function LandingPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const stored = typeof window !== 'undefined' ? localStorage.getItem('last_email') || '' : '';
  const [email, setEmail] = useState(stored);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasMpinOnDevice = typeof window !== 'undefined' && !!localStorage.getItem('last_email');

  // Resolve a Google redirect (mobile/popup-blocked fallback)
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
          toast.success('Welcome!');
          navigate('/dashboard');
        } catch (err: any) {
          toast.error(err?.response?.data?.error || 'Google sign-in failed.');
        } finally {
          setLoading(false);
        }
      })
      .catch((err: any) => {
        const code: string = err?.code || '';
        if (code && code !== 'auth/no-redirect-result') {
          toast.error('Google sign-in failed. Please try again.');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const res = await axios.post('/api/auth/firebase', { idToken });
      login(res.data.user);
      await bootstrap();
      toast.success('Welcome!');
      navigate('/dashboard');
    } catch (err: any) {
      const code: string = err?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
        try { await signInWithRedirect(auth, googleProvider); return; }
        catch { toast.error('Google sign-in failed. Allow popups or try another browser.'); }
      } else if (code === 'auth/unauthorized-domain') {
        toast.error(`Domain "${window.location.hostname}" not authorized in Firebase.`);
      } else {
        toast.error(err?.response?.data?.error || 'Google sign-in failed.');
      }
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await axios.post('/api/auth/login', { email, password });
        login(res.data.user);
        await bootstrap();
        toast.success('Welcome back!');
        navigate('/dashboard');
      } else {
        const res = await axios.post('/api/auth/register', { name, email, password });
        login(res.data.user);
        await bootstrap();
        toast.success('Account created! You got ₹1,00,000 virtual balance.');
        navigate(`/setup-mpin?email=${encodeURIComponent(email)}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || (mode === 'login' ? 'Login failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-root">
      <style>{`
        .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
        .lp-root {
          --bg:#0d1117; --bg2:#161b22; --border:rgba(255,255,255,0.08);
          --border2:rgba(255,255,255,0.14); --green:#00d68f; --green2:#00ff9d;
          --red:#ff5252; --text:#e6edf3; --muted:#7d8590;
          height:100vh; width:100%; overflow:hidden;
          background:var(--bg); color:var(--text);
          font-family:'Inter',system-ui,sans-serif;
          display:flex; flex-direction:column;
        }
        .lp-nav {
          height:60px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
          padding:0 28px; border-bottom:1px solid var(--border);
        }
        .lp-logo { display:flex; align-items:center; gap:10px; font-weight:800; font-size:17px; letter-spacing:-0.02em; }
        .lp-logo-icon {
          width:30px; height:30px; border-radius:8px;
          background:linear-gradient(135deg,var(--green),var(--green2));
          display:grid; place-items:center; color:#04150f;
        }
        .lp-nav-tag { font-size:11px; color:var(--muted); font-weight:500; }

        .lp-body {
          flex:1; min-height:0; display:grid; grid-template-columns:1.1fr 0.9fr;
        }
        /* LEFT — hero */
        .lp-hero {
          padding:6vh 5vw; display:flex; flex-direction:column; justify-content:center;
          position:relative; overflow:hidden;
        }
        .lp-hero::after {
          content:''; position:absolute; top:-20%; left:-10%; width:480px; height:480px;
          background:radial-gradient(circle,rgba(0,214,143,0.12),transparent 70%);
          pointer-events:none;
        }
        .lp-eyebrow {
          display:inline-flex; align-items:center; gap:7px; align-self:flex-start;
          font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;
          color:var(--green); background:rgba(0,214,143,0.1);
          border:1px solid rgba(0,214,143,0.25); border-radius:99px; padding:5px 12px; margin-bottom:22px;
        }
        .lp-h1 { font-size:clamp(30px,4vw,46px); font-weight:800; line-height:1.08; letter-spacing:-0.03em; }
        .lp-h1 .g { background:linear-gradient(120deg,var(--green),var(--green2)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
        .lp-sub { font-size:15px; color:var(--muted); margin-top:18px; max-width:440px; line-height:1.6; }
        .lp-points { display:flex; flex-direction:column; gap:12px; margin-top:30px; }
        .lp-point { display:flex; align-items:center; gap:11px; font-size:14px; color:var(--text); }
        .lp-point-ic { width:30px; height:30px; border-radius:8px; background:var(--bg2); border:1px solid var(--border); display:grid; place-items:center; color:var(--green); flex-shrink:0; }

        /* RIGHT — auth card */
        .lp-authwrap { display:flex; align-items:center; justify-content:center; padding:4vh 5vw; border-left:1px solid var(--border); background:var(--bg2); }
        .lp-card { width:100%; max-width:380px; }
        .lp-tabs { display:flex; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:3px; margin-bottom:22px; }
        .lp-tab { flex:1; border:none; background:none; color:var(--muted); font-size:13px; font-weight:600; padding:8px; border-radius:7px; cursor:pointer; transition:all .15s; font-family:inherit; }
        .lp-tab.on { background:var(--green); color:#04150f; }
        .lp-title { font-size:22px; font-weight:800; letter-spacing:-0.02em; }
        .lp-desc { font-size:13px; color:var(--muted); margin-top:4px; margin-bottom:20px; }
        .lp-field { margin-bottom:13px; }
        .lp-label { display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text); }
        .lp-input {
          width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border2);
          background:var(--bg); color:var(--text); font-size:14px; outline:none; font-family:inherit; transition:border-color .15s;
        }
        .lp-input:focus { border-color:var(--green); }
        .lp-input-wrap { position:relative; }
        .lp-eye { position:absolute; right:11px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--muted); cursor:pointer; padding:2px; }
        .lp-submit {
          width:100%; padding:11px; border:none; border-radius:9px; cursor:pointer;
          background:linear-gradient(120deg,var(--green),var(--green2)); color:#04150f;
          font-weight:700; font-size:14px; margin-top:6px; font-family:inherit; transition:opacity .15s;
        }
        .lp-submit:disabled { opacity:.55; cursor:default; }
        .lp-or { display:flex; align-items:center; gap:10px; margin:16px 0; color:var(--muted); font-size:11px; }
        .lp-or::before, .lp-or::after { content:''; flex:1; height:1px; background:var(--border); }
        .lp-google {
          width:100%; padding:10px; border:1px solid var(--border2); border-radius:9px; cursor:pointer;
          background:var(--bg); color:var(--text); font-weight:600; font-size:13.5px;
          display:flex; align-items:center; justify-content:center; gap:10px; font-family:inherit; transition:background .15s;
        }
        .lp-google:hover { background:#1c2230; }
        .lp-foothint { text-align:center; font-size:12.5px; color:var(--muted); margin-top:16px; }
        .lp-link { color:var(--green); font-weight:600; text-decoration:none; cursor:pointer; }
        .lp-link:hover { text-decoration:underline; }
        .lp-mpin { display:block; text-align:center; margin-top:11px; padding:9px; border:1px solid var(--border2); border-radius:9px; color:var(--text); font-size:13px; font-weight:600; text-decoration:none; }
        .lp-mpin:hover { background:var(--bg); }

        @media (max-width: 880px) {
          .lp-root { overflow-y:auto; height:100dvh; }
          .lp-body { grid-template-columns:1fr; }
          .lp-hero { display:none; }
          .lp-authwrap { border-left:none; min-height:calc(100dvh - 60px); }
        }
      `}</style>

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-logo">
          <div className="lp-logo-icon"><TrendingUp size={17} /></div>
          Paper Portfolio
        </div>
        <span className="lp-nav-tag">Risk-free trading · ₹1,00,000 virtual</span>
      </nav>

      {/* BODY */}
      <div className="lp-body">
        {/* HERO */}
        <div className="lp-hero">
          <span className="lp-eyebrow"><Zap size={13} /> Practise. Learn. Master the markets.</span>
          <h1 className="lp-h1">
            Trade the <span className="g">live NSE & BSE</span><br />markets — with zero risk.
          </h1>
          <p className="lp-sub">
            Start with ₹1,00,000 in virtual capital. Real-time prices, F&amp;O,
            indices, an AI trading assistant, and full portfolio analytics —
            all without risking a single rupee.
          </p>
          <div className="lp-points">
            <div className="lp-point"><span className="lp-point-ic"><TrendingUp size={15} /></span> Live market data across the full NSE/BSE universe</div>
            <div className="lp-point"><span className="lp-point-ic"><ShieldCheck size={15} /></span> 100% virtual money — practise with zero financial risk</div>
            <div className="lp-point"><span className="lp-point-ic"><Zap size={15} /></span> AI insights, alerts, leaderboard &amp; advanced charts</div>
          </div>
        </div>

        {/* AUTH */}
        <div className="lp-authwrap">
          <div className="lp-card">
            <div className="lp-tabs">
              <button className={`lp-tab ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>Login</button>
              <button className={`lp-tab ${mode === 'signup' ? 'on' : ''}`} onClick={() => setMode('signup')}>Create account</button>
            </div>

            <div className="lp-title">{mode === 'login' ? 'Welcome back' : 'Create your free account'}</div>
            <div className="lp-desc">
              {mode === 'login' ? 'Sign in to continue to your portfolio.' : 'Start paper trading with ₹1,00,000 virtual balance.'}
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="lp-field">
                  <label className="lp-label" htmlFor="lp-name">Full name</label>
                  <input id="lp-name" className="lp-input" type="text" autoComplete="name"
                    value={name} onChange={(e) => setName(e.target.value)} required placeholder="John Doe" />
                </div>
              )}
              <div className="lp-field">
                <label className="lp-label" htmlFor="lp-email">Email</label>
                <input id="lp-email" className="lp-input" type="email" autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="lp-field">
                <label className="lp-label" htmlFor="lp-pw">Password</label>
                <div className="lp-input-wrap">
                  <input id="lp-pw" className="lp-input" type={showPw ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password} onChange={(e) => setPassword(e.target.value)} required
                    minLength={mode === 'signup' ? 6 : undefined}
                    placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter your password'}
                    style={{ paddingRight: 38 }} />
                  <button type="button" className="lp-eye" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="lp-submit" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account — It’s free'}
              </button>
            </form>

            <div className="lp-or">or</div>

            <button type="button" className="lp-google" onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {hasMpinOnDevice && (
              <Link to="/mpin-login" className="lp-mpin">Login with MPIN</Link>
            )}

            {mode === 'login' ? (
              <p className="lp-foothint">
                <Link to="/forgot-password" className="lp-link">Forgot password?</Link>
                {'  ·  '}
                New here? <span className="lp-link" onClick={() => setMode('signup')}>Create account</span>
              </p>
            ) : (
              <p className="lp-foothint">
                Already have an account?{' '}
                <span className="lp-link" onClick={() => setMode('login')}>Sign in</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
