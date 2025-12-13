# Build stage

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (uses repo context) so npm ci can install workspace deps
COPY package*.json ./
COPY package-lock.json ./

# Install dependencies at repo root (this will install workspace deps)
RUN npm ci --silent

# Copy full repo into image
COPY . .

# Build the admin-dashboard workspace
# Use npm workspace command so the admin-dashboard build runs in its package context
RUN npm --workspace=admin-dashboard run build

# Dev stage (for development with hot reload)
FROM node:20-alpine AS dev

WORKDIR /app

# Copy root package files for workspace setup
COPY package*.json ./
COPY package-lock.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci --silent

# Expose Vite dev server port
EXPOSE 5173

ENV NODE_ENV=development

# Default command for dev - will be overridden by docker-compose
CMD ["npm", "--workspace=admin-dashboard", "run", "dev", "--", "--host", "0.0.0.0"]

# Production stage (default)

FROM nginx:alpine AS production

# Copy built files from workspace output
COPY --from=builder /app/admin-dashboard/dist /usr/share/nginx/html

# Copy nginx configuration for admin-dashboard
COPY admin-dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
