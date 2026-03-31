# Refactor DragManager Reset API (Issue #79)

## Problem

DragManager has 3 reset methods (`clear()`, `cancelObjectDrag()`, `endObjectDrag()`) with overlapping but subtly different semantics. This caused a regression when `clearUnstackWaiting()` was added to `clear()`, breaking the unstack-then-drag flow.

Root cause: DragManager conflates three independent state groups with different lifecycles, and reset methods don't align to those groups.

## State Groups

| Group | Fields | Lifecycle |
|-------|--------|-----------|
| A: Pointer event | `pointerDownEvent` | pointer-down through pointer-up, not drag state |
| B: Drag prep/execution | `isObjectDragging`, `isPhantomDragging`, `dragState`, `isUnstackDrag` | single drag gesture |
| C: Async unstack | `waitingForUnstackSource`, `unstackTimeoutId` | spans unstack request to objects-added response |

## Current Reset Method Overlap

| Method | Group A | Group B | Group C |
|--------|---------|---------|---------|
| `clear()` | Clears | Clears | **NOT cleared** |
| `cancelObjectDrag()` | **NOT cleared** | Clears | Clears |
| `endObjectDrag()` | **NOT cleared** | **Partial** (misses `isPhantomDragging`, `isUnstackDrag`) | **NOT cleared** |

## Plan

### Step 1: Write Unit Tests for Behavioral Contracts

**Create**: `app/src/renderer/managers/DragManager.test.ts`

Test the **behaviors we need to preserve**, not the current method names:

- **"Reset drag prep but preserve unstack waiting"** — the contract at pointer.ts:292. After resetting drag prep during an unstack flow, `isWaitingForUnstackFrom()` still returns true, `isDragging()` returns false, drag state is null.
- **"Reset everything"** — the contract at objects.ts:238 and cancel sites. After a full reset, ALL state is cleared including unstack waiting.
- **`endObjectDrag()` returns position updates and clears drag state** — this method survives the refactor unchanged.
- **`endObjectDrag()` orphan bug** — document that `isUnstackDragActive()` returns stale `true` after `endObjectDrag()`. This test will be updated when the bug is fixed in Step 2.
- **`pointerDownEvent` lifecycle** — set/get/clear work correctly (tests will move to GestureRecognizer in Step 3).
- **Unstack waiting lifecycle** — set/check/clear/timeout behavior.

**Verify**: `pnpm --filter @cardtable2/app test DragManager`

### Step 2: Fix `endObjectDrag` Bug + Run E2E Baseline

**Commit 1**

**File**: `DragManager.ts`

Add `this.isUnstackDrag = false` to `endObjectDrag()` alongside existing clears.

Update the orphan bug test from Step 1 to expect `isUnstackDragActive() === false`.

**Verify**:
- `pnpm --filter @cardtable2/app test DragManager` — unit tests pass
- `cd app && pnpm run test:e2e` — all E2E tests pass (especially stack-operations Test 6)

### Step 3: Refactor Reset Methods, Move pointerDownEvent, Update Call Sites

**Commit 2** (steps 4-6 combined)

**DragManager.ts**:
- Rename `clear()` → `resetDragPrep()`, remove `pointerDownEvent` clearing
- Replace `cancelObjectDrag()` with `resetAll()` = `resetDragPrep()` + `clearUnstackWaiting()`
- Remove `pointerDownEvent` field and its 3 accessors
- Add `modifiers` parameter to `startObjectDrag()` to replace internal `pointerDownEvent` read

**GestureRecognizer.ts**:
- Add `pointerDownEvent` field + set/get/clear methods

**pointer.ts** — update all call sites:

| Line | Old | New |
|------|-----|-----|
| 112 | `cancelObjectDrag()` | `resetAll()` |
| 127 | `context.drag.setPointerDownEvent()` | `context.gestures.setPointerDownEvent()` |
| 166 | `cancelObjectDrag()` | `resetAll()` |
| 169 | `cancelObjectDrag()` | `resetAll()` |
| 292 | `clear()` | `resetDragPrep()` |
| 323,373,747,878 | `context.drag.getPointerDownEvent()` | `context.gestures.getPointerDownEvent()` |
| 980,1145 | `context.drag.clearPointerDownEvent()` | `context.gestures.clearPointerDownEvent()` |
| startObjectDrag calls | no modifiers | pass `{ metaKey, ctrlKey }` from pointer event |

**objects.ts**:

| Line | Old | New |
|------|-----|-----|
| 196 | `cancelObjectDrag()` | `resetAll()` |
| 238-239 | `clear()` + `clearUnstackWaiting()` | `resetAll()` |
| startObjectDrag call | no modifiers | pass `{}` (unstack continuation is always single-object) |

**Unit tests**: Update to use new method names (`resetDragPrep`, `resetAll`), move `pointerDownEvent` tests to GestureRecognizer.

**Verify**:
- `pnpm --filter @cardtable2/app test` — all unit tests pass
- `cd app && pnpm run test:e2e` — all E2E tests pass
- `pnpm run typecheck`
- `pnpm run lint`

### Step 4: Final Verification

1. `pnpm run validate` — full suite (lint, typecheck, test, build)

## Files to Change

- `app/src/renderer/managers/DragManager.ts` — primary refactor
- `app/src/renderer/managers/GestureRecognizer.ts` — receive `pointerDownEvent`
- `app/src/renderer/handlers/pointer.ts` — update all call sites
- `app/src/renderer/handlers/objects.ts` — update call sites
- `app/src/renderer/managers/DragManager.test.ts` — new unit tests

## Key Risk: `startObjectDrag` Coupling

`startObjectDrag()` internally reads `this.pointerDownEvent` to check modifier keys for multi-select drag behavior. Solution: add a `modifiers?: { metaKey?: boolean; ctrlKey?: boolean }` parameter. Callers in `pointer.ts` pass from the pointer event; caller in `objects.ts` (unstack continuation) passes `{}`.

## Key Risk: GestureRecognizer.clear()

Adding `pointerDownEvent` clearing to `GestureRecognizer.clear()` is safe — it's only called during lifecycle teardown, never mid-gesture.
