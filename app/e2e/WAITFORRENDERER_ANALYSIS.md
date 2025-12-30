# Why `waitForRenderer()` Takes Seconds (Not Milliseconds)

## Expected Behavior
`waitForRenderer()` should complete in **~16ms** (1 frame at 60fps) if there are no pending operations.

## Actual Behavior
During the drag loop, `waitForRenderer()` was taking **seconds**, not milliseconds, causing:
- Test time: 11.8s locally
- Test time: 27s in CI (almost timing out at 30s)

## Root Cause Analysis

### How `waitForRenderer()` Works

From `src/renderer/handlers/testing.ts`:

```typescript
export function handleFlush(context: RendererContext): void {
  if (context.selection.getPendingOperations() === 0) {
    // Fast path: No pending operations - respond after 1 frame (~16ms)
    requestAnimationFrame(() => {
      context.postResponse({ type: 'flushed' });
    });
  } else {
    // Slow path: Poll until pendingOperations reaches 0
    const maxPolls = 100; // Up to 100 frames = ~1.67s at 60fps
    const pollFrame = () => {
      pollCount++;
      if (pendingOperations === 0) {
        context.postResponse({ type: 'flushed' });
      } else if (pollCount >= maxPolls) {
        // Timeout - give up and respond anyway
        context.postResponse({ type: 'flushed' });
      } else {
        requestAnimationFrame(pollFrame); // Keep polling
      }
    };
    requestAnimationFrame(pollFrame);
  }
}
```

### What Increments `pendingOperations`

From `src/renderer/handlers/pointer.ts:91`:
```typescript
export function handlePointerDown(event, context) {
  // ...

  // E2E Test API: Increment pending operations counter
  // This will be decremented after the full round-trip completes (syncSelectionCache)
  context.selection.incrementPendingOperations();

  // Handle pointer down logic...
}
```

**Every `pointerdown` increments the counter**, which only decrements after a full round-trip:
1. Renderer processes `pointerdown` → `pendingOperations++`
2. Renderer sends `objects-selected` to Board
3. Board updates Yjs store
4. Yjs observer sends `objects-updated` back to renderer
5. Renderer calls `syncSelectionCache()` → `pendingOperations--`

This round-trip can take multiple frames, especially with:
- 15 objects in the scene (from "Reset to Test Scene")
- Yjs store updates
- Message passing between main thread and renderer
- In CI: slower execution, more overhead

### The Problem Pattern

**Original test flow (SLOW):**
```typescript
// Click to select object
await canvas.dispatchEvent('pointerdown', ...);
await canvas.dispatchEvent('pointerup', ...);
await waitForRenderer(); // ✓ Fast (16ms) - no pending ops

// Verify selected
await waitForRenderer(); // ✓ Fast (16ms) - no pending ops

// Start drag
await canvas.dispatchEvent('pointerdown', ...); // pendingOperations++ (now = 1)

// Drag loop (5 iterations)
for (let i = 1; i <= 5; i++) {
  await canvas.dispatchEvent('pointermove', ...);
  await waitForRenderer(); // ❌ SLOW! Polls for round-trip from previous pointerdown
  // Each waitForRenderer can take up to 1.67s if round-trip is slow
}
```

### Timing Breakdown

**Why it took ~8-11 seconds:**

1. **First `waitForRenderer()` after `pointerdown`:** (inside loop iteration 1)
   - `pendingOperations = 1` (from the drag's `pointerdown`)
   - Polls waiting for selection round-trip
   - Could hit maxPolls timeout: **~1.67s**

2. **Subsequent `waitForRenderer()` calls:**
   - Depends on if round-trip completed
   - Some fast (~16ms), some slow (~1.67s)
   - With 5 calls and CI overhead: **easily 5-10 seconds total**

3. **In CI (27s total):**
   - Slower frame rate (maybe 30fps instead of 60fps)
   - 100 frames at 30fps = **3.3s per timeout**
   - More background load, slower Yjs updates
   - Multiple timeouts compound to huge delays

## Why The Fix Works

**After removing `waitForRenderer()` from inside the drag loop:**

```typescript
// Start drag
await canvas.dispatchEvent('pointerdown', ...); // pendingOperations++ (now = 1)

// Drag loop (5 iterations) - NO WAITING
for (let i = 1; i <= 5; i++) {
  await canvas.dispatchEvent('pointermove', ...);
  // No waitForRenderer! Just fire events
}

// End drag
await canvas.dispatchEvent('pointerup', ...);

// NOW wait for everything to settle
await waitForRenderer(); // ✓ Wait once at the end
```

**Results:**
- Local: 11.8s → 3.3s (**72% faster**)
- Expected CI: 27s → ~5-8s (estimated, need to verify)

## Key Insight

**During an active drag, we don't need to wait for renderer synchronization after each `pointermove` event.**

Why?
- `pointermove` doesn't trigger selection changes during drag
- Objects move visually in real-time
- State synchronization only matters after the drag completes (`pointerup`)
- Waiting inside the loop creates artificial bottlenecks with no benefit

## Lessons Learned

1. **`waitForRenderer()` is not "free"** - it can poll for up to 1.67s per call (up to 3.3s in slow environments)
2. **Only wait at synchronization points** where you actually need state to be settled
3. **During continuous operations** (like drag loops), batching waits at the end is more efficient
4. **CI performance != local performance** - what takes 16ms locally can take 100ms+ in CI

## Related Issues
- Similar to PR #45: Cumulative overhead in CI causes timeouts that don't appear locally
- Principle: Minimize expensive operations during E2E tests, even if they seem "lightweight"
