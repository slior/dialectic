# Multi-stage build for Dialectic Web Application
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/web-api/package.json ./packages/web-api/
COPY packages/web-ui/package.json ./packages/web-ui/

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig*.json ./
COPY packages/core ./packages/core
COPY packages/web-api ./packages/web-api
COPY packages/web-ui ./packages/web-ui

# Build all packages
RUN npm run build:core && \
    npm run build:api && \
    npm run build:ui

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/web-api/package.json ./packages/web-api/
COPY packages/web-ui/package.json ./packages/web-ui/

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/web-api/dist ./packages/web-api/dist
COPY --from=builder /app/packages/web-api/package.json ./packages/web-api/
COPY --from=builder /app/packages/web-ui/.next ./packages/web-ui/.next
COPY --from=builder /app/packages/web-ui/public ./packages/web-ui/public
COPY --from=builder /app/packages/web-ui/package.json ./packages/web-ui/
COPY --from=builder /app/packages/web-ui/next.config.js ./packages/web-ui/

# Copy start script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories for debates and configs
RUN mkdir -p /app/debates /app/configs

# Expose ports
EXPOSE 3000 3001

# Environment variables (can be overridden)
ENV PORT=3001
ENV NEXT_PUBLIC_API_URL=http://localhost:3001
ENV CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENV NODE_ENV=production

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/docker-entrypoint.sh"]

