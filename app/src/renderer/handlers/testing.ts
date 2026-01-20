/**
 * Testing message handlers
 *
 * Handles test-only messages for E2E testing and animation testing.
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';

/**
 * Handle flush message
 *
 * E2E Test API: Wait for renderer's pending operations to complete.
 * This tracks the full round-trip: pointer-down → Board → Store → Renderer → syncSelectionCache
 */
export function handleFlush(
  _message: Extract<MainToRendererMessage, { type: 'flush' }>,
  context: RendererContext,
): void {
  console.log(
    `[RendererCore] Received flush, current pendingOperations: ${context.selection.getPendingOperations()}`,
  );

  if (context.selection.getPendingOperations() === 0) {
    // No pending operations - respond immediately after 1 frame
    // (to ensure any in-flight rendering is complete)
    console.log('[RendererCore] No pending ops, responding after 1 frame');
    requestAnimationFrame(() => {
      context.postResponse({
        type: 'flushed',
      });
    });
  } else {
    // Poll until renderer's pending operations counter reaches 0
    // This ensures the full round-trip has completed:
    // 1. Renderer processes pointer-down (counter++)
    // 2. Renderer sends objects-selected/moved/unselected to Board
    // 3. Board updates store, Yjs observer sends objects-updated back
    // 4. Renderer receives objects-updated and calls syncSelectionCache (counter--)
    const maxPolls = 100; // Safety limit (100 frames = ~1.67s at 60fps)
    let pollCount = 0;

    const pollFrame = () => {
      pollCount++;

      if (context.selection.getPendingOperations() === 0) {
        console.log(`[RendererCore] Flush complete after ${pollCount} frames`);
        context.postResponse({
          type: 'flushed',
        });
      } else if (pollCount >= maxPolls) {
        // Safety timeout - warn but still resolve
        console.warn(
          `[RendererCore] Flush timeout after ${maxPolls} frames (${context.selection.getPendingOperations()} ops still pending)`,
        );
        context.postResponse({
          type: 'flushed',
        });
      } else {
        requestAnimationFrame(pollFrame);
      }
    };

    requestAnimationFrame(pollFrame);
  }
}

/**
 * Handle test-animation message
 *
 * Test animation with ticker enabled.
 * Moves a circle back and forth for 3 seconds to verify ticker enable/disable works.
 *
 * NOTE: This is a test-only handler used for verifying iOS ticker stability.
 * It expects a circle object at worldContainer.children[2].
 */
export function handleTestAnimation(
  _message: Extract<MainToRendererMessage, { type: 'test-animation' }>,
  context: RendererContext,
): void {
  console.log('[RendererCore] Starting test animation...');
  console.log(
    '[RendererCore] Ticker started before:',
    context.app.ticker.started,
  );

  const animationStartTime = Date.now();

  // Get the circle (third child in worldContainer)
  const circle = context.worldContainer.children[2];
  if (!circle) {
    console.error('[RendererCore] Circle not found for animation');
    return;
  }

  // Store original position
  const originalX = circle.x;
  const originalY = circle.y;

  let frameCount = 0;

  // Create ticker callback
  const animationTicker = () => {
    frameCount++;
    const elapsed = Date.now() - animationStartTime;
    const duration = 3000; // 3 seconds

    if (elapsed < duration) {
      // Move the circle back and forth
      const progress = elapsed / duration;
      const oscillation = Math.sin(progress * Math.PI * 4); // 2 full cycles
      circle.x = originalX + oscillation * 100;
      circle.y = originalY + oscillation * 50;

      // Render on each frame
      context.app.renderer.render(context.app.stage);

      if (frameCount % 30 === 0) {
        console.log(
          `[RendererCore] Animation frame ${frameCount}, elapsed: ${elapsed}ms`,
        );
      }
    } else {
      // Animation complete
      console.log(
        `[RendererCore] Animation complete after ${frameCount} frames, stopping ticker...`,
      );
      context.app.ticker.remove(animationTicker);
      context.app.ticker.stop();
      console.log(
        '[RendererCore] Ticker started after stop:',
        context.app.ticker.started,
      );

      // Reset position
      circle.x = originalX;
      circle.y = originalY;

      // Do final render
      context.app.renderer.render(context.app.stage);

      // Notify complete
      context.postResponse({ type: 'animation-complete' });
      console.log('[RendererCore] Animation test complete!');
    }
  };

  // Add ticker callback and start
  context.app.ticker.add(animationTicker);
  if (!context.app.ticker.started) {
    context.app.ticker.start();
  }
  console.log(
    '[RendererCore] Ticker started after start:',
    context.app.ticker.started,
  );
  console.log('[RendererCore] Animation running...');
}

/**
 * Handle check-animation-state message
 *
 * E2E Test API: Query whether animations are currently running.
 * Can check for any animations, or specific visual+type combinations.
 */
export function handleCheckAnimationState(
  message: Extract<MainToRendererMessage, { type: 'check-animation-state' }>,
  context: RendererContext,
): void {
  const { visualId, animationType } = message;

  let isAnimating: boolean;

  if (visualId && animationType) {
    // Check specific visual + animation type
    // Note: animationType from message is string, cast to AnimationType if needed
    isAnimating = context.animation.isAnimating(
      visualId,
      animationType as 'rotation' | 'scale' | 'alpha' | 'position' | 'scaleX',
    );
  } else if (visualId) {
    // Check any animation on specific visual
    isAnimating = context.animation.isAnimating(visualId);
  } else {
    // Check if ANY animation is running (check AnimationManager, not ticker)
    // The ticker can remain started for hover animations even when target animations complete
    isAnimating = context.animation.hasActiveAnimations();
  }

  console.log('[RendererCore] Animation state check:', {
    visualId,
    animationType,
    isAnimating,
  });

  context.postResponse({
    type: 'animation-state',
    isAnimating,
    visualId,
    animationType,
  });
}
