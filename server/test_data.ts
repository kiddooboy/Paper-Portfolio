import axios from 'axios';

async function test() {
  try {
    const gainersRes = await axios.get('http://localhost:5000/api/stocks/gainers');
    console.log('Gainers sample:', gainersRes.data[0]);

    const indicesRes = await axios.get('http://localhost:5000/api/stocks/indices');
    console.log('Indices sample:', indicesRes.data.indices[0]);

  } catch (err: any) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

test();
