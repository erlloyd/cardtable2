# Multiplayer Server Scaffold

## Overview
Basic y-websocket server setup with health endpoint and Railway deployment. This provides the foundation for real-time multiplayer synchronization using Yjs CRDTs.

## Status
✅ **Completed** - Deployed to production and PR preview infrastructure

## Deployment
- **Platform:** Railway (https://railway.app/)
- **Production:** `cardtable2-server-production.up.railway.app`
- **PR Previews:** `cardtable2-server-pr-{number}-prs.up.railway.app`
- **Infrastructure:**
  - Docker-based deployment via GitHub Container Registry (GHCR)
  - Automated CI/CD via GitHub Actions
  - PR preview environments for testing before merge
  - Production deployment on merge to main
  - Health check endpoint for monitoring
- **Configuration:**
  - PORT environment variable (Railway sets to 80)
  - Public domain automatically created per service

## Implementation

**Objective:** Set up basic y-websocket server with health endpoint.

**Spec:**
- WebSocket endpoint: `wss://host/ws?room=<roomId>`
- Health check: `GET /health` returns `{ok:true}`
- Basic y-websocket provider setup
- Room creation on first connection
- Environment configuration

**Deliverables:** ✅
- ✅ Express server with WebSocket upgrade (`server/src/index.ts`)
- ✅ y-websocket integration using `@y/websocket-server`
- ✅ Health check endpoint with timestamp
- ✅ Basic room management (via y-websocket's `setupWSConnection`)
- ✅ Docker-ready configuration (`server/Dockerfile`)
- ✅ Railway deployment (production + PR previews)
- ✅ CI/CD automation via GitHub Actions

**Test Coverage:** ✅ 9 tests passing
- ✅ Health endpoint tests (2 tests)
  - Responds with `ok: true` and valid timestamp
  - Returns proper HTTP 200 status
- ✅ WebSocket connection tests (2 tests)
  - Accepts WebSocket upgrade
  - Handles multiple simultaneous connections
- ✅ Y.js synchronization tests (2 tests)
  - Bidirectional sync between two clients in same room
  - Complex nested data structures sync correctly
- ✅ Room isolation tests (3 tests)
  - Different rooms don't share data
  - New clients joining existing rooms receive full state
  - Room query parameter correctly isolates connections

**Implementation Notes:**
- Used `@y/websocket-server` package for server-side y-websocket handling
- Room IDs passed via query parameter (e.g., `?room=table-123`)
- No persistence yet - state exists only in memory (see persistence plan)
- Server listens on port from `PORT` env var (default 3001, Railway sets 80)
- Tests use `y-websocket` client library to verify server behavior

## Architecture
- y-websocket server for Yjs synchronization
- WebSocket transport only (no REST API for data)
- Room-based isolation
- In-memory state (persistence to be added next)
