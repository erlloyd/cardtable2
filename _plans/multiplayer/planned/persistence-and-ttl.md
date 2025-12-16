# Multiplayer Server Persistence and TTL

## Overview
Add document persistence with LevelDB storage and automatic room cleanup after 30 days of inactivity. This enables the multiplayer server to restore state after restarts and manage resource cleanup.

## Status
📋 **Planned** - Ready to implement when needed

## Prerequisites
- Server scaffold completed ✅

## Architecture
- Server-persisted Y.Doc with 30-day TTL
- LevelDB for default storage
- Atomic operations for data integrity
- Automatic cleanup of inactive rooms

## Tasks

### Persistence Adapter
**Objective:** Implement document persistence with storage adapter.

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

**Test Plan:**
- Server restart → state restored correctly
- Update order preserved across restarts
- Concurrent updates handled properly
- Storage errors handled gracefully

### TTL Sweeper
**Objective:** Implement automatic room cleanup after inactivity.

**Dependencies:** Persistence Adapter (above)

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

## Notes
- Persistence enables production-ready multiplayer
- TTL prevents unbounded storage growth
- Activity tracking via `touch()` on every room operation
