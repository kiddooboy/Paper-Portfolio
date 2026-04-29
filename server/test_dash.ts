import axios from 'axios';

async function test() {
  let token;
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'yogesh.nithyanandam@gmail.com',
      password: 'password'
    });
    token = loginRes.data.token;
  } catch (err: any) {
    try {
        const regRes = await axios.post('http://localhost:5000/api/auth/register', {
            name: 'Test2',
            email: 'test2@example.com',
            password: 'password123'
        });
        token = regRes.data.token;
    } catch (e: any) {
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'test2@example.com',
            password: 'password123'
        });
        token = loginRes.data.token;
    }
  }

  console.log('Got token');

  try {
    const liveRes = await axios.get('http://localhost:5000/api/portfolio', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Portfolio success:', Object.keys(liveRes.data));

    const indicesRes = await axios.get('http://localhost:5000/api/stocks/indices');
    console.log('Indices success:', indicesRes.data.indices.length);

    const gainersRes = await axios.get('http://localhost:5000/api/stocks/gainers');
    console.log('Gainers success, count:', gainersRes.data.length);
    if (gainersRes.data.length === 0) {
        console.log("GAINERS ARE EMPTY!!!");
    }
  } catch (err: any) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

test();
