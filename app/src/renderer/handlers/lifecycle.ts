/**
 * Lifecycle message handlers
 *
 * Handles basic lifecycle events like resize, ping, and echo.
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';

/**
 * Handle canvas resize
 *
 * Resizes the renderer and adjusts the world container position
 * to preserve the camera's pan offset.
 *
 * IMPORTANT: In main-thread mode, resets canvas.style to 100% to prevent
 * PixiJS from setting explicit pixel dimensions that break responsive layout.
 */
export function handleResize(
  message: Extract<MainToRendererMessage, { type: 'resize' }>,
  context: RendererContext,
): void {
  const { width, height, dpr } = message;

  // Store old dimensions before resizing
  const oldWidth = context.app.renderer.width;
  const oldHeight = context.app.renderer.height;

  // Resize renderer
  context.app.renderer.resize(width, height);
  context.app.renderer.resolution = dpr;

  // IMPORTANT: In main-thread mode, PixiJS may set canvas.style to explicit pixel dimensions
  // which breaks our responsive layout. Reset to 100% to fill container.
  // Note: OffscreenCanvas doesn't have a 'style' property, so this only runs in main-thread mode
  if ('style' in context.app.canvas) {
    context.app.canvas.style.width = '100%';
    context.app.canvas.style.height = '100%';
  }

  // Update world container position to keep it centered, preserving pan offset
  const offsetX = context.worldContainer.position.x - oldWidth / 2;
  const offsetY = context.worldContainer.position.y - oldHeight / 2;
  context.worldContainer.position.set(
    width / 2 + offsetX,
    height / 2 + offsetY,
  );

  // Force a render to update the display
  context.app.renderer.render(context.app.stage);
}

/**
 * Handle ping message
 *
 * Responds with pong message containing the received data.
 * Used for health checks and communication testing.
 */
export function handlePing(
  message: Extract<MainToRendererMessage, { type: 'ping' }>,
  context: RendererContext,
): void {
  context.postResponse({
    type: 'pong',
    data: `Pong! Received: ${message.data}`,
  });
}

/**
 * Handle echo message
 *
 * Echoes back the received data.
 * Used for communication testing and message round-trip verification.
 */
export function handleEcho(
  message: Extract<MainToRendererMessage, { type: 'echo' }>,
  context: RendererContext,
): void {
  context.postResponse({
    type: 'echo-response',
    data: message.data,
  });
}
