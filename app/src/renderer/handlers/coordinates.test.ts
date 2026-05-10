import { describe, it, expect, vi } from 'vitest';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { handleRequestViewportState } from './coordinates';

/**
 * Build a minimal RendererContext for handleRequestViewportState (ct-rde, ct-t9z).
 *
 * The handler only reads: worldContainer.position, app.screen.{width,height},
 * coordConverter.{getCameraScale, getDevicePixelRatio}, and posts a single
 * `viewport-state` response. We deliberately stub only that slice.
 *
 * IMPORTANT (ct-t9z): in this app PixiJS is initialised with
 *   `app.init({ width: clientWidth * dpr, height: clientHeight * dpr,
 *               resolution: dpr, autoDensity: true })`
 * (see `useCanvasLifecycle.ts` + `RendererOrchestrator.initialize`). That makes
 * `app.screen.width/height` and `worldContainer.position` carry PHYSICAL
 * (canvas) pixels — NOT CSS pixels. The fixtures below mirror that physical-px
 * convention so the unit tests match what the live renderer actually feeds
 * the handler.
 */
function buildContext(opts: {
  /** worldContainer.position.x in physical (canvas) pixels. */
  worldX: number;
  /** worldContainer.position.y in physical (canvas) pixels. */
  worldY: number;
  scale: number;
  /** app.screen.width in physical pixels (= clientWidth * dpr in this app). */
  screenWidth: number;
  /** app.screen.height in physical pixels (= clientHeight * dpr in this app). */
  screenHeight: number;
  dpr: number;
}): {
  context: RendererContext;
  postResponse: ReturnType<typeof vi.fn>;
} {
  const postResponse = vi.fn<(msg: RendererToMainMessage) => void>();
  const context = {
    worldContainer: {
      position: { x: opts.worldX, y: opts.worldY },
    },
    app: {
      screen: { width: opts.screenWidth, height: opts.screenHeight },
    },
    coordConverter: {
      getCameraScale: () => opts.scale,
      getDevicePixelRatio: () => opts.dpr,
    },
    postResponse,
  } as unknown as RendererContext;
  return { context, postResponse };
}

const requestMessage = {
  type: 'request-viewport-state',
} as Extract<MainToRendererMessage, { type: 'request-viewport-state' }>;

