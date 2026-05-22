import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { getToken, setToken } from './lib/authToken';

axios.defaults.withCredentials = true;

// API base URL. Empty on the website (relative /api, same-origin + cookie auth);
// set to https://paperportfolio.in for the wrapped Android build so every
// relative /api/... call resolves to the live API.
axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';

// Attach the saved JWT as a Bearer token (used by the wrapped app where the
// httpOnly cookie can't travel cross-site). Harmless on the website.
axios.interceptors.request.use((config) => {
  const t = getToken();
  if (t) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${t}`;
  }
  return config;
});

// Capture the token from any auth response (login / register / mpin / firebase)
// so all login paths persist it without editing each call site.
axios.interceptors.response.use((res) => {
  const url = typeof res.config?.url === 'string' ? res.config.url : '';
  if (res?.data?.token && url.includes('/api/auth/')) setToken(res.data.token);
  return res;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="bottom-right" toastOptions={{
        className: 'dark:bg-groww-card dark:text-white',
      }} />
    </BrowserRouter>
  </React.StrictMode>
);
