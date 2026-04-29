import axios from 'axios';

async function test() {
  try {
    const stocksRes = await axios.get('http://localhost:5000/api/stocks?limit=10&live=1');
    console.log('Stocks success, keys:', Object.keys(stocksRes.data));
    console.log('Sample:', stocksRes.data.stocks[0]);
  } catch (err: any) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

test();
