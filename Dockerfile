FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies for both client and server
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build client and server
RUN cd client && npm run build
RUN cd server && npm run build

# --- Production image (no client node_modules) ---
FROM node:24-alpine

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.js"]
