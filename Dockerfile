# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsup.config.ts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

# Build the application
RUN npm run build

# Stage: Dev image (cached dependencies only)
FROM node:20-alpine AS dev

WORKDIR /app

# Copy package files only so dependency layer can be cached
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev) for development
RUN npm ci

# Expose port for dev
ENV NODE_ENV=development
ENV API_PORT=3000
EXPOSE 3000

# Default command for dev stage – docker-compose will override if needed
CMD ["npm", "run", "dev"]

# Stage 2: Production (default)
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/src ./src

# Create logs directory
RUN mkdir -p logs

# Set environment variables (can be overridden by docker-compose)
ENV NODE_ENV=production
ENV API_PORT=3000
ENV API_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/index.js"]
