/**
 * Unit tests for the dev-only ctTest canvas interaction helpers.
 *
 * These tests verify world<->viewport coordinate math and event-dispatch
 * shape without requiring a real Pixi canvas or Playwright.  The full
 * integration is exercised from `browser_evaluate` in Playwright MCP
 * sessions (see ct-kiu.1 smoke-test recipe).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCtTestApi } from './ctTest';

describe('ctTest', () => {
  let canvas: HTMLCanvasElement;
  let received: PointerEvent[];

  beforeEach(() => {
    canvas = document.createElement('canvas');
    // Simulate a 1000x800 canvas positioned at viewport (100, 50).
    Object.defineProperty(canvas, 'clientWidth', { value: 1000 });
    Object.defineProperty(canvas, 'clientHeight', { value: 800 });
    canvas.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        right: 1100,
        bottom: 850,
        width: 1000,
        height: 800,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(canvas);

    received = [];
    canvas.addEventListener('pointerdown', (e) => received.push(e));
    canvas.addEventListener('pointermove', (e) => received.push(e));
    canvas.addEventListener('pointerup', (e) => received.push(e));
  });

  afterEach(() => {
    canvas.remove();
    vi.useRealTimers();
  });

  it('worldToViewport: world (0,0) maps to canvas center + rect offset', () => {
    const api = createCtTestApi();
    // World (0,0) -> canvas (500, 400) -> viewport (600, 450).
    expect(api.worldToViewport({ x: 0, y: 0 })).toEqual({ x: 600, y: 450 });
  });

  it('worldToViewport: positive world coords shift toward bottom-right', () => {
    const api = createCtTestApi();
    expect(api.worldToViewport({ x: 100, y: 50 })).toEqual({ x: 700, y: 500 });
  });

  it('worldToViewport: negative world coords shift toward top-left', () => {
    const api = createCtTestApi();
    expect(api.worldToViewport({ x: -200, y: -100 })).toEqual({
      x: 400,
      y: 350,
    });
  });

  it('pointerDown dispatches a PointerEvent with viewport-absolute coords', () => {
    const api = createCtTestApi();
    api.pointerDown({ x: 0, y: 0 });

    expect(received).toHaveLength(1);
    const evt = received[0];
    expect(evt.type).toBe('pointerdown');
    expect(evt.clientX).toBe(600);
    expect(evt.clientY).toBe(450);
    expect(evt.buttons).toBe(1);
    expect(evt.button).toBe(0);
    expect(evt.pointerType).toBe('mouse');
    expect(evt.isPrimary).toBe(true);
    expect(evt.bubbles).toBe(true);
  });

  it('pointerUp defaults buttons to 0', () => {
    const api = createCtTestApi();
    api.pointerUp({ x: 0, y: 0 });

    expect(received[0].type).toBe('pointerup');
    expect(received[0].buttons).toBe(0);
  });

  it('click dispatches down then up at the same world point', () => {
    const api = createCtTestApi();
    api.click({ x: 50, y: 25 });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('pointerdown');
    expect(received[1].type).toBe('pointerup');
    expect(received[0].clientX).toBe(received[1].clientX);
    expect(received[0].clientY).toBe(received[1].clientY);
  });

  it('drag emits down + N interpolated moves + up', async () => {
    const api = createCtTestApi();
    await api.drag({ x: 0, y: 0 }, { x: 100, y: 0 }, { steps: 4 });

    // 1 down + 4 moves + 1 up = 6 events.
    expect(received).toHaveLength(6);
    expect(received[0].type).toBe('pointerdown');
    expect(received[received.length - 1].type).toBe('pointerup');

    // Moves should interpolate linearly from start to end in viewport
    // coords: down at (600,450), up at (700,450), moves at 25/50/75/100 %.
    const moveXs = received.slice(1, 5).map((e) => e.clientX);
    expect(moveXs).toEqual([625, 650, 675, 700]);
  });

  it('modifier keys pass through to the dispatched event', () => {
    const api = createCtTestApi();
    api.pointerDown({ x: 0, y: 0 }, { modifiers: { altKey: true } });

    expect(received[0].altKey).toBe(true);
    expect(received[0].shiftKey).toBe(false);
  });

  it('getCanvas throws when no canvas is present', () => {
    canvas.remove();
    const api = createCtTestApi();
    expect(() => api.getCanvas()).toThrow(/No <canvas> element found/);
  });
});

/**
 * DPR=2 regression tests (ct-kiu.6).
 *
 * The app's pointer pipeline multiplies `(clientX - rect.left)` by
 * `window.devicePixelRatio` before handing off to `screenToWorld`
 * (see `app/src/hooks/usePointerEvents.ts::serializePointerEvent`).
 * `worldContainer.position` is set to `(width/2, height/2)` where
 * `width = clientWidth * DPR` (see
 * `app/src/renderer/RendererOrchestrator.ts::initializeViewport` and
 * `app/src/hooks/useCanvasLifecycle.ts`).  For a CSS shift of `dx`
 * pixels, the resolved world delta is therefore `dx * DPR`.
 *
 * To place a pointer at world `(worldX, worldY)` with camera at origin
 * and zoom 1, the helper must emit a CSS shift of `worldX / DPR`.  The
 * expected `clientX` formula for these tests is:
 *
 *   clientX = rect.left + clientWidth/2 + pt.x / DPR
 *
 * which reduces to the old formula when DPR=1.
 *
 * Live-session setup under test:
 *   clientWidth=1200, clientHeight=565, rect.left=0, rect.top=0, DPR=2.
 * Before the fix, `__ctTest.drag({x:0,y:0}, {x:200,y:100})` landed a
 * stack at world `(400, 200)`.  After the fix, it lands at `(200, 100)`.
 */
