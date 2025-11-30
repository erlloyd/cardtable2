/**
 * Camera message handlers
 *
 * Handles camera-related messages: wheel zoom and interaction mode changes.
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';

/**
 * Handle wheel event for zooming
 *
 * Zooms the camera in/out based on wheel deltaY.
 * Sends zoom-started immediately and debounced zoom-ended (250ms after last wheel event).
 */
export function handleWheel(
  message: Extract<MainToRendererMessage, { type: 'wheel' }>,
  context: RendererContext,
): void {
  const event = message.event;

  // M3.5.1-T6: Notify Board that zoom started
  context.postResponse({ type: 'zoom-started' });

  // Use camera manager to perform zoom
  context.camera.zoom(event);

  // Update coordinate converter and visual manager with new scale
  const newScale = context.worldContainer.scale.x;
  context.coordConverter.setCameraScale(newScale);
  context.visual.setCameraScale(newScale);

  // Request render
  context.app.renderer.render(context.app.stage);

  // M3.5.1-T6: Debounce zoom-ended message (250ms after last wheel event)
  // Prevents ActionHandle flickering during rapid scroll
  context.debouncedZoomEnd();
}

/**
 * Handle interaction mode change
 *
 * Updates the interaction mode (pan vs select) and logs the change.
 */
export function handleSetInteractionMode(
  message: Extract<MainToRendererMessage, { type: 'set-interaction-mode' }>,
  context: RendererContext,
): void {
  context.interactionMode = message.mode;
  console.log(`[RendererCore] Interaction mode set to: ${message.mode}`);
}
