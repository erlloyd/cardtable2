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

### M2-T3: Camera (pixi-viewport) & Gestures ✅ COMPLETE
**Objective:** Implement pan/zoom camera controls with gesture support.

**Status:** COMPLETE - Manual camera implementation with full gesture support, 11 E2E tests passing

**Dependencies:** M2-T2 ✅

**Spec:**
- ~~Zoom range [0.5, 2.0]~~ Unlimited zoom (user preference)
- Drag slop thresholds:
  - Touch: 12px
  - Pen: 6px
  - Mouse: 3px
- Support pan, pinch-zoom gestures
- Smooth animation at 60fps

**Deliverables:**
- ~~pixi-viewport integration in worker~~ Manual camera implementation (avoids library dependency issues) ✅
- Gesture recognition system ✅
- Camera state management ✅
- Pointer type detection ✅
- Input event forwarding from main thread to worker ✅
- Unlimited zoom support (user can zoom in/out without limits) ✅
- Pinch-to-zoom with locked midpoint (correct zoom behavior) ✅
- Smooth transition from pinch to pan ✅

**Test Results:**
- E2E: pan/zoom changes world coordinates correctly ✅ (11/11 tests passing)
- E2E: unlimited zoom in/out works without errors ✅
- E2E: zoom focuses on point under cursor ✅
- E2E: handles rapid pan movements smoothly ✅
- E2E: pinch-to-zoom gesture via CDP ✅
- E2E: transition from pinch to pan smoothly ✅
- E2E: works in both worker and main-thread modes ✅
- E2E: prevents default touch behaviors ✅

**Success Criteria:**
- Pan and zoom work smoothly at 60fps ✅
- Touch gestures work on mobile ✅
- Pointer events properly forwarded to worker ✅

**Implementation Notes:**
- Used manual camera implementation (world container transforms) instead of pixi-viewport
- Avoids dependency on pixi-viewport which has compatibility issues in worker mode
- Simpler, more maintainable code with full control over camera behavior
- Unlimited zoom per user preference (no artificial limits)

### M2-T4: Scene Model + RBush Hit-Test ✅ COMPLETE
**Objective:** Create scene object model with spatial indexing for efficient hit-testing.

**Status:** COMPLETE - SceneManager with RBush spatial indexing, hit-testing working, 11 unit tests + 8 E2E tests passing, hover feedback implemented

**Dependencies:** M2-T3 ✅

**Spec:**
- Object types with `_kind/_pos/_sortKey` properties
- Point and rect queries
- Topmost object ordering (respects z-index/sortKey)
- O(log n + k) query performance

**Deliverables:**
- Scene object type definitions ✅
- RBush spatial index integration ✅
- Hit-test implementation ✅
- Z-order management ✅
- Test scene with multiple objects ✅

**Test Results:**
- Unit: deterministic hit-test results ✅ (11/11 unit tests passing)
- Unit: correct topmost ordering ✅
- E2E: hover visual feedback on card hover ✅ (8/8 E2E tests passing)
- E2E: hover only with mouse/pen, not touch ✅
- E2E: hover cleared when panning/pinching ✅
- E2E: multiple rapid hover changes handled smoothly ✅
- E2E: hover respects z-order (topmost card) ✅
- E2E: works in both worker and main-thread modes ✅
- Performance: ≤2ms hit-test ⏸️ (deferred - will benchmark during M9 Performance & QA)
- Performance: 300+ objects efficiently ⏸️ (deferred - will test during M9 Performance & QA)

**Success Criteria:**
- Hit-test returns correct object under pointer ✅
- Z-order respected (topmost object selected) ✅
- Performance target met (≤2ms) ⏸️ (deferred - will benchmark during M9 Performance & QA)
- Scene handles 300+ objects efficiently ⏸️ (deferred - will test during M9 Performance & QA)

**Implementation Details:**
- SceneManager class with RBush spatial indexing ✅
- hitTest() for point queries, hitTestRect() for area queries ✅
- Proper z-order management via _sortKey sorting ✅
- 11 unit tests covering add/remove/update/hit-testing/z-order ✅
- 8 E2E tests covering hover feedback and interaction ✅
- Test scene with 5 overlapping colored cards ✅
- Hover feedback with smooth scale animation and diffuse shadow ✅ (bonus feature)
- Pointer type filtering (mouse/pen only, not touch) ✅ (bonus feature)
- PixiJS ticker management with autoStart: false ✅
- Zoom-aware blur filter for consistent shadow appearance ✅

**Known Issues:**
- Shadow blur doesn't update when zooming while hovering (requires mouse movement to refresh)

### M2-T5: Object Dragging ✅ COMPLETE
**Objective:** Implement smooth object dragging with proper gesture disambiguation from camera panning, plus card selection and multi-select features.

**Status:** COMPLETE - Object dragging, card selection, multi-select, pan/select mode toggle, and rectangle selection all implemented and tested

**Dependencies:** M2-T3 ✅, M2-T4 ✅

