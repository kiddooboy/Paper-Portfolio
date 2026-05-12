// PM2 process manager config for EC2 / VPS deployments.
// Usage:
//   pm2 start ecosystem.config.cjs          # first time
//   pm2 restart paper-portfolio --update-env # after code updates
//   pm2 save && pm2 startup                  # survive reboots

module.exports = {
  apps: [
    {
      name: 'paper-portfolio',
      script: 'dist/index.js',
      // ── adjust this to your actual clone path on the server ──
      cwd: '/home/ubuntu/paper-portfolio/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      // Secrets live in server/.env (loaded by dotenv at startup).
      // Only non-secret vars go here.
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
