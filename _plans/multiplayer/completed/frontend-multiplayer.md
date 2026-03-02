# Milestone 6 — Frontend Multiplayer

**Status**: Completed
**Theme**: Multiplayer

## Overview

Frontend multiplayer features including WebSocket connection, room management, and real-time
awareness synchronization.

**Implementation notes**: The original plan described an explicit "promote to multiplayer"
flow (local table → click button → generate room ID → connect). The actual implementation
is simpler and more seamless: all tables automatically connect to the WebSocket server when
one is available (via `VITE_WS_URL`). The table ID (e.g., `eager-swift-panda`) doubles as
the room ID. If no server is available, the app falls back to offline mode with IndexedDB
persistence. This means multiplayer "just works" by sharing the URL — no promotion step needed.

## What Was Built

- **WebSocket connection**: `WebsocketProvider` in `YjsStore.ts` connects automatically
- **Room management**: table ID = room ID, shared via URL
- **Awareness state**: `AwarenessState` interface in `shared/src/index.ts` with cursor,
  drag, hover, lasso, and toolMode fields
- **30Hz throttling**: Store-level throttle on awareness updates
- **Awareness rendering**: `AwarenessManager` in renderer draws remote cursors (blue
  triangle + label) and drag ghosts (semi-transparent object copies)
- **Awareness sync hook**: `useAwarenessSync.ts` bridges store awareness to renderer
- **Multi-selection drag ghosts**: `secondaryOffsets` support for dragging multiple objects
- **Offline fallback**: Graceful degradation when no server is available
- **Error resilience**: Corrupted awareness states don't break the renderer

## Remaining UX items (not in original scope, tracked separately)

- Actor color assignment (cursors are hardcoded blue)
- Player presence UI (player list, join/leave notifications, connection status)
- Smooth cursor interpolation (lerp — placeholder exists)
