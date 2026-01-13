/**
 * Burst Background Shuffle Animation
 *
 * Animates ONLY the gray 3D background rectangles (depth effect) while the
 * main card stays completely still. This creates a visual of the cards underneath
 * "shuffling around" without moving the face card.
 *
 * Uses the new child animation system to target the 'background-3d' child
 * specifically, leaving the 'card-face' untouched.
 *
 * Animation stages:
 * 1. Background bursts out left-up
 * 2. Background bursts out right-down
 * 3. Background bursts out right-up
 * 4. Background returns to original offset
 *
 * Total: ~400ms with rapid background "card scatter" effect
 *
 * Note: This animation only works on stacks with 2+ cards (single cards have no
 * background-3d child to animate).
 */

import type { AnimationManager } from '../../managers/AnimationManager';
import { Easing } from '../../managers/AnimationManager';
import type { Container } from 'pixi.js';
import { Container as PixiContainer, Graphics } from 'pixi.js';
import {
  STACK_WIDTH,
  STACK_HEIGHT,
  STACK_3D_OFFSET_X,
  STACK_3D_OFFSET_Y,
  STACK_3D_COLOR,
  STACK_3D_ALPHA,
} from '../../objects/stack/constants';

export function animateShuffleBurstBackground(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 400,
  onComplete?: () => void,
): void {
  const stageDuration = duration / 4;

  // Verify the visual exists and has the background-3d child
  const container = objectVisuals.get(visualId);
  // Use deep=true to search recursively through grandchildren
  const background = container?.getChildByLabel('background-3d', true);

  if (!background || !container) {
    // No background (single card stack or minimal mode) - skip animation
    onComplete?.();
    return;
  }

  // Create temporary ghost rectangles for extra shuffle effect
  const ghost1 = createGhostRectangle('shuffle-ghost-1', 0.6);
  const ghost2 = createGhostRectangle('shuffle-ghost-2', 0.5);

  container.addChild(ghost1);
  container.addChild(ghost2);

  // Verify ghosts were added successfully (defensive check for race conditions)
  const verifyGhost1 = container.getChildByLabel('shuffle-ghost-1', true);
  const verifyGhost2 = container.getChildByLabel('shuffle-ghost-2', true);

  // The background container itself is at position (0, 0)
  // (The offset is baked into the rectangle's drawing coordinates)
  const startX = 0;
  const startY = 0;

  // Burst distances (how far to move the background container)
  const burstDistance = 25; // How far backgrounds "fly"

  // Animate Ghost 1: Opposite pattern (right-down → left-up → left-down → center)
  if (verifyGhost1) {
    animateGhost1(
      animationManager,
      visualId,
      startX,
      startY,
      burstDistance,
      stageDuration,
    );
  }

  // Animate Ghost 2: Different pattern (up → down → left → center)
  if (verifyGhost2) {
    animateGhost2(
      animationManager,
      visualId,
      startX,
      startY,
      burstDistance,
      stageDuration,
    );
  }

  // Stage 1: Burst left-up (main background)
  animationManager.animate({
    visualId,
    childLabel: 'background-3d', // Target specific child!
    type: 'position',
    from: { x: startX, y: startY },
    to: { x: startX - burstDistance, y: startY - burstDistance },
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-bg-1',
    onComplete: () => {
      // Stage 2: Burst right-down
      animationManager.animate({
        visualId,
        childLabel: 'background-3d',
        type: 'position',
        from: { x: startX - burstDistance, y: startY - burstDistance },
        to: { x: startX + burstDistance, y: startY + burstDistance },
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-bg-2',
        onComplete: () => {
          // Stage 3: Burst right-up
          animationManager.animate({
            visualId,
            childLabel: 'background-3d',
            type: 'position',
            from: { x: startX + burstDistance, y: startY + burstDistance },
            to: {
              x: startX + burstDistance * 0.5,
              y: startY - burstDistance * 0.5,
            },
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-bg-3',
            onComplete: () => {
              // Stage 4: Return to original position (0, 0)
              animationManager.animate({
                visualId,
                childLabel: 'background-3d',
                type: 'position',
                from: {
                  x: startX + burstDistance * 0.5,
                  y: startY - burstDistance * 0.5,
                },
                to: { x: startX, y: startY },
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-bg-4',
                onComplete: () => {
                  // Clean up temporary ghost rectangles
                  container.removeChild(ghost1);
                  container.removeChild(ghost2);
                  onComplete?.();
                },
              });
            },
          });
        },
      });
    },
  });
}

