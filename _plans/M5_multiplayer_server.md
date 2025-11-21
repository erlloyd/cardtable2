# Milestone 5 — Multiplayer Server

## Overview
Build the y-websocket server with persistence and room management for multiplayer support.

## Prerequisites
- Milestone 4 completed (set loading system) — **Note:** M5 prioritized before M4, proceeding with basic server first

## Architecture
- y-websocket server for Yjs synchronization
- Server-persisted Y.Doc with 30-day TTL
- LevelDB for default storage
- WebSocket transport only (no REST API for data)

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

## Tasks

### M5-T1: WS Server Scaffold ✅ **COMPLETED**

**Objective:** Set up basic y-websocket server with health endpoint.

**Dependencies:** M4 complete (waived - prioritized M5)

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
- No persistence yet - state exists only in memory (M5-T2)
- Server listens on port from `PORT` env var (default 3001, Railway sets 80)
- Tests use `y-websocket` client library to verify server behavior

### M5-T2: Persistence Adapter
**Objective:** Implement document persistence with storage adapter.

**Dependencies:** M5-T1

**Spec:**
- Storage operations:
  - `loadDoc(roomId)`: restore from storage
  - `appendUpdate(roomId, update)`: save incremental
  - `deleteRoom(roomId)`: remove all data
  - `touch(roomId)`: update last activity
- LevelDB as default backend
- Preserve update order
- Atomic operations

**Deliverables:**
- Persistence adapter interface
- LevelDB implementation
- Update queuing mechanism
- Error handling and recovery

**Test Plan (API):**
- Server restart → state restored correctly
- Update order preserved across restarts
- Concurrent updates handled properly
- Storage errors handled gracefully

### M5-T3: TTL Sweeper
**Objective:** Implement automatic room cleanup after inactivity.

**Dependencies:** M5-T2

**Spec:**
- Default TTL: 30 days
- Configurable via `ROOM_TTL_DAYS` env var
- Sweep interval: every 6 hours
- Check last activity timestamp
- Clean removal with logging

**Deliverables:**
- TTL sweeper service
- Activity tracking
- Scheduled cleanup job
- Cleanup logging
- Configuration system

**Test Plan:**
- Set small TTL for testing
- Verify rooms deleted after TTL expires
- Active rooms not deleted
- Cleanup logs generated properly