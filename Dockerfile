# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build client
WORKDIR /app/client
RUN npm install
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm install
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy server dependencies and build
COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules

# Copy client build
COPY --from=builder /app/client/dist ./client/dist

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "dist/index.js"]
