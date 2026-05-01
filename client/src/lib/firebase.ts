import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

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
export const googleProvider = new GoogleAuthProvider();
