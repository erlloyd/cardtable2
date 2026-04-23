/**
 * Dev-only canvas interaction helpers for autonomous browser verification.
 *
 * Exposed at `window.__ctTest` when `import.meta.env.DEV` is true (see
 * `main.tsx`).  Intended to be invoked from Playwright MCP's
 * `browser_evaluate` so Claude can drive the canvas the same way the E2E
 * suite does, without re-injecting helper code every session.
 *
 * Background:
 * - `<canvas>` doesn't receive native React `onPointer*` events from
 *   `page.mouse` (it dispatches `mousedown/mousemove/mouseup` which React
 *   won't lift to its pointer handlers).  The E2E suite works around this
 *   by calling `canvas.dispatchEvent('pointerdown', { ... })` with
 *   viewport-absolute `clientX/clientY`.  We mirror that pattern here.
 * - World coordinates map to canvas-relative coords as
 *   `canvasRelX = worldX + canvas.clientWidth / 2` (and likewise for y).
 *   This assumes the camera is at origin with zoom 1 — the same
 *   assumption the E2E suite makes.  Call `__ctTest.resetCamera()` first
 *   if you've panned/zoomed.
 * - The bounding rect is read once per invocation because layout can
 *   shift (responsive menus, hand panel, etc.).
 *
 * See CLAUDE.md section "Autonomous browser verification" for the full
 * recipe; see `app/e2e/selection.spec.ts` (around line 460) for the
 * original dispatch pattern this mirrors.
 */

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface PointerOptions {
  /** Defaults to 1. */
  pointerId?: number;
  /** Defaults to 'mouse'. */
  pointerType?: 'mouse' | 'pen' | 'touch';
  /** Defaults to 0 (primary button). */
  button?: number;
  /** Defaults to 1 (primary button down) for down/move, 0 for up. */
  buttons?: number;
  modifiers?: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  };
}

export interface DragOptions extends PointerOptions {
  /** Intermediate steps for the move phase.  Defaults to 10. */
  steps?: number;
  /** Milliseconds to wait between steps.  Defaults to 0 (synchronous). */
  stepDelayMs?: number;
}

export interface CtTestApi {
  /**
   * Find the primary table canvas.  Returns the first `<canvas>` element;
   * there is only one on the `/table/$id` route.
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Convert a world-space point to viewport-absolute coordinates for
   * `clientX/clientY`.  Assumes camera at origin, zoom 1.
   */
  worldToViewport(pt: WorldPoint): ViewportPoint;

  /** Dispatch a `pointerdown` at the given world point. */
  pointerDown(pt: WorldPoint, opts?: PointerOptions): void;

  /** Dispatch a `pointermove` at the given world point. */
  pointerMove(pt: WorldPoint, opts?: PointerOptions): void;

  /** Dispatch a `pointerup` at the given world point. */
  pointerUp(pt: WorldPoint, opts?: PointerOptions): void;

  /**
   * Perform a full drag gesture: down at `from`, N interpolated moves,
   * up at `to`.  Returns a promise that resolves after the final `up`.
   */
  drag(from: WorldPoint, to: WorldPoint, opts?: DragOptions): Promise<void>;

  /**
   * Click at the given world point (down + up at same position).
   */
  click(pt: WorldPoint, opts?: PointerOptions): void;

  /**
   * Read the positions of the first N objects in the store so you can
   * target drags without guessing.  Returns canvas-relative AND
   * viewport-absolute coords alongside the world pos.
   */
  probeObjects(limit?: number): Array<{
    id: string;
    kind: string;
    world: { x: number; y: number; r: number };
    canvas: ViewportPoint;
    viewport: ViewportPoint;
  }>;
}

const DEFAULT_DRAG_STEPS = 10;

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    throw new Error(
      '[ctTest] No <canvas> element found.  Are you on /table/$id?',
    );
  }
  return canvas;
}

function worldToViewport(
  canvas: HTMLCanvasElement,
  pt: WorldPoint,
): ViewportPoint {
  const rect = canvas.getBoundingClientRect();
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  return {
    x: rect.left + pt.x + cx,
    y: rect.top + pt.y + cy,
  };
}

