# Build stage
FROM node:24-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared package (dependency of server)
COPY shared/package.json ./shared/
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/

# Copy server package
COPY server/package.json ./server/
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Install all dependencies (including workspace links)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build server (TypeScript -> JavaScript)
RUN pnpm --filter @cardtable2/server run build

# Production stage
FROM node:24-slim

# Install tini for proper signal handling
RUN apt-get update && apt-get install -y tini && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared package (needed at runtime for workspace:* reference)
COPY shared/package.json ./shared/
COPY --from=builder /app/shared/src ./shared/src

# Copy server package.json and built files
COPY server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Expose port (Railway will override with PORT env var)
EXPOSE 3001

# Set working directory to server
WORKDIR /app/server

# Use tini to handle signals properly (SIGTERM, SIGINT, etc.)
ENTRYPOINT ["tini", "--"]

# Start server
CMD ["node", "dist/index.js"]
