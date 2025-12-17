# Milestone 6 — Frontend Multiplayer

## Overview
Implement the frontend multiplayer features including promotion flow and real-time awareness synchronization.

## Prerequisites
- Milestone 5 completed (multiplayer server)

## Multiplayer Flow
1. User starts with local table (`/table/local-<uuid>`)
2. Click "Start Multiplayer" → modal confirmation
3. Generate room ID (ULID)
4. Connect to WebSocket server
5. Copy local state to server
6. Navigate to `/table/<roomId>`
7. Share URL with other players

## Tasks

### M6-T1: Promote to Multiplayer
**Objective:** Implement the flow to promote a local table to a multiplayer room.

**Dependencies:** M5 complete

**Spec:**
- "Start Multiplayer" button in table UI
- Modal: "Anyone with the link can join this table"
- Generate room ID using ULID
- Connect to WebSocket: `/ws?room=<roomId>`
- Copy local Y.Doc state to server
- Navigate to `/table/<roomId>`
- Display shareable link

**Deliverables:**
- Start Multiplayer UI component and modal
- ULID generation utility
- WebSocket connection management
- State synchronization logic
- URL routing update
- Shareable link display

**Test Plan (E2E):**
- Start with local table
- Promote to multiplayer
- Second browser joins via link
- Both see same state
- URL changes correctly

### M6-T2: Awareness Bridge & Cursors
**Objective:** Implement real-time cursor and drag awareness between clients.

**Dependencies:** M6-T1

**Spec:**
- Unique color per actor (assigned on join)
- 30Hz throttling for updates
- Drop frames if lagging
- Awareness payloads:
  - Cursor position
  - Drag ghost for all selected items
  - Hover states
- Smooth interpolation (lerp)
- ~150ms observed latency target

**Deliverables:**
- Actor color assignment system
- Awareness state synchronization
- 30Hz throttle mechanism
- Frame dropping logic
- Cursor rendering per actor
- Drag ghost visualization
- Interpolation system

**Test Plan (E2E):**
- Two browsers on same room
- Move cursor in one → appears in other
- Drag object in one → ghost in other
- Measure latency ≤150ms
- Verify 30Hz update rate
- Test with 3+ actors