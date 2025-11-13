# Milestone 2 — Board Core

## Overview
Implement the core board functionality with PixiJS rendering, camera controls, and hit-testing.

**Strategy:** Incremental approach to avoid offscreen canvas issues. Build worker communication first, then add rendering, then full features.

## Prerequisites
- Milestone 1 completed (app shell and navigation)

## Performance Targets
- 60 fps on mobile/desktop for common interactions
- Hit-test ≤2 ms/event on mid-range mobile
- Pointer-to-visual latency ≤30 ms

## Tasks

### M2-T1: Basic Web Worker Communication
**Objective:** Establish reliable bidirectional communication between main thread and worker.

**Dependencies:** M1 complete

**Approach:**
- Simple worker with message handling
- Test button in Board component to send messages
- Display messages from worker in DOM
- No canvas or rendering yet

**Deliverables:**
- Basic board.worker.ts with message handlers
- Board component with test button and message display
- Message type definitions (shared types)
- Worker initialization and cleanup

**Test Plan:**
- Unit: verify message serialization/deserialization
- E2E: button sends message, worker responds, UI updates
- Unit: worker cleanup on component unmount

**Success Criteria:**
- Button click → worker receives message → worker responds → UI displays response
- No errors in console
- Clean unmount in React strict mode (no double-init issues)

### M2-T2: OffscreenCanvas + Simple PixiJS Rendering ✅ COMPLETE
**Objective:** Transfer canvas to worker and render basic PixiJS scene.

**Status:** COMPLETE - All tests passing, rendering working in browser

**Dependencies:** M2-T1 ✅

**Approach:**
- Keep M2-T1 message communication working ✅
- Add canvas element in Board component ✅
- Transfer canvas to worker using `canvas.transferControlToOffscreen()` ✅
- Handle React strict mode double-mount (prevent double transfer) ✅
- Render simple PixiJS scene (colored background or basic shape) ✅

**React Strict Mode Handling:**
- Track if canvas already transferred (ref or state) ✅
- Prevent second transfer attempt ✅
- Proper cleanup on unmount ✅

**Deliverables:**
- Canvas transfer logic with strict mode guards ✅
- PixiJS initialization in worker using WebWorkerAdapter ✅
- Simple render (3 colored shapes on dark background) ✅
- Pixi v8 installed and configured ✅
- Worker resize handling ✅

**Test Results:**
- E2E: canvas appears with rendered content ✅ (8/8 tests passing)
- Unit: verify canvas transfer only happens once ✅ (15/15 tests passing)
- E2E: no errors in React strict mode (dev mode) ✅
- Visual: 3 shapes rendering correctly in browser ✅

**Success Criteria:**
- Canvas renders PixiJS content from worker ✅
- No "canvas already transferred" errors in strict mode ✅
- Message communication from M2-T1 still works ✅
- Clean mount/unmount behavior ✅

### M2-T3: Camera (pixi-viewport) & Gestures
**Objective:** Implement pan/zoom camera controls with gesture support.

**Dependencies:** M2-T2

**Spec:**
- Zoom range [0.5, 2.0]
- Drag slop thresholds:
  - Touch: 12px
  - Pen: 6px
  - Mouse: 3px
- Support pan, pinch-zoom gestures
- Smooth animation at 60fps

**Deliverables:**
- pixi-viewport integration in worker
- Gesture recognition system
- Camera state management
- Pointer type detection
- Input event forwarding from main thread to worker

**Test Plan:**
- E2E: pan/zoom changes world coordinates correctly
- E2E: verify smooth animation at 60fps with empty scene
- Unit: slop thresholds work correctly for each pointer type

**Success Criteria:**
- Pan and zoom work smoothly at 60fps
- Touch gestures work on mobile
- Pointer events properly forwarded to worker

### M2-T4: Scene Model + RBush Hit-Test
**Objective:** Create scene object model with spatial indexing for efficient hit-testing.

**Dependencies:** M2-T3

**Spec:**
- Object types with `_kind/_pos/_sortKey` properties
- Point and rect queries
- Topmost object ordering (respects z-index/sortKey)
- O(log n + k) query performance

**Deliverables:**
- Scene object type definitions
- RBush spatial index integration
- Hit-test implementation
- Z-order management
- Test scene with multiple objects

**Test Plan:**
- Unit: deterministic hit-test results
- Unit: correct topmost ordering
- Microbenchmark: verify O(log n + k) performance
- Performance: ≤2ms hit-test on mid-range mobile with 300 items