import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Native-app shell behaviour for the Capacitor (Android) build.
// Everything is a no-op on the website — guarded by Capacitor.isNativePlatform().
export function useNativeShell() {
  const navigate = useNavigate();

  useEffect(() => {
    let removeBack: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;

      // Status bar — match the current theme.
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        const dark = (() => { try { return localStorage.getItem('theme') === 'dark'; } catch { return false; } })();
        await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
        await StatusBar.setBackgroundColor({ color: dark ? '#000000' : '#ffffff' });
      } catch { /* status bar plugin optional */ }

      // Hide the splash once the web app has mounted.
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide();
      } catch { /* splash plugin optional */ }

      // Android hardware back button → router back, or exit at the root.
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack && window.history.length > 1) navigate(-1);
          else CapApp.exitApp();
        });
        if (cancelled) handle.remove();
        else removeBack = () => handle.remove();
      } catch { /* app plugin optional */ }
    })();

    return () => { cancelled = true; removeBack?.(); };
  }, [navigate]);
}