describe('handleRequestViewportState (ct-rde, ct-t9z)', () => {
  it('divides BOTH camera position AND viewport dims by DPR to produce CSS-pixel output', () => {
    // Retina-style display: CSS 800x600, canvas buffer 1600x1200.
    // Both worldContainer.position and app.screen carry PHYSICAL px in this
    // app (because `app.init` was called with width=clientWidth*dpr,
    // resolution=dpr — see ct-t9z root cause analysis).
    // CameraManager.initialize set worldContainer.position to
    // (app.renderer.width/2, app.renderer.height/2) = (800, 600) physical.
    const { context, postResponse } = buildContext({
      worldX: 800, // physical px
      worldY: 600, // physical px
      scale: 1,
      screenWidth: 1600, // physical px (= 800 CSS × 2 DPR)
      screenHeight: 1200, // physical px (= 600 CSS × 2 DPR)
      dpr: 2,
    });

    handleRequestViewportState(requestMessage, context);

    expect(postResponse).toHaveBeenCalledTimes(1);
    expect(postResponse).toHaveBeenCalledWith({
      type: 'viewport-state',
      cameraX: 400, // 800 / 2 → CSS pixels
      cameraY: 300, // 600 / 2 → CSS pixels
      cameraScale: 1,
      viewportWidth: 800, // 1600 / 2 → CSS pixels (ct-t9z: was 1600 before fix)
      viewportHeight: 600, // 1200 / 2 → CSS pixels (ct-t9z: was 1200 before fix)
      devicePixelRatio: 2,
    });
  });

  it('emits identical CSS-pixel snapshots for matched displays at DPR 1 vs 2', () => {
    // Two displays with the same CSS layout but different DPR. The handler
    // must produce equal cameraX/Y and viewportWidth/Height; only DPR
    // differs. This is the property the placement primitive relies on for
    // viewport-center to land in the same world position regardless of DPR.
    //
    // In this app the renderer-side values scale with DPR (because of how
    // `app.init` is called — see buildContext doc), so dpr=2 inputs are 2×
    // their dpr=1 counterparts; after the /dpr in the handler they collapse.
    const dpr1 = buildContext({
      worldX: 600, // physical px (= CSS at DPR 1)
      worldY: 400,
      scale: 1.5,
      screenWidth: 1200,
      screenHeight: 800,
      dpr: 1,
    });
    const dpr2 = buildContext({
      worldX: 1200, // physical px (= 2× CSS at DPR 2)
      worldY: 800,
      scale: 1.5,
      screenWidth: 2400, // physical px (= 1200 CSS × 2 DPR)
      screenHeight: 1600,
      dpr: 2,
    });

    handleRequestViewportState(requestMessage, dpr1.context);
    handleRequestViewportState(requestMessage, dpr2.context);

    const call1 = dpr1.postResponse.mock.calls[0][0] as Extract<
      RendererToMainMessage,
      { type: 'viewport-state' }
    >;
    const call2 = dpr2.postResponse.mock.calls[0][0] as Extract<
      RendererToMainMessage,
      { type: 'viewport-state' }
    >;

    // Camera + viewport dimensions match (both reported in CSS pixels).
    expect(call1.cameraX).toBe(call2.cameraX);
    expect(call1.cameraY).toBe(call2.cameraY);
    expect(call1.viewportWidth).toBe(call2.viewportWidth);
    expect(call1.viewportHeight).toBe(call2.viewportHeight);
    expect(call1.cameraScale).toBe(call2.cameraScale);

    // DPR is reported separately so consumers can scale results back into
    // the renderer's canvas-pixel world space when storing object positions.
    expect(call1.devicePixelRatio).toBe(1);
    expect(call2.devicePixelRatio).toBe(2);
  });

  it('post-pan: viewport-state still yields a world centre at the new CSS centre (ct-t9z)', () => {
    // Setup: CSS 800x600 viewport on a DPR=2 display.
    //   app.screen = (1600, 1200) physical px
    //   worldContainer.position (post-init) = (800, 600) physical px
    // The user pans by (+200, -100) physical px (see
    // `app/src/hooks/usePointerEvents.ts` — clientX deltas are multiplied by
    // DPR before being fed to the renderer, so `camera.pan` operates in
    // physical px and the position stays in a single unit system).
    //   worldContainer.position = (1000, 500) physical px.
    //
    // The viewport-state handler must produce a snapshot the placement
    // primitive can pair with viewport dims to yield a world coord that
    // renders at the post-pan canvas centre when the consumer scales back
    // by DPR.
    const { context, postResponse } = buildContext({
      worldX: 1000, // 800 + 200 pan
      worldY: 500, // 600 - 100 pan
      scale: 1,
      screenWidth: 1600,
      screenHeight: 1200,
      dpr: 2,
    });
    handleRequestViewportState(requestMessage, context);
    const call = postResponse.mock.calls[0][0] as Extract<
      RendererToMainMessage,
      { type: 'viewport-state' }
    >;
    // All values in CSS px:
    expect(call.cameraX).toBe(500);
    expect(call.cameraY).toBe(250);
    expect(call.viewportWidth).toBe(800);
    expect(call.viewportHeight).toBe(600);
    expect(call.cameraScale).toBe(1);

    // Pair with the placement util to verify the world coord
    // round-trips to a stage position equal to the canvas CSS centre.
    // Placement (no jitter) → world = ((800/2 - 500)/1, (600/2 - 250)/1)
    //                              = (-100, 50) in CSS px.
    // Consumer multiplies by DPR=2 → _pos = (-200, 100) physical px.
    // visual stage position = (1000 + -200, 500 + 100) = (800, 600).
    // CSS = (800/2, 600/2) = (400, 300) — exactly canvas CSS centre ✓.
    const placement = {
      x: (call.viewportWidth / 2 - call.cameraX) / call.cameraScale,
      y: (call.viewportHeight / 2 - call.cameraY) / call.cameraScale,
    };
    const worldStorePos = {
      x: placement.x * call.devicePixelRatio,
      y: placement.y * call.devicePixelRatio,
    };
    const stageXAfterAdd = context.worldContainer.position.x + worldStorePos.x;
    const stageYAfterAdd = context.worldContainer.position.y + worldStorePos.y;
    expect(stageXAfterAdd / call.devicePixelRatio).toBe(400); // canvas CSS centre x
    expect(stageYAfterAdd / call.devicePixelRatio).toBe(300); // canvas CSS centre y
  });

  it('post-zoom: viewport-state still yields a world centre at the canvas CSS centre (ct-t9z)', () => {
    // Setup: CSS 800x600 on DPR=2, then the user wheels-zoomed to scale=1.5
    // with mouse anchored at canvas centre. Per CameraManager.zoom:
    //   worldContainer.position.x = mouseX - worldPoint.x * newScale
    // where mouseX is in physical px (Board.tsx forwards a DPR-multiplied
    // clientX). With mouse at canvas centre and worldPoint at (0, 0):
    //   position = (canvasCentrePhysical.x, canvasCentrePhysical.y) = (800, 600)
    // (scale doesn't shift it because worldPoint = 0).
    // We assert the placement still lands at canvas CSS centre.
    const { context, postResponse } = buildContext({
      worldX: 800,
      worldY: 600,
      scale: 1.5,
      screenWidth: 1600,
      screenHeight: 1200,
      dpr: 2,
    });
    handleRequestViewportState(requestMessage, context);
    const call = postResponse.mock.calls[0][0] as Extract<
      RendererToMainMessage,
      { type: 'viewport-state' }
    >;
    expect(call.cameraX).toBe(400);
    expect(call.cameraY).toBe(300);
    expect(call.viewportWidth).toBe(800);
    expect(call.viewportHeight).toBe(600);
    expect(call.cameraScale).toBe(1.5);

    // Placement: world = ((800/2 - 400)/1.5, (600/2 - 300)/1.5) = (0, 0).
    // Consumer multiplies by DPR=2 → _pos = (0, 0).
    // visual stage position = (800 + 0*1.5, 600 + 0*1.5) = (800, 600).
    // CSS = (400, 300) — canvas CSS centre ✓.
    const placement = {
      x: (call.viewportWidth / 2 - call.cameraX) / call.cameraScale,
      y: (call.viewportHeight / 2 - call.cameraY) / call.cameraScale,
    };
    expect(placement.x).toBe(0);
    expect(placement.y).toBe(0);
  });
});
