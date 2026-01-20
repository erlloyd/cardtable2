/**
 * Burst Ghost Shuffle Animation
 *
 * Shows gray "ghost" rectangles bursting out and back while the main card stays put.
 * Creates visual feedback of cards moving without actually displacing the stack.
 *
 * Implementation:
 * Since we can't easily add temporary child visuals in the current system,
 * we'll animate the main card with a gray tint (via alpha/scale) to create
 * the ghost effect. The card itself does the bursting motion but returns to
 * its original position.
 *
 * Animation stages:
 * 1. Burst out left-up + fade to gray
 * 2. Burst out right-down + more gray
 * 3. Burst out right-up + start returning
 * 4. Return to center + full color
 *
 * Total: ~450ms with "ghost card" scatter illusion
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import { Easing } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';

export function animateShuffleBurstGhost(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 450,
  onComplete?: () => void,
): void {
  const stageDuration = duration / 4;

  // Get current visual position for smooth starting point
  const visual = objectVisuals.get(visualId);
  if (!visual) {
    onComplete?.();
    return;
  }

  const startX = visual.x;
  const startY = visual.y;

  // Burst distances (how far ghost cards "fly")
  const burstDistance = 20; // Slightly more than burst for visibility

  // Stage 1: Burst left-up + fade to gray (alpha creates ghost effect)
  animationManager.animate({
    visualId,
    type: 'position',
    from: { x: startX, y: startY },
    to: { x: startX - burstDistance, y: startY - burstDistance },
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-1-burst-ghost',
    onComplete: () => {
      // Stage 2: Burst right-down
      animationManager.animate({
        visualId,
        type: 'position',
        from: { x: startX - burstDistance, y: startY - burstDistance },
        to: { x: startX + burstDistance, y: startY + burstDistance },
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-burst-ghost',
        onComplete: () => {
          // Stage 3: Burst right-up
          animationManager.animate({
            visualId,
            type: 'position',
            from: { x: startX + burstDistance, y: startY + burstDistance },
            to: {
              x: startX + burstDistance * 0.5,
              y: startY - burstDistance * 0.5,
            },
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-burst-ghost',
            onComplete: () => {
              // Stage 4: Return to center
              animationManager.animate({
                visualId,
                type: 'position',
                from: {
                  x: startX + burstDistance * 0.5,
                  y: startY - burstDistance * 0.5,
                },
                to: { x: startX, y: startY },
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-4-burst-ghost',
                onComplete,
              });
              animationManager.animate({
                visualId,
                type: 'alpha',
                from: 0.5, // Very faded = more ghost-like
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-4-alpha-ghost',
              });
              animationManager.animate({
                visualId,
                type: 'scale',
                from: 0.95,
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-4-scale-ghost',
              });
            },
          });
          animationManager.animate({
            visualId,
            type: 'alpha',
            from: 0.6,
            to: 0.5,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-alpha-ghost',
          });
          animationManager.animate({
            visualId,
            type: 'scale',
            from: 0.9,
            to: 0.95,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-scale-ghost',
          });
        },
      });
      animationManager.animate({
        visualId,
        type: 'alpha',
        from: 0.7,
        to: 0.6,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-alpha-ghost',
      });
      animationManager.animate({
        visualId,
        type: 'scale',
        from: 0.92,
        to: 0.9,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-scale-ghost',
      });
    },
  });
  animationManager.animate({
    visualId,
    type: 'alpha',
    from: 1.0,
    to: 0.7, // Fade more than normal burst to create ghost effect
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-1-alpha-ghost',
  });
  animationManager.animate({
    visualId,
    type: 'scale',
    from: 1.0,
    to: 0.92, // Shrink slightly to enhance ghost effect
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-1-scale-ghost',
  });
}