function dispatchPointer(
  canvas: HTMLCanvasElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pt: ViewportPoint,
  opts: PointerOptions,
): void {
  const pointerId = opts.pointerId ?? 1;
  const pointerType = opts.pointerType ?? 'mouse';
  const button = opts.button ?? 0;
  const buttons = opts.buttons ?? (type === 'pointerup' ? 0 : 1);
  const modifiers = opts.modifiers ?? {};

  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType,
    isPrimary: true,
    clientX: pt.x,
    clientY: pt.y,
    screenX: pt.x,
    screenY: pt.y,
    button,
    buttons,
    shiftKey: modifiers.shiftKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  });

  canvas.dispatchEvent(event);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createCtTestApi(): CtTestApi {
  const api: CtTestApi = {
    getCanvas: requireCanvas,

    worldToViewport(pt) {
      return worldToViewport(requireCanvas(), pt);
    },

    pointerDown(pt, opts = {}) {
      const canvas = requireCanvas();
      dispatchPointer(canvas, 'pointerdown', worldToViewport(canvas, pt), opts);
    },

    pointerMove(pt, opts = {}) {
      const canvas = requireCanvas();
      dispatchPointer(canvas, 'pointermove', worldToViewport(canvas, pt), opts);
    },

    pointerUp(pt, opts = {}) {
      const canvas = requireCanvas();
      dispatchPointer(canvas, 'pointerup', worldToViewport(canvas, pt), {
        ...opts,
        buttons: opts.buttons ?? 0,
      });
    },

    click(pt, opts = {}) {
      api.pointerDown(pt, opts);
      api.pointerUp(pt, opts);
    },

    async drag(from, to, opts = {}) {
      const steps = opts.steps ?? DEFAULT_DRAG_STEPS;
      const stepDelayMs = opts.stepDelayMs ?? 0;
      const canvas = requireCanvas();

      dispatchPointer(
        canvas,
        'pointerdown',
        worldToViewport(canvas, from),
        opts,
      );
      await delay(stepDelayMs);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const interp: WorldPoint = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        };
        dispatchPointer(
          canvas,
          'pointermove',
          worldToViewport(canvas, interp),
          opts,
        );
        await delay(stepDelayMs);
      }

      dispatchPointer(canvas, 'pointerup', worldToViewport(canvas, to), {
        ...opts,
        buttons: opts.buttons ?? 0,
      });
    },

    probeObjects(limit = 10) {
      const store = window.__TEST_STORE__;
      if (!store) {
        throw new Error(
          '[ctTest] window.__TEST_STORE__ is not exposed.  Only available in DEV or VITE_E2E builds on /table/$id.',
        );
      }
      const canvas = requireCanvas();
      const rect = canvas.getBoundingClientRect();
      const cx = canvas.clientWidth / 2;
      const cy = canvas.clientHeight / 2;

      const objects = store.objects;
      const results: ReturnType<CtTestApi['probeObjects']> = [];
      let i = 0;
      objects.forEach((yMap, id) => {
        if (i >= limit) return;
        i++;
        const kind = yMap.get('_kind') as string;
        const pos = yMap.get('_pos') as { x: number; y: number; r: number };
        const canvasRel: ViewportPoint = { x: pos.x + cx, y: pos.y + cy };
        const viewport: ViewportPoint = {
          x: rect.left + canvasRel.x,
          y: rect.top + canvasRel.y,
        };
        results.push({ id, kind, world: pos, canvas: canvasRel, viewport });
      });
      return results;
    },
  };

  return api;
}

/**
 * Install `window.__ctTest` in development builds.  Idempotent.  Safe to
 * call at app startup.
 */
export function installCtTest(): void {
  if (!import.meta.env.DEV && !import.meta.env.VITE_E2E) return;
  if (window.__ctTest) return;
  window.__ctTest = createCtTestApi();
  console.log('[ctTest] installed window.__ctTest (dev-only helper)');
}
