# Milestone 5 — Multiplayer Server

## Overview
Build the y-websocket server with persistence and room management for multiplayer support.

## Prerequisites
- Milestone 4 completed (set loading system)

## Architecture
- y-websocket server for Yjs synchronization
- Server-persisted Y.Doc with 30-day TTL
- LevelDB for default storage
- WebSocket transport only (no REST API for data)

## Tasks

### M5-T1: WS Server Scaffold
**Objective:** Set up basic y-websocket server with health endpoint.

**Dependencies:** M4 complete

**Spec:**
- WebSocket endpoint: `wss://host/ws?room=<roomId>`
- Health check: `GET /health` returns `{ok:true}`
- Basic y-websocket provider setup
- Room creation on first connection
- Environment configuration

**Deliverables:**
- Express server with WebSocket upgrade
- y-websocket integration
- Health check endpoint
- Basic room management
- Docker-ready configuration

**Test Plan (API):**
- Two clients join same room and exchange y-updates
- Health endpoint responds correctly
- WebSocket upgrade works properly
- Room isolation verified

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