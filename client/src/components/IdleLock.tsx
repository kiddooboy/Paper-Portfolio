import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = 'pp_last_active';

function recordActivity() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

export default function IdleLock() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const [locked, setLocked] = useState(false);
  const [mpin, setMpin] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Activity tracking — only when authenticated user has an MPIN.
  useEffect(() => {
    if (!isAuthenticated || !user?.has_mpin) return;

    const checkIdle = () => {
      const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (last && Date.now() - last > IDLE_LIMIT_MS) {
        setLocked(true);
      }
    };

    // First mount: ensure timestamp exists so we don't immediately lock.
    if (!localStorage.getItem(STORAGE_KEY)) recordActivity();

    const onActivity = () => recordActivity();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    const interval = window.setInterval(checkIdle, 60_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.clearInterval(interval);
    };
  }, [isAuthenticated, user?.has_mpin]);

  // Number-pad entry while locked.
  useEffect(() => {
    if (!locked) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') setMpin((prev) => (prev.length < 4 ? prev + e.key : prev));
      else if (e.key === 'Backspace') setMpin((prev) => prev.slice(0, -1));
      else if (e.key === 'Enter' && mpin.length === 4) verify();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, mpin]);

  async function verify() {
    if (!user?.email || mpin.length !== 4) return;
    setVerifying(true);
    try {
      await axios.post('/api/auth/login-mpin', { email: user.email, mpin });
      recordActivity();
      setLocked(false);
      setMpin('');
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Invalid MPIN');
      setMpin('');
    } finally {
      setVerifying(false);
    }
  }

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-5">
        <div className="space-y-2 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-groww-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-groww-primary" />
          </div>
          <h2 className="text-xl font-bold">Session locked</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You've been away for over 30 minutes. Enter your MPIN to continue.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition',
                mpin[i]
                  ? 'border-groww-primary bg-groww-primary/10 text-groww-primary scale-105'
                  : 'border-gray-300 dark:border-gray-700'
              )}
            >
              {mpin[i] ? '•' : ''}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          Use number keys · Backspace · Enter
        </p>

        <button
          onClick={verify}
          disabled={verifying || mpin.length !== 4}
          className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-semibold hover:bg-green-600 disabled:opacity-50 transition"
        >
          {verifying ? 'Verifying…' : 'Unlock'}
        </button>

        <button
          onClick={() => { logout(); setLocked(false); window.location.href = '/login'; }}
          className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
