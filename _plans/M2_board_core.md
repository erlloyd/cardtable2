# Milestone 2 — Board Core

## Overview
Implement the core board functionality with PixiJS rendering, camera controls, hit-testing, and object manipulation.

**Strategy:** Incremental approach to avoid offscreen canvas issues. Build worker communication first, then add rendering, then full features. Implement dual-mode rendering architecture (worker vs main thread) for maximum compatibility and user choice.

**See also:** [M2 Rendering Architecture](./M2_rendering_architecture.md) - Detailed plan for dual-mode rendering strategy.

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

**Success Criteria:**
- Hit-test returns correct object under pointer
- Z-order respected (topmost object selected)
- Performance target met (≤2ms)
- Scene handles 300+ objects efficiently

### M2-T5: Object Dragging
**Objective:** Implement smooth object dragging with proper gesture disambiguation from camera panning.

**Dependencies:** M2-T3, M2-T4

**Spec:**
- Drag initiation uses same slop thresholds as camera (touch: 12px, pen: 6px, mouse: 3px)
- Distinguish between camera pan (empty space) and object drag (hit object)
- Single object dragging (multi-select comes in later milestone)
- Smooth object movement at 60fps
- Pointer-to-visual latency ≤30ms
- Visual feedback during drag (e.g., slight scale or shadow)
- Object position updates in world coordinates

**Deliverables:**
- Drag state machine (idle → tracking → dragging)
- Gesture disambiguation logic (camera vs object)
- Object position update system
- Visual feedback during drag
- Integration with hit-testing from M2-T4
- Drag delta calculation in world coordinates

**Test Plan:**
- E2E: drag object updates its position correctly
- E2E: dragging empty space pans camera (not object drag)
- E2E: verify smooth 60fps during drag
- Unit: drag threshold calculations for each pointer type
- Unit: world coordinate delta calculations
- Performance: verify ≤30ms pointer-to-visual latency

**Success Criteria:**
- Objects drag smoothly at 60fps
- Clear, intuitive distinction between camera pan and object drag
- Responsive feel (≤30ms latency from pointer to visual update)
- Visual feedback provides clear drag state
- No jitter or lag during drag operations

### M2-T6: Dual-Mode Rendering Architecture ✅ COMPLETE
**Objective:** Implement both worker and main-thread rendering modes with shared core logic for maximum compatibility and user choice.

**Status:** COMPLETE - All tests passing, both modes working, verified on iOS

**Dependencies:** M2-T2 ✅ (implemented before M2-T3/T4/T5 to ensure architecture supports future features)

**Implementation Details:**
- IRendererAdapter interface definition ✅
- RendererCore abstract class with ALL rendering logic ✅
- WorkerRendererAdapter (postMessage transport) ✅
- MainThreadRendererAdapter (callback transport) ✅
- RendererFactory with capability detection ✅
- Board component using adapter pattern ✅
- Query parameter support (?renderMode=worker|main-thread) ✅
- Conditional canvas transfer (OffscreenCanvas only for worker mode) ✅
- Verbose console logging for mode verification ✅

**Architecture Highlights:**
- Same message types: MainToRendererMessage/RendererToMainMessage ✅
- Same message handlers: Identical behavior in both modes ✅
- ONLY difference: Transport layer (postMessage vs callback) ✅
- Code duplication: ~200 lines adapters vs ~2000+ lines shared logic ✅
- Easy to extend: Pattern set for M2-T3/T4/T5 features ✅

**Auto-Detection Logic:**
- Checks: OffscreenCanvas support, WebGL support, iOS version ✅
- iOS 16.x → main-thread (unstable OffscreenCanvas WebGL) ✅
- iOS 17+ → worker (stable support) ✅
- Desktop → worker (best performance) ✅
- Missing features → main-thread (fallback) ✅

**Test Results:**
- Unit: All 15 tests passing ✅
- Both adapters use same MockWorker pattern ✅
- Factory mocked in tests to force worker mode ✅
- Manual: Verified on iOS Chrome (main-thread mode, no crashes) ✅
- Manual: Desktop uses worker mode automatically ✅
- Manual: Query parameters work for mode override ✅

**Success Criteria:**
- Both rendering modes support M2-T1/T2 features ✅
- No crashes on iOS 16.x with main thread mode ✅
- Worker mode renders on desktop ✅
- Main thread mode renders on iOS ✅
- App code is mode-agnostic (uses IRendererAdapter) ✅
- Automatic detection chooses correct mode per platform ✅
- Easy mode toggle via ?renderMode parameter ✅

## Notes

### Rendering Architecture
The dual-mode rendering architecture (M2-T6) ensures Cardtable 2 works on all platforms while maintaining best-in-class performance. See [M2_rendering_architecture.md](./M2_rendering_architecture.md) for full architectural details.

### Implementation Order
**Completed:**
- M2-T1: Basic Web Worker Communication ✅
- M2-T2: OffscreenCanvas + Simple PixiJS Rendering ✅
- M2-T6: Dual-Mode Rendering Architecture ✅ (implemented early to ensure pattern supports future features)

**Remaining:**
- M2-T3: Camera (pixi-viewport) & Gestures
- M2-T4: Scene Model + RBush Hit-Test
- M2-T5: Object Dragging

M2-T6 was implemented immediately after M2-T2 to establish the architectural pattern before adding more features. This ensures M2-T3/T4/T5 will work identically in both rendering modes from day one.