import axios from 'axios';

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'yogesh.nithyanandam@gmail.com', // Assuming admin email from auth.ts
      password: 'password123' // Try a default password or we'll register
    }).catch(async (e) => {
        // If login fails, try to register
        return await axios.post('http://localhost:5000/api/auth/register', {
            name: 'Test',
            email: 'test@example.com',
            password: 'password123'
        });
    });

    const token = loginRes.data.token;
    console.log('Got token:', token.slice(0, 10) + '...');

    const liveRes = await axios.get('http://localhost:5000/api/stocks/live', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Live response keys:', Object.keys(liveRes.data));
    console.log('Count:', liveRes.data.count);
    const quotes = liveRes.data.quotes;
    console.log('Number of quotes returned:', Object.keys(quotes).length);
    if (Object.keys(quotes).length > 0) {
        console.log('Sample quote:', quotes[Object.keys(quotes)[0]]);
    }
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

test();
