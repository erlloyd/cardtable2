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
import { getCounterSize } from '../objects/counter/utils';

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
          const radius = (getCounterSize(obj) * cameraScale) / dpr;
          width = radius * 2;
          height = radius * 2;
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