describe('ctTest — DPR=2 (ct-kiu.6 regression)', () => {
  let canvas: HTMLCanvasElement;
  let received: PointerEvent[];
  let originalDpr: number;

  beforeEach(() => {
    originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      configurable: true,
      writable: true,
    });

    canvas = document.createElement('canvas');
    // Mirror the live-session state from the MCP verification:
    // CSS layout size 1200x565, canvas at viewport origin (0, 0).
    Object.defineProperty(canvas, 'clientWidth', { value: 1200 });
    Object.defineProperty(canvas, 'clientHeight', { value: 565 });
    // canvas.width attribute (backing-store pixels) = clientWidth * DPR * DPR
    // = 4800 under Pixi's `resolution: DPR, autoDensity: true` init.
    // Not used by the helper's math directly but matches the observed state.
    Object.defineProperty(canvas, 'width', { value: 4800, configurable: true });
    Object.defineProperty(canvas, 'height', {
      value: 2260,
      configurable: true,
    });
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 1200,
        bottom: 565,
        width: 1200,
        height: 565,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(canvas);

    received = [];
    canvas.addEventListener('pointerdown', (e) => received.push(e));
    canvas.addEventListener('pointermove', (e) => received.push(e));
    canvas.addEventListener('pointerup', (e) => received.push(e));
  });

  afterEach(() => {
    canvas.remove();
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
  });

  it('worldToViewport: world (0,0) still maps to canvas CSS center', () => {
    const api = createCtTestApi();
    // pt.x=0 -> DPR compensation is a no-op; should still land at center.
    expect(api.worldToViewport({ x: 0, y: 0 })).toEqual({ x: 600, y: 282.5 });
  });

  it('worldToViewport: world (200, 100) maps with /DPR compensation', () => {
    const api = createCtTestApi();
    // Formula: clientX = rect.left + clientWidth/2 + pt.x / DPR
    //                  = 0        + 600           + 200 / 2
    //                  = 700
    // After the pipeline (CSS shift 100 -> canvasX_physical 200 ->
    // subtract worldContainer.position.x 1200 -> world 200/cameraScale=1).
    expect(api.worldToViewport({ x: 200, y: 100 })).toEqual({
      x: 700,
      y: 332.5,
    });
  });

  it('drag({x:0,y:0} -> {x:200,y:100}) emits CSS shifts halved by DPR', async () => {
    const api = createCtTestApi();
    await api.drag({ x: 0, y: 0 }, { x: 200, y: 100 }, { steps: 4 });

    // 1 down + 4 moves + 1 up = 6 events.
    expect(received).toHaveLength(6);

    // Down at world (0,0) -> CSS center (600, 282.5).
    expect(received[0].clientX).toBe(600);
    expect(received[0].clientY).toBe(282.5);

    // Up at world (200, 100) -> CSS (600 + 100, 282.5 + 50) = (700, 332.5).
    const up = received[received.length - 1];
    expect(up.clientX).toBe(700);
    expect(up.clientY).toBe(332.5);

    // 4 interpolated moves at 25/50/75/100% of the world delta
    // (50,25), (100,50), (150,75), (200,100) -> CSS deltas /DPR
    // (25,12.5), (50,25), (75,37.5), (100,50).
    const moveXs = received.slice(1, 5).map((e) => e.clientX);
    const moveYs = received.slice(1, 5).map((e) => e.clientY);
    expect(moveXs).toEqual([625, 650, 675, 700]);
    expect(moveYs).toEqual([295, 307.5, 320, 332.5]);
  });

  it('probeObjects: viewport coords use the same /DPR compensation as worldToViewport', () => {
    // Fake a store with a single object at world (200, 100).  probeObjects
    // must report a `viewport` coord that, when dispatched as a pointer,
    // would land the world position of that object — i.e., it must equal
    // what worldToViewport({x:200,y:100}) returns.  Before the fix, the
    // probe's `viewport` was rect.left + clientWidth/2 + pos.x (no /DPR),
    // which would mis-target by 2x when used as a pointer coord.
    type YMapLike = { get: (key: string) => unknown };
    const yMap: YMapLike = {
      get: (key: string) => {
        if (key === '_kind') return 'stack';
        if (key === '_pos') return { x: 200, y: 100, r: 0 };
        return undefined;
      },
    };
    const fakeObjects = {
      forEach: (cb: (value: YMapLike, key: string) => void) => {
        cb(yMap, 'obj-1');
      },
    };
    const originalStore = window.__TEST_STORE__;
    window.__TEST_STORE__ = { objects: fakeObjects } as unknown as NonNullable<
      typeof window.__TEST_STORE__
    >;
    try {
      const api = createCtTestApi();
      const probes = api.probeObjects();
      expect(probes).toHaveLength(1);
      const probe = probes[0];
      expect(probe.world).toEqual({ x: 200, y: 100, r: 0 });

      const expected = api.worldToViewport({ x: 200, y: 100 });
      expect(probe.viewport).toEqual(expected);
      // Explicit check: CSS x = 0 + 600 + 200/2 = 700.
      expect(probe.viewport).toEqual({ x: 700, y: 332.5 });
    } finally {
      window.__TEST_STORE__ = originalStore;
    }
  });
});
