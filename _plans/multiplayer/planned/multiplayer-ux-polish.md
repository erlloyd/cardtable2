# Multiplayer UX Polish

## Overview

The core multiplayer infrastructure (WebSocket sync, awareness state, cursor/ghost rendering)
is fully functional. This plan covers the user-facing polish needed to make multiplayer feel
complete: actor identification, presence indicators, and connection status.

## Status

📋 **Planned**

## Prerequisites

- Frontend multiplayer completed ✅

## Tasks

### Actor Color System

Assign a unique color to each connected actor so cursors and selection highlights are
visually distinguishable.

- Deterministic color from actor ID (hash-based, no server coordination needed)
- Small palette of 8-10 high-contrast colors that work on dark backgrounds
- Apply to: remote cursor arrow, cursor label background, drag ghost tint
- Currently hardcoded blue in `AwarenessManager.ts`

### Player Presence UI

Show who is connected to the current table.

- Avatar dots or pills in the table toolbar showing connected actors
- Actor color matches their cursor color
- Show count when many players (e.g., "3 players")
- Join/leave transitions (fade in/out)

### Connection Status Indicator

Show the current multiplayer connection state.

- Small indicator in toolbar: connected (green), connecting (yellow), disconnected (red)
- Offline mode indicator when no server configured
- Reconnection feedback (auto-reconnect is handled by y-websocket)

### Smooth Cursor Interpolation

Remote cursors currently jump to new positions. Add lerp interpolation for smoother movement.

- Placeholder already exists in `AwarenessManager.ts`
- Lerp factor ~0.3 at 60fps for natural feel
- Skip interpolation for large jumps (teleport threshold)