/**
 * Create a temporary ghost rectangle for shuffle animation
 */
function createGhostRectangle(
  label: string,
  alphaMultiplier: number,
): Container {
  const ghostContainer = new PixiContainer({ label });
  const ghostGraphic = new Graphics();
  ghostGraphic.rect(
    -STACK_WIDTH / 2 + STACK_3D_OFFSET_X,
    -STACK_HEIGHT / 2 + STACK_3D_OFFSET_Y,
    STACK_WIDTH,
    STACK_HEIGHT,
  );
  ghostGraphic.fill({
    color: STACK_3D_COLOR,
    alpha: STACK_3D_ALPHA * alphaMultiplier,
  });
  ghostGraphic.stroke({
    width: 1,
    color: 0x000000,
    alpha: 0.2,
  });
  ghostContainer.addChild(ghostGraphic);
  return ghostContainer;
}

/**
 * Animate Ghost 1: Opposite pattern to main background
 * Right-down → Left-up → Left-down → Center
 */
function animateGhost1(
  animationManager: AnimationManager,
  visualId: string,
  startX: number,
  startY: number,
  burstDistance: number,
  stageDuration: number,
): void {
  // Stage 1: Burst right-down (opposite of main)
  animationManager.animate({
    visualId,
    childLabel: 'shuffle-ghost-1',
    type: 'position',
    from: { x: startX, y: startY },
    to: { x: startX + burstDistance, y: startY + burstDistance },
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-ghost1-1',
    onComplete: () => {
      // Stage 2: Burst left-up
      animationManager.animate({
        visualId,
        childLabel: 'shuffle-ghost-1',
        type: 'position',
        from: { x: startX + burstDistance, y: startY + burstDistance },
        to: { x: startX - burstDistance, y: startY - burstDistance },
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-ghost1-2',
        onComplete: () => {
          // Stage 3: Burst left-down
          animationManager.animate({
            visualId,
            childLabel: 'shuffle-ghost-1',
            type: 'position',
            from: { x: startX - burstDistance, y: startY - burstDistance },
            to: {
              x: startX - burstDistance * 0.5,
              y: startY + burstDistance * 0.5,
            },
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-ghost1-3',
            onComplete: () => {
              // Stage 4: Return to center
              animationManager.animate({
                visualId,
                childLabel: 'shuffle-ghost-1',
                type: 'position',
                from: {
                  x: startX - burstDistance * 0.5,
                  y: startY + burstDistance * 0.5,
                },
                to: { x: startX, y: startY },
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-ghost1-4',
              });
            },
          });
        },
      });
    },
  });
}

/**
 * Animate Ghost 2: Different diagonal pattern
 * Up → Down → Left → Center
 */
function animateGhost2(
  animationManager: AnimationManager,
  visualId: string,
  startX: number,
  startY: number,
  burstDistance: number,
  stageDuration: number,
): void {
  // Stage 1: Burst straight up
  animationManager.animate({
    visualId,
    childLabel: 'shuffle-ghost-2',
    type: 'position',
    from: { x: startX, y: startY },
    to: { x: startX, y: startY - burstDistance },
    duration: stageDuration,
    easing: Easing.easeOut,
    stage: 'shuffle-ghost2-1',
    onComplete: () => {
      // Stage 2: Burst straight down
      animationManager.animate({
        visualId,
        childLabel: 'shuffle-ghost-2',
        type: 'position',
        from: { x: startX, y: startY - burstDistance },
        to: { x: startX, y: startY + burstDistance },
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-ghost2-2',
        onComplete: () => {
          // Stage 3: Burst left
          animationManager.animate({
            visualId,
            childLabel: 'shuffle-ghost-2',
            type: 'position',
            from: { x: startX, y: startY + burstDistance },
            to: {
              x: startX - burstDistance * 0.7,
              y: startY + burstDistance * 0.3,
            },
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-ghost2-3',
            onComplete: () => {
              // Stage 4: Return to center
              animationManager.animate({
                visualId,
                childLabel: 'shuffle-ghost-2',
                type: 'position',
                from: {
                  x: startX - burstDistance * 0.7,
                  y: startY + burstDistance * 0.3,
                },
                to: { x: startX, y: startY },
                duration: stageDuration,
                easing: Easing.easeIn,
                stage: 'shuffle-ghost2-4',
              });
            },
          });
        },
      });
    },
  });
}
