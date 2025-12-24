# Zoom Quality E2E Test Failure Investigation

## Problem
E2E test "dragging an already selected object keeps it selected and moves it" fails consistently after zoom quality commit (fca1492).
- Works fine before the commit
- Fails 100% of the time after the commit
- Not a timing issue - fails even with 90s timeout and 3000 frames

## Systematic Investigation Plan

### Phase 1: Confirm baseline ✅
- [x] PR #42: Revert zoom quality → Tests pass
- [ ] Local test on revert branch → Verify passes locally

### Phase 2: Isolate the breaking change

The zoom quality commit changes several things:
1. `RendererOrchestrator.ts` - Adds regenerateSceneAtZoom() and handleZoomEnd()
2. `VisualManager.ts` - Adds createText() helper with 3x base resolution
3. `stack/behaviors.ts` - Uses ctx.createText() instead of new Text()
4. `objects/types.ts` - Adds createText to RenderContext
5. Various handlers - Pass visual.createText to contexts

**Strategy**: Add changes back incrementally, testing after each:

#### Step 1: Add createText() helper WITHOUT using it
- Add VisualManager.createText() method
- Add createText to RenderContext type
- Add createText to context creation
- DON'T change stack/behaviors.ts yet
- Test: Should still pass (no behavior change)

#### Step 2: Use createText() in stack rendering
- Change stack/behaviors.ts to use ctx.createText()
- Test: Does it fail now?

#### Step 3: Add regenerateSceneAtZoom() WITHOUT calling it
- Add regenerateSceneAtZoom() method to RendererOrchestrator
- Add handleZoomEnd() method
- DON'T wire up debouncedZoomEnd yet
- Test: Should still pass (method exists but never called)

#### Step 4: Wire up zoom regeneration
- Connect debouncedZoomEnd to handleZoomEnd
- Test: Does it fail now?

#### Step 5: Add other changes
- Add antialias/roundPixels to PixiJS init
- Add counter-scaled stroke widths
- Test after each

### Phase 3: Root cause analysis

Once we identify which specific change breaks it, analyze:
- Why does that change cause pendingOps to stay at 1?
- Is there an infinite loop?
- Is there a message that never gets sent/received?
- Is there a race condition introduced?

### Phase 4: Fix and validate

- Implement proper fix
- Remove debug logging
- Restore normal timeouts
- Verify all E2E tests pass

## Observations

From CI logs:
- Page completely freezes - no console output for 29+ seconds
- Last log at 19:57:53, timeout at 19:58:22
- No "Flush poll frame" logs appear (RAF loop not running?)
- Suggests JavaScript execution stopped entirely

## Hypothesis

The createText() helper with 3x base resolution might be:
1. Causing synchronous blocking during text rasterization
2. Exhausting GPU resources
3. Triggering a WebGL context loss
4. Creating so much work that the event loop never yields
