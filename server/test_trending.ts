import axios from 'axios';

async function test() {
  try {
    const trendingRes = await axios.get('http://localhost:5000/api/stocks/trending');
    console.log('Trending success, count:', trendingRes.data.length);
    console.log('Sample:', trendingRes.data[0]);
  } catch (err: any) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

test();
