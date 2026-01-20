/**
 * Burst Shuffle Animation
 *
 * Simulates cards "bursting out" and back in during shuffle.
 * Uses rapid position changes with alpha fading to create a motion blur effect
 * that suggests individual cards flying around.
 *
 * Animation stages:
 * 1. Burst out left-up + fade out slightly
 * 2. Burst out right-down + fade out more
 * 3. Burst out right-up + start fading back
 * 4. Return to center + full opacity
 *
 * Total: ~450ms with rapid "card scatter" illusion
 *
 * NOTE: This is a simplified version using position + alpha.
 * A full implementation would render actual card rectangles flying around,
 * but that requires extending the visual system to support temporary child visuals.
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import { Easing } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';

export function animateShuffleBurst(
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

  // Burst distances (how far cards "fly")
  const burstDistance = 15; // pixels

  // Stage 1: Burst left-up + fade slightly
  animationManager.animate({
    visualId,
    type: 'position',
    from: { x: startX, y: startY },
    to: { x: startX - burstDistance, y: startY - burstDistance },
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-1-burst',
    onComplete: () => {
      // Stage 2: Burst right-down
      animationManager.animate({
        visualId,
        type: 'position',
        from: { x: startX - burstDistance, y: startY - burstDistance },
        to: { x: startX + burstDistance, y: startY + burstDistance },
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-burst',
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
            stage: 'shuffle-3-burst',
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
                stage: 'shuffle-4-burst',
                onComplete,
              });
              animationManager.animate({
                visualId,
                type: 'alpha',
                from: 0.7,
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-4-alpha',
              });
              animationManager.animate({
                visualId,
                type: 'scale',
                from: 1.1,
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-4-scale',
              });
            },
          });
          animationManager.animate({
            visualId,
            type: 'alpha',
            from: 0.8,
            to: 0.7,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-alpha',
          });
          animationManager.animate({
            visualId,
            type: 'scale',
            from: 1.15,
            to: 1.1,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-scale',
          });
        },
      });
      animationManager.animate({
        visualId,
        type: 'alpha',
        from: 0.9,
        to: 0.8,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-alpha',
      });
      animationManager.animate({
        visualId,
        type: 'scale',
        from: 1.08,
        to: 1.15,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-scale',
      });
    },
  });
  animationManager.animate({
    visualId,
    type: 'alpha',
    from: 1.0,
    to: 0.9,
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-1-alpha',
  });
  animationManager.animate({
    visualId,
    type: 'scale',
    from: 1.0,
    to: 1.08,
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-1-scale',
  });
}
