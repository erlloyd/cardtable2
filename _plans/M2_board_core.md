# Milestone 2 — Board Core

## Overview
Implement the core board functionality with PixiJS rendering, camera controls, and hit-testing.

## Prerequisites
- Milestone 1 completed (app shell and navigation)

## Performance Targets
- 60 fps on mobile/desktop for common interactions
- Hit-test ≤2 ms/event on mid-range mobile
- Pointer-to-visual latency ≤30 ms

## Tasks

### M2-T1: Pixi Mount + Worker Detection
**Objective:** Set up OffscreenCanvas worker path with fallback to main thread.

**Dependencies:** M1 complete

**Contract:**
- Worker `postMessage({type:'init', canvas, width, height, dpr})`
- Feature detection for OffscreenCanvas support
- Automatic fallback to main thread rendering

**Deliverables:**
- Board render worker implementation
- Feature detection utility
- Main thread fallback renderer
- Pixi v8 + @pixi/react integration

**Test Plan:**
- Unit: verify feature detection logic
- E2E: canvas renders background in both worker and main thread modes
- Performance: verify 60fps with empty scene

### M2-T2: Camera (pixi-viewport) & Gestures
**Objective:** Implement pan/zoom camera controls with gesture support.

**Dependencies:** M2-T1

**Spec:**
- Zoom range [0.5, 2.0]
- Drag slop thresholds:
  - Touch: 12px
  - Pen: 6px
  - Mouse: 3px
- Support pan, pinch-zoom gestures
- Smooth animation at 60fps

**Deliverables:**
- pixi-viewport integration
- Gesture recognition system
- Camera state management
- Pointer type detection

**Test Plan:**
- E2E: pan/zoom changes world coordinates correctly
- E2E: verify smooth animation at 60fps with empty scene
- Unit: slop thresholds work correctly for each pointer type

### M2-T3: Scene Model + RBush Hit-Test
**Objective:** Create scene object model with spatial indexing for efficient hit-testing.

**Dependencies:** M2-T1

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

**Test Plan:**
- Unit: deterministic hit-test results
- Unit: correct topmost ordering
- Microbenchmark: verify O(log n + k) performance
- Performance: ≤2ms hit-test on mid-range mobile with 300 items