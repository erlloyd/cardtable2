# Milestone 10 — Packaging & Documentation

## Overview
Final packaging, deployment configuration, and documentation for production release.

## Prerequisites
- Milestone 9 completed (performance and QA)

## Deployment Targets
- Frontend: Static hosting (Vercel, Netlify, Cloudflare Pages)
- Backend: Docker container (any cloud provider)

## Tasks

### M10-T1: Server Container & Runbook
**Objective:** Create production-ready Docker container for the y-websocket server.

**Dependencies:** M9 complete

**Spec:**
- Dockerfile with:
  - Multi-stage build
  - Non-root user
  - Health check
  - Minimal base image (alpine)
- Docker Compose configuration
- Environment variables:
  - `PORT`: server port (default: 3000)
  - `STORAGE_PATH`: data directory (default: /data)
  - `ROOM_TTL_DAYS`: room expiry (default: 30)
  - `WS_PATH`: WebSocket path (default: /ws)
- Deployment runbook with:
  - Container build steps
  - Environment setup
  - Health monitoring
  - Backup procedures
  - Troubleshooting guide

**Deliverables:**
- `server/Dockerfile`
- `docker-compose.yml`
- Environment variable documentation
- Deployment runbook
- Health check endpoint
- Logging configuration

**Test Plan:**
- `docker compose up` starts successfully
- `/health` endpoint returns OK
- WebSocket connections work
- Persistence verified across restarts
- Resource limits appropriate
- Logs properly formatted

### M10-T2: Frontend Deploy Docs
**Objective:** Create comprehensive deployment documentation for the frontend application.

**Dependencies:** M10-T1

**Spec:**
- Deployment guide covering:
  - Build configuration
  - Environment variables
  - Static hosting setup
  - CDN configuration
  - CORS setup for assets
- Platform-specific guides:
  - Vercel deployment
  - Netlify deployment
  - Cloudflare Pages
- Server URL configuration:
  - `VITE_WS_URL`: WebSocket server URL
  - Build-time vs runtime config
- Performance optimization:
  - Compression settings
  - Cache headers
  - Asset optimization

**Deliverables:**
- `/docs/deploy.md` main guide
- Platform-specific guides
- Environment configuration docs
- Performance tuning guide
- Troubleshooting section
- Example `.env` files

**Test Plan:**
- Follow docs to deploy preview
- App connects to server properly
- Service worker functions correctly
- Assets load with proper caching
- WebSocket connection established
- Test on each platform