/**
 * Coordinate calculation handlers
 *
 * Handles screen coordinate calculation requests (M3.5.1-T6).
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { STACK_WIDTH, STACK_HEIGHT } from '../objects/stack/constants';
import { getTokenSize } from '../objects/token/utils';
import { getMatSize } from '../objects/mat/utils';
import { getCounterDimensions } from '../objects/counter/utils';

/**
 * Handle request-screen-coords message
 *
 * Calculate and send screen coordinates for requested objects (M3.5.1-T6).
 * Called when Board component requests coordinates after camera operations.
 *
 * Uses PixiJS toGlobal() to convert world coordinates to screen coordinates,
 * accounting for camera transforms and device pixel ratio.
 */
export function handleRequestScreenCoords(
  message: Extract<MainToRendererMessage, { type: 'request-screen-coords' }>,
  context: RendererContext,
): void {
  const ids = message.ids;

  const screenCoords: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  if (ids.length > 0) {
    const dpr = context.coordConverter.getDevicePixelRatio();
    const cameraScale = context.coordConverter.getCameraScale();

    for (const id of ids) {
      const visual = context.visual.getVisual(id);
      const obj = context.sceneManager.getObject(id);

      if (visual && obj) {
        // Use PixiJS toGlobal() to convert visual's position to canvas coordinates
        const canvasPos = visual.toGlobal({ x: 0, y: 0 });

        // Convert to DOM coordinates (divide by devicePixelRatio)
        const domX = canvasPos.x / dpr;
        const domY = canvasPos.y / dpr;

        // Calculate dimensions based on object type
        let width = 0;
        let height = 0;

        if (obj._kind === ObjectKind.Stack) {
          width = (STACK_WIDTH * cameraScale) / dpr;
          height = (STACK_HEIGHT * cameraScale) / dpr;
        } else if (
          obj._kind === ObjectKind.Zone &&
          obj._meta?.width &&
          obj._meta?.height
        ) {
          width = ((obj._meta.width as number) * cameraScale) / dpr;
          height = ((obj._meta.height as number) * cameraScale) / dpr;
        } else if (obj._kind === ObjectKind.Token) {
          const radius = (getTokenSize(obj) * cameraScale) / dpr;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Mat) {
          const radius = (getMatSize(obj) * cameraScale) / dpr;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Counter) {
          const dims = getCounterDimensions(obj);
          width = (dims.width * cameraScale) / dpr;
          height = (dims.height * cameraScale) / dpr;
        }

        screenCoords.push({
          id,
          x: domX,
          y: domY,
          width,
          height,
        });
      }
    }
  }

  // Send screen coordinates response
  context.postResponse({
    type: 'screen-coords',
    screenCoords,
  });
}

/**
 * Handle request-viewport-state message (ct-8gf.5).
 *
 * Snapshot the current camera + viewport into a `viewport-state` response so
 * action handlers on the main thread can compute a viewport-center placement
 * without taking a PixiJS dependency. Mirrors the world-vs-screen relationship
 * documented in `app/src/utils/viewportPlacement.ts`.
 *
 * All values are reported in CSS pixels — matching the type docs in
 * `MainToRendererMessage.viewport-state` and the `ViewportState` shape the
 * placement primitive consumes.
 *
 * Unit care (ct-t9z): the renderer is initialised with PixiJS as
 *   `app.init({ width: clientWidth * dpr, height: clientHeight * dpr,
 *               resolution: dpr, autoDensity: true, … })`
 * (see `useCanvasLifecycle.ts` and `RendererOrchestrator.initialize`). With
 * that config PixiJS's "stage units" (which is what `app.screen.width/height`
 * and `worldContainer.position` carry) equal physical canvas pixels — NOT CSS
 * pixels. `CameraManager.initialize` sets `worldContainer.position` from
 * `app.renderer.width/height` (also physical px), so both inputs to this
 * handler live in the same physical-px coordinate system. To honour the
 * documented "CSS pixels" contract we must divide ALL of them by DPR — both
 * the camera position AND the viewport dimensions. The earlier ct-rde version
 * only divided the camera position, leaving viewport dims in physical px, so
 * the placement primitive computed a world point that was DPR× too far from
 * centre and additive loads landed near the canvas bottom-right corner on
 * retina displays.
 *
 * The consumer (`handleLoadSelection` in `app/src/content/loadHandler.ts`)
 * scales the resulting world coord back up by `devicePixelRatio` before
 * storing the object's `_pos`, since the renderer otherwise expects positions
 * in its native stage-unit world space.
 */
export function handleRequestViewportState(
  _message: Extract<MainToRendererMessage, { type: 'request-viewport-state' }>,
  context: RendererContext,
): void {
  const dpr = context.coordConverter.getDevicePixelRatio();
  context.postResponse({
    type: 'viewport-state',
    cameraX: context.worldContainer.position.x / dpr,
    cameraY: context.worldContainer.position.y / dpr,
    cameraScale: context.coordConverter.getCameraScale(),
    viewportWidth: context.app.screen.width / dpr,
    viewportHeight: context.app.screen.height / dpr,
    devicePixelRatio: dpr,
  });
}
