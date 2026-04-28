# Deployment Guide for paperportfolio.in

## Prerequisites
- Node.js 18+ installed
- Domain: paperportfolio.in
- Hosting provider (VPS, Railway, Render, or similar)
- Git for version control

## Local Build Preparation

### 1. Install Dependencies
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Build the Application
```bash
# Build client (React)
cd client
npm run build

# Build server (TypeScript)
cd ../server
npm run build
```

### 3. Environment Variables

**Server (.env):**
```env
PORT=5000
NODE_ENV=production
JWT_SECRET=your_secure_random_string_here
DATABASE_URL=postgresql://user:password@host:port/database_name
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure_admin_password
ADMIN_NAME=Admin
```

**Client (.env):**
```env
VITE_GROW_API_TOKEN=your_grow_api_token
VITE_GROW_API_SECRET=your_grow_api_secret
```

## Deployment Options

### Option 1: VPS (DigitalOcean, AWS EC2, etc.)

#### Server Setup
```bash
# SSH into your VPS
ssh user@your-server-ip

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone your repository
git clone your-repo-url
cd paper-trading-new

# Install dependencies
cd server && npm install
cd ../client && npm install

# Build the application
cd client && npm run build
cd ../server && npm run build

# Set up environment variables
cp server/.env.example server/.env
nano server/.env  # Edit with your values

# Start with PM2
cd server
pm2 start dist/index.js --name paper-portfolio
pm2 save
pm2 startup
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name paperportfolio.in www.paperportfolio.in;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d paperportfolio.in -d www.paperportfolio.in
```

### Option 2: Railway (Simplest)

1. Push your code to GitHub
2. Connect Railway to your GitHub repository
3. Railway will auto-detect and build both client and server
4. Add environment variables in Railway dashboard
5. Configure custom domain in Railway settings

### Option 3: Render (Recommended for PostgreSQL)

1. **Create PostgreSQL Database**:
   - Go to Render dashboard → New → PostgreSQL
   - Create a new PostgreSQL instance
   - Copy the internal DATABASE_URL from the database dashboard

2. **Create Web Service** for the backend:
   - Build Command: `cd server && npm install && npm run build`
   - Start Command: `node dist/index.js`
   - Add environment variables:
     - `DATABASE_URL` (from PostgreSQL database)
     - `JWT_SECRET` (generate with: `openssl rand -base64 32`)
     - `ADMIN_EMAIL` (admin email)
     - `ADMIN_PASSWORD` (admin password)
     - `ADMIN_NAME` (admin display name)

3. **Static Site** for the frontend (React build):
   - Build Command: `cd client && npm install && npm run build`
   - Publish Directory: `client/dist`
   - Add environment variables as needed

4. Configure custom domain in Render dashboard

**Note**: Using Render PostgreSQL provides persistent storage that survives redeploys, unlike the free tier ephemeral storage.

## Domain Configuration

### DNS Settings (for paperportfolio.in)

**A Record:**
```
Type: A
Name: @
Value: your-server-ip
TTL: 3600
```

**CNAME Record (for www):**
```
Type: CNAME
Name: www
Value: paperportfolio.in
TTL: 3600
```

## Post-Deployment Checklist

- [ ] Application loads at https://paperportfolio.in
- [ ] API endpoints are accessible
- [ ] User registration/login works
- [ ] Market data is loading
- [ ] Charts are rendering
- [ ] Database is persisting data
- [ ] SSL certificate is valid
- [ ] PM2 (or equivalent) is managing the process
- [ ] Logs are being monitored

## Monitoring

### Check Logs
```bash
# With PM2
pm2 logs paper-portfolio

# Or directly
pm2 logs
```

### Restart Application
```bash
pm2 restart paper-portfolio
```

### Update Application
```bash
git pull
cd client && npm run build
cd ../server && npm run build
pm2 restart paper-portfolio
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000
# Kill the process
kill -9 <PID>
```

### Database Issues
- PostgreSQL connection string must be set in DATABASE_URL environment variable
- Ensure PostgreSQL database is accessible from your deployment environment
- For Render, use the internal DATABASE_URL from your PostgreSQL database dashboard
- Schema is created automatically on first run

### Build Errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version` (should be 18+)
- Clear build cache: `rm -rf dist`

## Security Notes

1. **Never commit .env files** - They contain sensitive data
2. **Use strong JWT secrets** - Generate with: `openssl rand -base64 32`
3. **Enable HTTPS** - Use Let's Encrypt or provider SSL
4. **Regular updates** - Keep dependencies updated
5. **Monitor logs** - Watch for suspicious activity
