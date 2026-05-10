import { describe, it, expect, vi } from 'vitest';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { handleRequestViewportState } from './coordinates';

/**
 * Build a minimal RendererContext for handleRequestViewportState (ct-rde).
 *
 * The handler only reads: worldContainer.position, app.screen.{width,height},
 * coordConverter.{getCameraScale, getDevicePixelRatio}, and posts a single
 * `viewport-state` response. We deliberately stub only that slice.
 */
function buildContext(opts: {
  worldX: number;
  worldY: number;
  scale: number;
  screenWidth: number;
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

describe('handleRequestViewportState (ct-rde)', () => {
  it('reports viewport dimensions in CSS pixels (app.screen, not app.renderer)', () => {
    // Retina-style display: CSS 800x600, canvas buffer 1600x1200.
    // worldContainer.position.x is set by CameraManager.initialize from
    // app.renderer.width/2, so it sits at 800 in canvas-pixel space.
    const { context, postResponse } = buildContext({
      worldX: 800,
      worldY: 600,
      scale: 1,
      screenWidth: 800,
      screenHeight: 600,
      dpr: 2,
    });

    handleRequestViewportState(requestMessage, context);

    expect(postResponse).toHaveBeenCalledTimes(1);
    expect(postResponse).toHaveBeenCalledWith({
      type: 'viewport-state',
      cameraX: 400, // 800 / 2 → CSS pixels
      cameraY: 300, // 600 / 2 → CSS pixels
      cameraScale: 1,
      viewportWidth: 800,
      viewportHeight: 600,
      devicePixelRatio: 2,
    });
  });

  it('emits identical CSS-pixel snapshots for matched displays at DPR 1 vs 2', () => {
    // Two displays with the same CSS layout but different DPR. The handler
    // must produce equal cameraX/Y and viewportWidth/Height; only DPR
    // differs. This is the property the placement primitive relies on for
    // viewport-center to land in the same world position regardless of DPR.
    const dpr1 = buildContext({
      worldX: 600, // canvas pixels (DPR 1 → identical to CSS)
      worldY: 400,
      scale: 1.5,
      screenWidth: 1200,
      screenHeight: 800,
      dpr: 1,
    });
    const dpr2 = buildContext({
      worldX: 1200, // canvas pixels (DPR 2 → 2× the CSS value)
      worldY: 800,
      scale: 1.5,
      screenWidth: 1200,
      screenHeight: 800,
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
});
