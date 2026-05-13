/**
 * Generic-counter spawn primitive (ct-73z).
 *
 * Used by the always-available "Load Counter..." action to drop a generic
 * counter at viewport center. Mirrors the placement pipeline in
 * `loadHandler.ts` (additive load path):
 *
 *   1. Read async viewport state from the renderer's `getViewportState`
 *      promise (CSS pixels; see `viewportPlacement.ts`).
 *   2. Compute viewport-center world coords (with default jitter).
 *   3. Translate CSS-pixel world coords to canvas-pixel world coords using
 *      the reported devicePixelRatio.
 *   4. Call `createObject` with `kind: Counter`. `createCounterMeta` (invoked
 *      inside `createObject`) materialises the generic defaults — the helper
 *      is NOT modified here per the ct-c7c data-model lock.
 *
 * Defining this as a pure async function (no React, no PixiJS) keeps the
 * action layer thin: routes pass in the `getViewportState` they already use
 * for `handleLoadSelection`, and the action handler just invokes this.
 *
 * Why generic typeId is hard-coded here rather than passed: this primitive
 * is intentionally the "Generic" spawn path. When the picker bead lands, a
 * separate typed-counter spawn primitive will exist alongside this one (and
 * the action will route to the picker first). For now, the only call site
 * is the unconditional generic-spawn action.
 */

import { ObjectKind, type Position } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';
import { COUNTER_TYPE_GENERIC } from '../renderer/objects/counter/constants';
import {
  getViewportCenterPlacement,
  type ViewportState,
} from '../utils/viewportPlacement';
import { dbg } from '../dev/dbg';

export interface SpawnGenericCounterDeps {
  store: YjsStore;
  /** Async snapshot of the current viewport — see Board.getViewportState. */
  getViewportState: () => Promise<ViewportState>;
}

/**
 * Translate a CSS-pixel world coordinate into the renderer's native
 * canvas-pixel world space. Identical to the helper used in `loadHandler.ts`
 * — kept local rather than exported because the two callsites have
 * deliberately different surface (a load operation returns a Promise<void>
 * driving error UI; this returns a counter id directly).
 */
function toCanvasPxPlacement(
  placement: { x: number; y: number },
  devicePixelRatio: number,
): { x: number; y: number } {
  return {
    x: placement.x * devicePixelRatio,
    y: placement.y * devicePixelRatio,
  };
}

/**
 * Spawn a generic counter (`typeId === 'generic'`) at viewport center.
 *
 * Returns the new counter's id on success, or `null` if the viewport-state
 * read failed (logged via `console.error`; never throws). Defaults for the
 * counter come from `createCounterMeta` inside `createObject` — this helper
 * intentionally passes no template overrides.
 */
export async function spawnGenericCounter(
  deps: SpawnGenericCounterDeps,
): Promise<string | null> {
  let viewport: ViewportState;
  try {
    viewport = await deps.getViewportState();
  } catch (error) {
    console.error('[SpawnCounter] Failed to read viewport state', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  // No jitter for counter spawn — single object, predictable placement.
  // Matches the spec ("center of viewport") in ct-73z.
  const placement = toCanvasPxPlacement(
    getViewportCenterPlacement(viewport, { jitterRadius: 0 }),
    viewport.devicePixelRatio,
  );

  const pos: Position = { x: placement.x, y: placement.y, r: 0 };
  const id = createObject(deps.store, {
    kind: ObjectKind.Counter,
    pos,
    meta: {
      // Explicit for clarity — createCounterMeta also defaults to this, but
      // pinning the typeId at the call site makes the spawn-path intent
      // unambiguous (this primitive is the generic path, full stop).
      type: COUNTER_TYPE_GENERIC,
      typeId: COUNTER_TYPE_GENERIC,
    },
  });

  dbg(
    'plugin-loading',
    `Spawned generic counter id=${id} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`,
  );
  return id;
}
