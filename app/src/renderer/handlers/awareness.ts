/**
 * Awareness message handlers
 *
 * Handles remote awareness updates (remote cursors and drag ghosts).
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import {
  AWARENESS_UPDATE_FAILED,
  AWARENESS_RENDER_FAILED,
  AWARENESS_CLEAR_FAILED,
} from '../../constants/errorIds';

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
  try {
    // M3-T4: Handle remote awareness updates
    // Delegate to AwarenessManager
    const result = context.awareness.updateRemoteAwareness(
      message.states,
      context.selection.getActorId(),
      context.sceneManager,
      context.worldContainer,
      context.coordConverter.getCameraScale(),
      context.visual,
    );

    // Only render if visuals actually changed
    if (result.shouldRender) {
      try {
        context.app.renderer.render(context.app.stage);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorType =
          error instanceof Error ? error.constructor.name : typeof error;
        console.error(
          '[AwarenessHandler] Render failed after awareness update',
          {
            errorId: AWARENESS_RENDER_FAILED,
            stateCount: message.states.length,
            errorMessage,
            errorType,
          },
        );
        // Don't re-throw - rendering will retry on next update
      }
    }

    // Report Hz to UI if changed significantly
    if (result.hz !== undefined) {
      context.postResponse({
        type: 'awareness-update-rate',
        hz: result.hz,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType =
      error instanceof Error ? error.constructor.name : typeof error;
    console.error('[AwarenessHandler] Failed to update remote awareness', {
      errorId: AWARENESS_UPDATE_FAILED,
      stateCount: message.states.length,
      actorId: context.selection.getActorId(),
      errorMessage,
      errorType,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Attempt recovery: clear corrupted awareness state
    try {
      console.warn(
        '[AwarenessHandler] Attempting to recover by clearing awareness state',
      );
      context.awareness.clear(context.visual);
    } catch (clearError) {
      const clearErrorMessage =
        clearError instanceof Error ? clearError.message : String(clearError);
      console.error(
        '[AwarenessHandler] Failed to clear awareness state during recovery',
        {
          errorId: AWARENESS_CLEAR_FAILED,
          clearErrorMessage,
        },
      );
    }

    // Don't re-throw - let next awareness update retry
  }
}
