# User Input → Renderer Animation Architecture

## Current Problem

We have a brittle "detection" approach for triggering renderer animations in response to user actions:

### Current Flow (Detection-Based)
1. **User input**: Presses 'S' (shuffle) or 'F' (flip)
2. **Action executes**: Modifies Yjs store (e.g., shuffles card array, toggles `_faceUp`)
3. **Store sync**: Board receives `objects-updated` message
4. **Renderer receives update**: Gets new object state
5. **Detection logic**: Renderer compares old vs new state to "guess" what happened
   - Flip detection: Check if `_faceUp` changed (line 260-294 in `objects.ts`)
   - Shuffle detection: Check if cards same set but different order (line 306-338 in `objects.ts`)
6. **Animation triggers**: If detection passes, play animation

### Problems with Detection

1. **Fragile logic**: Shuffle was triggering on flip because flip also reorders internal card representation
   - Quick fix: Skip shuffle detection when `faceUpChanged` (line 312)
   - But this is a band-aid on a fundamental architecture issue

2. **Ambiguous state changes**: Hard to distinguish intentional actions from incidental state changes
   - Example: What if we add "sort stack by cost"? Would trigger shuffle animation incorrectly

3. **No action context**: Renderer has no knowledge of WHY state changed, only THAT it changed

4. **Race conditions**: Detection runs async, can miss rapid actions or get confused by concurrent changes

5. **Maintenance burden**: Every new animation-worthy action requires adding detection logic

## Desired Architecture

### Explicit Animation Commands

Instead of detection, actions should explicitly command animations:

```
User input → Action → Store mutation + Animation message → Renderer → Animation
```

**Benefits:**
- No ambiguity: Shuffle action explicitly says "animate shuffle"
- No false positives: Only animations we explicitly request
- Separation of concerns: Actions know intent, renderer handles visuals
- Extensible: New actions trivially add animations

### Design Options

#### Option 1: Store-Based Animation Queue
Actions write to a special Yjs map:
```typescript
// Action
shuffleStack(store, stackId);
store.metadata.set('pendingAnimations', [
  { type: 'shuffle', objectId: stackId, timestamp: Date.now() }
]);

// Board observes
store.metadata.observe((event) => {
  const animations = event.target.get('pendingAnimations');
  for (const anim of animations) {
    renderer.sendMessage({ type: 'animate-shuffle', objectId: anim.objectId });
  }
  store.metadata.delete('pendingAnimations'); // Clear after sending
});
```

**Pros:**
- Uses existing store infrastructure
- Naturally synchronizes across multiplayer (all clients see animations)

**Cons:**
- Animations are part of document state (weird semantically)
- Yjs overhead for transient data
- Cleanup complexity

#### Option 2: Event Emitter
Actions emit events, Board listens and forwards to renderer:
```typescript
// Action
shuffleStack(store, stackId);
store.emit('animate', { type: 'shuffle', objectId: stackId });

// Board
store.on('animate', (event) => {
  renderer.sendMessage({ type: `animate-${event.type}`, objectId: event.objectId });
});
```

**Pros:**
- Clean separation (events ≠ state)
- No Yjs overhead
- Standard event pattern

**Cons:**
- Requires adding event emitter to YjsStore
- Events don't sync across multiplayer (but maybe that's good - each client animates locally)

#### Option 3: ActionContext Callback
Pass renderer message function through ActionContext:
```typescript
// ActionContext
interface ActionContext {
  // ... existing fields
  sendAnimationMessage?: (type: 'shuffle', objectId: string) => void;
}

// Action
ctx.sendAnimationMessage?.('shuffle', stackId);

// Board provides callback
buildActionContext(store, selection, navigate, route, gridSnap, setGridSnap,
  (type, objectId) => {
    renderer.sendMessage({ type: `animate-${type}`, objectId });
  }
);
```

**Pros:**
- Direct path: Action → Board → Renderer
- No new infrastructure

**Cons:**
- Callback hell (Board → Table → ActionContext → Action)
- Tight coupling between layers
- Confusing data flow

#### Option 4: Hybrid - Keep Detection, Make It Smarter
Improve detection instead of replacing it:
```typescript
// Track operation context
interface OperationContext {
  type: 'shuffle' | 'flip' | 'sort' | 'user-move';
  timestamp: number;
}

// Action sets context
shuffleStack(store, stackId);
store.setOperationContext({ type: 'shuffle', timestamp: Date.now() });

// Detection checks context
if (isShuffle && store.getRecentOperationContext()?.type === 'shuffle') {
  // Definitely a shuffle, animate it
}
```

**Pros:**
- Incremental improvement, less risky
- Keeps existing patterns

**Cons:**
- Still detection-based (fundamentally fragile)
- Operation context = more state to manage
- Doesn't solve multiplayer animation sync

## Recommendation

**Option 2 (Event Emitter)** seems cleanest for single-player, but **Option 1 (Store-Based Queue)** is better for multiplayer since animations should sync.

However, given current constraints and the fact that animations are local-only visual feedback (not game state), **Option 2** is recommended:
- Animations don't need to sync (each client animates their own view)
- Clean architecture without Yjs overhead
- Easy to implement incrementally

## Implementation Plan

1. Add event emitter to YjsStore
2. Update actions to emit animation events
3. Update Board to listen and forward to renderer
4. Remove detection logic from renderer
5. Update tests

## Current Workaround

For now, using detection with `!faceUpChanged` check to avoid flip/shuffle collision. This works but is the band-aid we need to eventually replace.

## Related Files

- `app/src/renderer/handlers/objects.ts` - Detection logic (lines 260-338)
- `app/src/actions/registerDefaultActions.ts` - Shuffle action
- `app/src/store/YjsActions.ts` - Store mutations
- `shared/src/index.ts` - Message types
