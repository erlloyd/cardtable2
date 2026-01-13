/**
 * Shuffle Animation Variants
 *
 * This module provides multiple shuffle animation options.
 * Change ACTIVE_SHUFFLE_ANIMATION to test different styles.
 *
 * Available variants:
 * - 'wobble': Simple wobble + scale (original)
 * - 'spin': Face card spins rapidly (CardTable v1 style)
 * - 'burst': Cards burst out and in with motion blur effect
 *
 * To add more variants:
 * 1. Create a new file in this directory (e.g., riffle.ts)
 * 2. Export a function matching the ShuffleAnimationFn signature
 * 3. Add it to SHUFFLE_ANIMATIONS map
 * 4. Update ACTIVE_SHUFFLE_ANIMATION constant
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';
import { animateShuffleWobble } from './wobble';
import { animateShuffleSpin } from './spin';
import { animateShuffleBurst } from './burst';
import { animateShuffleBurstGhost } from './burst-ghost';
import { animateShuffleBurstBackground } from './burst-background';

/**
 * Shuffle animation function signature
 */
export type ShuffleAnimationFn = (
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration?: number,
  onComplete?: () => void,
) => void;

/**
 * Available shuffle animation variants
 */
export type ShuffleAnimationType =
  | 'wobble'
  | 'spin'
  | 'burst'
  | 'burst-ghost'
  | 'burst-background';

/**
 * Map of animation type to implementation function
 */
export const SHUFFLE_ANIMATIONS: Record<
  ShuffleAnimationType,
  ShuffleAnimationFn
> = {
  wobble: animateShuffleWobble,
  spin: animateShuffleSpin,
  burst: animateShuffleBurst,
  'burst-ghost': animateShuffleBurstGhost,
  'burst-background': animateShuffleBurstBackground,
};

/**
 * CHANGE THIS to test different shuffle animations!
 *
 * Options: 'wobble' | 'spin' | 'burst' | 'burst-ghost' | 'burst-background'
 */
export const ACTIVE_SHUFFLE_ANIMATION: ShuffleAnimationType =
  'burst-background';

/**
 * Get the currently active shuffle animation function
 */
export function getShuffleAnimation(): ShuffleAnimationFn {
  return SHUFFLE_ANIMATIONS[ACTIVE_SHUFFLE_ANIMATION];
}
