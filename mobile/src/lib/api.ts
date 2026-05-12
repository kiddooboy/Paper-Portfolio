import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://65.2.45.191:5000',
  timeout: 10000,
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}
