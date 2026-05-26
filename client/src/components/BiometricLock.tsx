import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, ScanFace, LogOut } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { getBiometry, hasBiometricMpin, verifyBiometric, enableBiometricMpin } from '../lib/biometric';

// Native app lock. On every app open / resume the user must pass Face ID /
// fingerprint before the (already-authenticated) app is revealed — this
// bypasses the MPIN keypad. If biometrics are available but not yet set up,
// enrollment is mandatory before they can use the app. No-op on the website.

type Mode = 'idle' | 'checking' | 'locked' | 'enroll' | 'unlocked';

export default function BiometricLock() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const native = Capacitor.isNativePlatform();
  // Start native sessions on a neutral splash so an authenticated cold-start
  // never flashes app content before the lock decision is made.
  const [mode, setMode] = useState<Mode>(native ? 'checking' : 'idle');
  const [label, setLabel] = useState('Fingerprint');
  const [enrollMpin, setEnrollMpin] = useState('');
  const [busy, setBusy] = useState(false);
  const promptingRef = useRef(false);
  const mpinInputRef = useRef<HTMLInputElement>(null);

  // Decide which gate (if any) applies. Runs on auth-settle and on app resume.
  const evaluate = useCallback(async () => {
    if (!native || !useAuthStore.getState().isAuthenticated) { setMode('unlocked'); return; }
    setMode('checking');
    const info = await getBiometry();
    if (!info.available) { setMode('unlocked'); return; } // no hardware → can't enforce
    setLabel(info.label || 'Fingerprint');
    setMode((await hasBiometricMpin()) ? 'locked' : 'enroll');
  }, [native]);

  // Re-evaluate once the initial /me session check has settled.
  useEffect(() => {
    if (isInitializing) return;
    evaluate();
  }, [isInitializing, isAuthenticated, evaluate]);

  // Re-lock whenever the app returns to the foreground.
  useEffect(() => {
    if (!native) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App: CapApp } = await import('@capacitor/app');
      const h = await CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && useAuthStore.getState().isAuthenticated) evaluate();
      });
      remove = () => h.remove();
    })();
    return () => remove?.();
  }, [native, evaluate]);

  // Auto-prompt the biometric scanner when we enter the locked state.
  const promptUnlock = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    try {
      if (await verifyBiometric('Unlock Paper Portfolio')) setMode('unlocked');
    } finally {
      promptingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (mode === 'locked') promptUnlock();
  }, [mode, promptUnlock]);

  // Users with no MPIN at all must create one first (which enables biometrics).
  useEffect(() => {
    if (mode === 'enroll' && user && !user.has_mpin) {
      setMode('unlocked');
      navigate('/setup-mpin');
    } else if (mode === 'enroll') {
      setTimeout(() => mpinInputRef.current?.focus(), 250);
    }
  }, [mode, user, navigate]);

  const submitEnroll = async () => {
    if (enrollMpin.length !== 4) return;
    setBusy(true);
    try {
      const email = user?.email || localStorage.getItem('last_email') || '';
      await axios.post('/api/auth/login-mpin', { email, mpin: enrollMpin }); // validate MPIN
      await enableBiometricMpin(email, enrollMpin);
      toast.success(`${label} unlock enabled`);
      setEnrollMpin('');
      setMode('unlocked');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Incorrect MPIN');
    } finally {
      setBusy(false);
    }
  };

  if (!native || mode === 'idle' || mode === 'unlocked') return null;

  const isFace = /face/i.test(label);
  const Icon = isFace ? ScanFace : Fingerprint;

  return (
    <div className="fixed inset-0 z-[300] bg-gray-50 dark:bg-groww-dark flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-groww-primary/10 flex items-center justify-center">
          <Icon className="w-10 h-10 text-groww-primary" />
        </div>

        {mode === 'checking' && (
          <p className="text-sm text-gray-500">Securing your session…</p>
        )}

        {mode === 'locked' && (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Locked</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Unlock with {label} to continue
              </p>
            </div>
            <button
              onClick={promptUnlock}
              className="w-full py-3 rounded-xl bg-groww-primary text-white font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition"
            >
              <Icon className="w-5 h-5" /> Unlock with {label}
            </button>
            <button
              onClick={() => logout()}
              className="w-full py-2.5 rounded-xl text-gray-500 font-medium flex items-center justify-center gap-2 hover:text-loss transition"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </>
        )}

        {mode === 'enroll' && (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Enable {label}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Set up {label} unlock for faster, secure sign-in. Enter your MPIN once to confirm.
              </p>
            </div>

            <input
              ref={mpinInputRef}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={4}
              value={enrollMpin}
              onChange={(e) => setEnrollMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter' && enrollMpin.length === 4) submitEnroll(); }}
              aria-label="Enter your 4-digit MPIN"
              style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
            />
            <div
              className="flex justify-center gap-3 cursor-pointer"
              onClick={() => mpinInputRef.current?.focus()}
              role="button"
              tabIndex={0}
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn(
                  'w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all',
                  enrollMpin[i] ? 'border-groww-primary bg-groww-primary/10 text-groww-primary scale-105' : 'border-gray-300 dark:border-gray-700',
                )}>
                  {enrollMpin[i] ? '•' : ''}
                </div>
              ))}
            </div>

            <button
              onClick={submitEnroll}
              disabled={busy || enrollMpin.length !== 4}
              className="w-full py-3 rounded-xl bg-groww-primary text-white font-semibold hover:brightness-110 disabled:opacity-60 transition"
            >
              {busy ? 'Enabling…' : `Enable ${label}`}
            </button>
            <button
              onClick={() => logout()}
              className="w-full py-2.5 rounded-xl text-gray-500 font-medium flex items-center justify-center gap-2 hover:text-loss transition"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
