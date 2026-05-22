import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCnzdiueoe9Rb4fIzOUIfUFfa1COHP-rXU',
  authDomain: 'paperportfolio-4c978.firebaseapp.com',
  projectId: 'paperportfolio-4c978',
  storageBucket: 'paperportfolio-4c978.firebasestorage.app',
  messagingSenderId: '563092918942',
  appId: '1:563092918942:web:a99d22b118c4b2f5ce618f',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Keep the session across the redirect round-trip and reloads.
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();
// Always show the account chooser so users can pick/switch accounts.
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Popups are unreliable on mobile browsers — prefer the redirect flow there.
export const preferRedirect =
  typeof window !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));
