# Multi-stage build for React app
FROM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Copy source files BEFORE install (so PNPM can see full workspace)
COPY shared ./shared
COPY app ./app

# Install dependencies
RUN pnpm install --frozen-lockfile

# Accept server URL as build arg
ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Build the app using PNPM workspace filter from root
RUN pnpm --filter @cardtable2/app run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
