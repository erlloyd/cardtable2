/**
 * Spin Shuffle Animation
 *
 * Face card spins rapidly (multiple 360° rotations) while wobbling.
 * This creates a visual effect of the card "spinning" as if being shuffled.
 *
 * Inspired by CardTable v1's shuffle animation.
 *
 * Animation stages:
 * 1. Wobble left + start spinning (0° → 360° × 2)
 * 2. Wobble right + continue spinning (720° → 1080°)
 * 3. Wobble left + slow spin (1080° → 1440°)
 * 4. Return to rest + final spin (1440° → 1800° → 0°)
 *
 * Total: 5 full rotations (1800°) over ~400ms
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import { Easing } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';

export function animateShuffleSpin(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 400,
  onComplete?: () => void,
): void {
  const stageDuration = duration / 4;

  // Get current visual rotation for smooth starting point
  const visual = objectVisuals.get(visualId);
  const startRotation = visual ? visual.rotation : 0;

  // We'll add rapid spinning (5 full rotations = 1800° = 10π radians)
  const spinRotations = 5; // Number of 360° spins
  const fullSpin = 2 * Math.PI * spinRotations;

  // Stage 1: Start spinning + wobble left
  animationManager.animate({
    visualId,
    type: 'rotation',
    from: startRotation,
    to: startRotation + fullSpin * 0.4, // 40% of spin
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-1-spin',
    onComplete: () => {
      // Stage 2: Continue spinning + wobble right
      animationManager.animate({
        visualId,
        type: 'rotation',
        from: startRotation + fullSpin * 0.4,
        to: startRotation + fullSpin * 0.6, // 60% of spin
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-2-spin',
        onComplete: () => {
          // Stage 3: Keep spinning + wobble left
          animationManager.animate({
            visualId,
            type: 'rotation',
            from: startRotation + fullSpin * 0.6,
            to: startRotation + fullSpin * 0.9, // 90% of spin
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-3-spin',
            onComplete: () => {
              // Stage 4: Final spin + return to original rotation
              animationManager.animate({
                visualId,
                type: 'rotation',
                from: startRotation + fullSpin * 0.9,
                to: startRotation, // Complete the spin and return to original rotation
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-4-spin',
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
