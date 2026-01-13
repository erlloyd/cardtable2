/**
 * Wobble Shuffle Animation
 *
 * The original shuffle animation - a simple wobble + scale pulse.
 * Creates a "shaking" effect to indicate shuffling is happening.
 *
 * Performs a 4-stage shuffle animation:
 * 1. Wobble left + scale up
 * 2. Wobble right + scale up more
 * 3. Wobble left (smaller) + scale down slightly
 * 4. Return to rest
 *
 * Total duration: ~360ms with 4 rapid wobbles
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import { Easing } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';

export function animateShuffleWobble(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 360,
  onComplete?: () => void,
): void {
  const stageDuration = duration / 4;
  const degToRad = Math.PI / 180;

  // Get current visual rotation for smooth starting point
  const visual = objectVisuals.get(visualId);
  const startRotation = visual ? visual.rotation : 0;

  // Stage 1: Wobble left + scale up
  animationManager.animate({
    visualId,
    type: 'rotation',
    from: startRotation,
    to: startRotation + -8 * degToRad,
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-1-rot',
    onComplete: () => {
      // Stage 2: Wobble right
      animationManager.animate({
        visualId,
        type: 'rotation',
        from: startRotation + -8 * degToRad,
        to: startRotation + 10 * degToRad,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-rot',
        onComplete: () => {
          // Stage 3: Wobble left (smaller)
          animationManager.animate({
            visualId,
            type: 'rotation',
            from: startRotation + 10 * degToRad,
            to: startRotation + -5 * degToRad,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-rot',
            onComplete: () => {
              // Stage 4: Return to rest
              animationManager.animate({
                visualId,
                type: 'rotation',
                from: startRotation + -5 * degToRad,
                to: startRotation,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-4-rot',
                onComplete,
              });
              animationManager.animate({
                visualId,
                type: 'scale',
                from: 1.03,
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-4-scale',
              });
            },
          });
          animationManager.animate({
            visualId,
            type: 'scale',
            from: 1.05,
            to: 1.03,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-scale',
          });
        },
      });
      animationManager.animate({
        visualId,
        type: 'scale',
        from: 1.04,
        to: 1.05,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-scale',
      });
    },
  });
  animationManager.animate({
    visualId,
    type: 'scale',
    from: 1.0,
    to: 1.04,
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-1-scale',
  });
}
