# Multi-stage build for React app
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY app/package.json ./app/
COPY shared/package.json ./shared/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY shared ./shared
COPY app ./app

# Build the app
WORKDIR /app/app

# Accept server URL as build arg
ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN pnpm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/app/dist /usr/share/nginx/html

# Copy nginx configuration (optional - nginx default works for most SPAs)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
