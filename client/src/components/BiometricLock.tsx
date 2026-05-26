import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Lock, LogOut, Fingerprint } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { verifyBiometric } from '../lib/biometric';

// Native app lock. On every app open / resume the user must pass their phone's
// own secure lock — whatever they've set: fingerprint, face, iris, or
// PIN / pattern / password — before the (already-authenticated) app is shown.
// This bypasses the in-app MPIN keypad. If the phone has no secure lock at all,
// we can't enforce it and let the user through. No-op on the website.

type Mode = 'idle' | 'checking' | 'locked' | 'unlocked';

export default function BiometricLock() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const logout = useAuthStore((s) => s.logout);

  const native = Capacitor.isNativePlatform();
  const [mode, setMode] = useState<Mode>(native ? 'checking' : 'idle');
  const promptingRef = useRef(false);

  // Lock whenever an authenticated session is present (native only).
  const evaluate = useCallback(() => {
    if (!native || !useAuthStore.getState().isAuthenticated) { setMode('unlocked'); return; }
    setMode('locked');
  }, [native]);

  const promptUnlock = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    try {
      const res = await verifyBiometric('Unlock Paper Portfolio');
      // 'ok' = authenticated; 'unavailable' = phone has no lock → can't enforce.
      if (res === 'ok' || res === 'unavailable') setMode('unlocked');
    } finally {
      promptingRef.current = false;
    }
  }, []);

  // Re-evaluate once the initial /me session check settles.
  useEffect(() => {
    if (isInitializing) return;
    evaluate();
  }, [isInitializing, isAuthenticated, evaluate]);

  // Auto-prompt the device lock as soon as we enter the locked state.
  useEffect(() => {
    if (mode === 'locked') promptUnlock();
  }, [mode, promptUnlock]);

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

  if (!native || mode === 'idle' || mode === 'unlocked') return null;

  return (
    <div className="fixed inset-0 z-[300] bg-gray-50 dark:bg-groww-dark flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-groww-primary/10 flex items-center justify-center">
          <Lock className="w-10 h-10 text-groww-primary" />
        </div>

        {mode === 'checking' && <p className="text-sm text-gray-500">Securing your session…</p>}

        {mode === 'locked' && (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Locked</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Unlock with your fingerprint, face, or screen lock to continue
              </p>
            </div>
            <button
              onClick={promptUnlock}
              className="w-full py-3 rounded-xl bg-groww-primary text-white font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition"
            >
              <Fingerprint className="w-5 h-5" /> Unlock
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
