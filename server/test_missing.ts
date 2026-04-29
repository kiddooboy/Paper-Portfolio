import axios from 'axios';
import { NIFTY50 } from './src/services/marketData.js';

async function test() {
  let token;
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'yogesh.nithyanandam@gmail.com',
      password: 'password'
    });
    token = loginRes.data.token;
  } catch (err: any) {
    const regRes = await axios.post('http://localhost:5000/api/auth/register', {
        name: 'Test', email: 'test4@example.com', password: 'password123'
    });
    token = regRes.data.token;
  }

  try {
    const liveRes = await axios.get('http://localhost:5000/api/stocks/live', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const returnedQuotes = liveRes.data.quotes;
    const returnedSymbols = Object.keys(returnedQuotes);
    console.log('Returned count:', returnedSymbols.length);
    
    const missing = NIFTY50.filter(s => !returnedSymbols.includes(s));
    console.log('Missing from NIFTY50:', missing);
    
  } catch (err: any) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

test();
