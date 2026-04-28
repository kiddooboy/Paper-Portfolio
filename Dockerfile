FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy client files and build
COPY client/package*.json ./client/
COPY client/ ./client/
WORKDIR /app/client
RUN npm install
RUN npm run build || (echo "Client build failed, checking dist directory..." && ls -la && exit 1)

# Copy server files and build
WORKDIR /app
COPY server/package*.json ./server/
COPY server/ ./server/
WORKDIR /app/server
RUN npm install
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy server build and dependencies
COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules

# Copy client build
COPY --from=builder /app/client/dist ./client/dist

# Verify client build exists
RUN ls -la ./client/dist || (echo "ERROR: client/dist directory not found!" && exit 1)

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "dist/index.js"]