**Spec:**
- Drag initiation uses same slop thresholds as camera (touch: 12px, pen: 6px, mouse: 3px) ✅
- Distinguish between camera pan (empty space) and object drag (hit object) ✅
- Multi-card selection and dragging (expanded scope beyond original plan) ✅
- Smooth object movement at 60fps ✅
- Pointer-to-visual latency ≤30ms ✅
- Visual feedback during drag (scale + shadow, mode-specific) ✅
- Object position updates in world coordinates ✅
- Pan/select mode toggle with rectangle selection ✅

**Deliverables:**
- Drag state machine (idle → tracking → dragging/selecting) ✅
- Gesture disambiguation logic (camera vs object vs rectangle) ✅
- Object position update system with multi-card support ✅
- Visual feedback during drag (scale + shadow) ✅
- Integration with hit-testing from M2-T4 ✅
- Drag delta calculation in world coordinates ✅
- Card selection system (single-click, Cmd/Ctrl multi-select) ✅
- Mobile multi-select toggle button ✅
- Pan/select interaction mode toggle ✅
- Rectangle selection with visual feedback ✅
- Z-order management (dragged cards move to top) ✅

**Card Selection Features:**
- Single-click/tap selects card (deselects others) ✅
- Cmd/Ctrl+click adds to selection (toggle) ✅
- Click empty space deselects all ✅
- Visual feedback: red 4px border for selected cards ✅
- Auto-select card when starting to drag ✅
- Mobile multi-select toggle (metaKey simulation for touch) ✅
- Multi-card drag maintains relative positions ✅

**Pan/Select Mode Toggle:**
- Pan Mode (default): Pan camera or drag cards ✅
- Select Mode: Draw selection rectangles ✅
- Hold Cmd/Ctrl to temporarily invert mode ✅
- Rectangle selection with blue semi-transparent visual ✅
- All cards touched by rectangle are selected on release ✅
- Cmd/Ctrl while releasing = add to existing selection ✅
- Always prioritizes card drag over rectangle selection ✅

**Technical Improvements:**
- Spatial index bbox caching to fix ghost hit-testing ✅
- Selection logic on pointer-up (not down) to avoid conflicts ✅
- Deferred spatial index updates to pointer-up for performance ✅
- Fractional indexing for z-order (CRDT-compatible) ✅
- Color storage in _meta for accurate hit-testing ✅
- Mode-based shadow rendering (worker only for performance) ✅

**Test Results:**
- Unit: All 16 Board component tests passing ✅
- Unit: All 11 SceneManager tests passing (including hitTestRect) ✅
- Manual: Drag works smoothly at 60fps ✅
- Manual: Multi-card drag maintains relative positions ✅
- Manual: Pan/select mode toggle works as expected ✅
- Manual: Rectangle selection selects multiple cards ✅
- Manual: Z-order updates correctly on drag ✅
- Manual: Works in both worker and main-thread modes ✅
- Performance: 300-card stress test successful ✅

**Success Criteria:**
- Objects drag smoothly at 60fps ✅
- Clear, intuitive distinction between camera pan and object drag ✅
- Responsive feel (≤30ms latency from pointer to visual update) ✅
- Visual feedback provides clear drag state ✅
- No jitter or lag during drag operations ✅
- Multi-card selection and dragging works smoothly ✅
- Rectangle selection works in select mode ✅
- Mode toggle and modifier keys work as expected ✅

**Implementation Details:**
- Selection state managed in RendererCore ✅
- Delta-based position updates for multi-card drag ✅
- Gesture disambiguation: hit-test first, then mode check ✅
- Rectangle selection uses SceneManager.hitTestRect() ✅
- Z-order management with fractional indexing (prefix|suffix) ✅
- Selection on pointer-up to avoid conflict with drag gestures ✅
- Deferred spatial index updates until pointer-up ✅
- Mode-specific shadow rendering for performance ✅

**Bug Fixes:**
- Fixed ghost hit-testing via bbox caching in SceneManager ✅
- Fixed selection conflicts with drag via pointer-up timing ✅
- Fixed rectangle selection deselecting on release ✅
- Fixed card drag starting rectangle selection in select mode ✅
- Fixed z-order desync between visual and logical layers ✅
- Fixed color assignment for 300-card stress test ✅

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
- M2-T3: Camera & Gestures ✅ (manual implementation with unlimited zoom, 11 E2E tests)
- M2-T4: Scene Model + RBush Hit-Test ✅ (includes hover feedback with smooth animations, 11 unit + 8 E2E tests)
- M2-T5: Object Dragging ✅ (expanded scope: card selection, multi-select, pan/select mode toggle, rectangle selection, 16 Board tests + 11 SceneManager tests)
- M2-T6: Dual-Mode Rendering Architecture ✅ (implemented early to ensure pattern supports future features)

**Milestone Complete:** All M2 tasks completed! ✅

**Notes:**
- M2-T6 was implemented immediately after M2-T2 to establish the architectural pattern before adding more features
- M2-T3 implemented with manual camera (no pixi-viewport) for better worker compatibility
- M2-T5 expanded beyond original scope to include comprehensive card selection and interaction mode features
- Comprehensive test coverage: 16 Board tests, 11 SceneManager tests, 11 camera E2E tests, 8 hover E2E tests
- All features work identically in both worker and main-thread rendering modes
- 300-card stress test successful with smooth performance