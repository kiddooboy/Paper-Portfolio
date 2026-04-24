import { db, initSchema } from '../db/index.js';
import bcrypt from 'bcryptjs';

const stocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', marketCap: 1980000, peRatio: 28.5, high52w: 3220, low52w: 2220, eps: 98.5, volume: 4500000, about: 'Diversified conglomerate.', category: 'stock' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', sector: 'IT', marketCap: 1450000, peRatio: 32.1, high52w: 4250, low52w: 3150, eps: 123.4, volume: 2100000, about: 'Leading global IT services.', category: 'stock' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Financial Services', marketCap: 1200000, peRatio: 22.3, high52w: 1780, low52w: 1360, eps: 72.5, volume: 3800000, about: 'Largest private sector bank.', category: 'stock' },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'IT', marketCap: 780000, peRatio: 26.8, high52w: 1850, low52w: 1230, eps: 56.2, volume: 3200000, about: 'Digital services leader.', category: 'stock' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', sector: 'Financial Services', marketCap: 820000, peRatio: 20.5, high52w: 1150, low52w: 860, eps: 48.3, volume: 4100000, about: 'Leading private sector bank.', category: 'stock' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', sector: 'Consumer Staples', marketCap: 650000, peRatio: 65.2, high52w: 2800, low52w: 2200, eps: 38.5, volume: 1200000, about: 'Largest FMCG company.', category: 'stock' },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Financial Services', marketCap: 720000, peRatio: 12.8, high52w: 820, low52w: 520, eps: 52.1, volume: 5600000, about: 'Largest public sector bank.', category: 'stock' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', sector: 'Telecom', marketCap: 580000, peRatio: 48.6, high52w: 1400, low52w: 780, eps: 18.2, volume: 2800000, about: 'Leading telecom operator.', category: 'stock' },
  { symbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE', sector: 'Consumer Staples', marketCap: 620000, peRatio: 28.4, high52w: 510, low52w: 360, eps: 15.8, volume: 4200000, about: 'Diversified conglomerate.', category: 'stock' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', sector: 'Financial Services', marketCap: 480000, peRatio: 35.2, high52w: 8200, low52w: 5600, eps: 198.5, volume: 1500000, about: 'Leading NBFC.', category: 'stock' },
];

async function seed() {
  await initSchema();
  console.log('Seeding database...');

  db.prepare('DELETE FROM users').run();

  // Stocks are ingested live from NSE + BSE masters on server startup.
  // We still upsert a small curated set so the app has data before ingestion completes.
  const insertStock = db.prepare(`INSERT OR IGNORE INTO stocks (symbol, name, exchange, sector, market_cap, pe_ratio, high_52w, low_52w, eps, volume, about, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const s of stocks) insertStock.run(s.symbol, s.name, s.exchange, s.sector, s.marketCap, s.peRatio, s.high52w, s.low52w, s.eps, s.volume, s.about, s.category);

  const hashedPw = await bcrypt.hash('password123', 10);
  db.prepare('INSERT INTO users (name, email, password, balance) VALUES (?, ?, ?, ?)').run('Demo User', 'demo@papertrade.in', hashedPw, 100000);

  console.log('Seed complete!');
}

seed().catch(console.error);
