FROM node:18-alpine

WORKDIR /app

# Install dependencies for both client and server
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build client
WORKDIR /app/client
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm run build

# Move to production directory
WORKDIR /app

# Copy server build and node_modules (built files are in the image, not build context)
RUN cp -r server/dist ./dist && \
    cp -r server/node_modules ./node_modules && \
    cp server/package*.json ./

# Copy client build
RUN cp -r client/dist ./client/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "dist/index.js"]
