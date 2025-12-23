/**
 * Awareness message handlers
 *
 * Handles remote awareness updates (remote cursors and drag ghosts).
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';

/**
 * Handle awareness-update message
 *
 * Updates remote awareness states (cursors and drag ghosts).
 * Delegates to AwarenessManager for rendering.
 */
export function handleAwarenessUpdate(
  message: Extract<MainToRendererMessage, { type: 'awareness-update' }>,
  context: RendererContext,
): void {
  // M3-T4: Handle remote awareness updates
  // Delegate to AwarenessManager
  const hzChanged = context.awareness.updateRemoteAwareness(
    message.states,
    context.selection.getActorId(),
    context.sceneManager,
    context.worldContainer,
    context.coordConverter.getCameraScale(),
    context.visual,
  );

  // Render to show awareness changes
  context.app.renderer.render(context.app.stage);

  // Report Hz to UI if changed significantly
  if (hzChanged) {
    context.postResponse({
      type: 'awareness-update-rate',
      hz: hzChanged.hz,
    });
  }
}
