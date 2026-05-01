import { getRawDb, initSchema, shutdownPool } from '../db/index.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const email = process.argv[2] || process.env.ADMIN_EMAIL || 'yogesh.nithyanandam@gmail.com';
const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'admin123';

async function resetAdmin() {
  await initSchema();
  const raw = getRawDb();
  
  console.log(`\n[reset-admin] Resetting admin: ${email}`);
  
  const hashed = await bcrypt.hash(password, 10);
  
  const existing = raw.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email) as any;
  
  if (existing) {
    raw.prepare("UPDATE users SET role = 'admin', password = ? WHERE id = ?").run(hashed, existing.id);
    console.log(`[reset-admin] Updated existing user ${email} to admin with new password.`);
  } else {
    raw.prepare("INSERT INTO users (name, email, password, role, balance) VALUES (?, ?, ?, ?, ?)")
      .run('Admin', email, hashed, 'admin', 500000);
    console.log(`[reset-admin] Created new admin user ${email} with new password.`);
  }
  
  console.log('[reset-admin] Success! You can now log in with these credentials.\n');
  await shutdownPool();
}

resetAdmin().catch(console.error);
