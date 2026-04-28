FROM node:18-alpine AS builder

WORKDIR /app

# Copy client files and build first
COPY client/package*.json ./client/
COPY client/ ./client/
WORKDIR /app/client
RUN npm install
RUN npm run build

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

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "dist/index.js"]
