# E2E Test Timeout Analysis

## Failing Test
`e2e/selection.spec.ts:583` - "dragging an already selected object keeps it selected and moves it"

## Key Findings

### Test Duration
- **Local execution**: 11.8 seconds for a SINGLE test
- This is extremely slow and indicates a performance bottleneck
- In CI with resource constraints, this test times out

### Root Cause: Excessive `waitForRenderer()` Calls During Drag

The test performs these steps:
1. Reset to test scene (creates 15 objects)
2. Click to select object
3. Wait for renderer
4. **Start drag loop** (5 iterations):
   - Dispatch `pointermove` event
   - **Call `waitForRenderer()` after EACH move** ← PROBLEM
5. Dispatch `pointerup`
6. Wait for renderer
7. Verify result

### Why This Causes Timeouts

#### 1. `waitForRenderer()` Implementation
From `src/renderer/handlers/testing.ts`:
```typescript
export function handleFlush(context: RendererContext): void {
  if (context.selection.getPendingOperations() === 0) {
    // Respond after 1 frame
    requestAnimationFrame(() => {
      context.postResponse({ type: 'flushed' });
    });
  } else {
    // Poll until pendingOperations reaches 0
    const maxPolls = 100; // 100 frames = ~1.67s at 60fps
    const pollFrame = () => {
      pollCount++;
      if (pendingOperations === 0) {
        context.postResponse({ type: 'flushed' });
      } else if (pollCount >= maxPolls) {
        // Timeout warning but still resolve
        context.postResponse({ type: 'flushed' });
      } else {
        requestAnimationFrame(pollFrame);
      }
    };
    requestAnimationFrame(pollFrame);
  }
}
```

#### 2. Cumulative Overhead
- **5 `waitForRenderer()` calls during drag loop**
- Each can poll up to 100 frames (1.67 seconds)
- With 15 objects created by "Reset to Test Scene", rendering overhead increases
- **Total potential wait time: 5 × 1.67s = 8.35 seconds** just for the drag loop
- Add initial setup + verification = easily exceeds timeout thresholds in CI

#### 3. CI Resource Constraints
Similar to the issue fixed in PR #45:
- Tests pass locally but timeout in CI
- Cumulative overhead of operations becomes pronounced in resource-constrained environments
- The debug logging we removed earlier helped, but this is a more fundamental architectural issue

### Comparison with Other Tests

**Tests that DON'T timeout:**
- action-handle.spec.ts - No drag loops with waitForRenderer()
- grid-snap.spec.ts - No pointermove events
- stack-operations.spec.ts - No drag loops with waitForRenderer()

**Tests with same pattern (line 493-516):**
- "clicking on an unselected object selects it" - Also has drag loop with 5 × waitForRenderer()
- This test might also be close to timing out but happens to pass

### The Core Issue

**During an active drag operation, we don't need to wait for renderer after each pointermove event.**

Why?
- `pointermove` during drag doesn't trigger selection changes (no `pendingOperations` increment)
- Objects are being moved visually, but state updates happen asynchronously
- The only critical synchronization point is **after the drag completes** (after `pointerup`)

### Proposed Solution

**Remove `waitForRenderer()` calls from inside drag loops:**

```typescript
// Current (SLOW - 11.8s):
for (let i = 1; i <= 5; i++) {
  await canvas.dispatchEvent('pointermove', { /* ... */ });
  await page.evaluate(async () => {
    await (globalThis as any).__TEST_BOARD__.waitForRenderer(); // ← REMOVE THIS
  });
}

// Proposed (FAST):
for (let i = 1; i <= 5; i++) {
  await canvas.dispatchEvent('pointermove', { /* ... */ });
  // No wait - pointermove events are processed asynchronously
}
```

**Only wait after the drag completes:**
```typescript
await canvas.dispatchEvent('pointerup', { /* ... */ });
await page.evaluate(async () => {
  await (globalThis as any).__TEST_BOARD__.waitForRenderer(); // ← Keep this
});
```

### Expected Impact
- Reduce test time from 11.8s to ~2-3s
- Eliminate CI timeouts caused by cumulative overhead
- Maintain test reliability - still wait at critical synchronization points

### Files to Modify
1. `e2e/selection.spec.ts:681-698` - Remove waitForRenderer from drag loop (line 583 test)
2. `e2e/selection.spec.ts:493-516` - Remove waitForRenderer from drag loop (line 422 test - "clicking on an unselected object selects it")

### Related Issues
- PR #45: Fixed E2E test timeouts by disabling `antialias` during E2E tests
- Similar pattern: tests pass locally but timeout in CI due to cumulative overhead
- This fix follows the same principle: reduce unnecessary overhead during E2E tests
