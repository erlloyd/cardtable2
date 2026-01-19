/**
 * Burst Background + Wobble Shuffle Animation
 *
 * Combines two effects:
 * 1. Face card wobbles (rotates back and forth with scale pulse)
 * 2. Background rectangles burst out and back (including ghost rectangles)
 *
 * This creates a dynamic shuffle effect where the card itself shakes while
 * the background "cards" appear to scatter and return.
 *
 * Animation stages (400ms total):
 * - Face card: 4-stage wobble (left, right, left, center) with scale pulse
 * - Background: 4-stage burst (left-up, right-down, right-up, center)
 * - Ghosts: Independent burst patterns for visual variety
 *
 * Total: ~400ms
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
import { SHUFFLE_GHOST_CREATE_FAILED } from '../../../constants/errorIds';

export function animateShuffleBurstBackgroundWobble(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 400,
  onComplete?: () => void,
): void {
  const stageDuration = duration / 4;

  // Verify the visual exists
  const container = objectVisuals.get(visualId);
  if (!container) {
    onComplete?.();
    return;
  }

  // Check for background-3d child (may not exist for single cards)
  const background = container.getChildByLabel('background-3d', true);
  const hasBackground = !!background;

  // ===== PART 1: WOBBLE FACE CARD =====
  // Animate the face card rotation and scale (wobble effect)
  animateWobble(
    animationManager,
    visualId,
    container,
    stageDuration,
    onComplete,
  );

  // ===== PART 2: BURST BACKGROUND (only if background exists) =====
  if (hasBackground) {
    animateBackgroundBurst(
      animationManager,
      visualId,
      container,
      stageDuration,
    );
  }
}

/**
 * Animate the face card wobble (rotation + scale pulse)
 */
function animateWobble(
  animationManager: AnimationManager,
  visualId: string,
  visual: Container,
  stageDuration: number,
  onComplete?: () => void,
): void {
  const degToRad = Math.PI / 180;
  const startRotation = visual.rotation;

  // Stage 1: Wobble left + scale up
  animationManager.animate({
    visualId,
    type: 'rotation',
    from: startRotation,
    to: startRotation + -8 * degToRad,
    duration: stageDuration,
    easing: Easing.easeIn,
    stage: 'shuffle-wobble-1-rot',
    onComplete: () => {
      // Stage 2: Wobble right
      animationManager.animate({
        visualId,
        type: 'rotation',
        from: startRotation + -8 * degToRad,
        to: startRotation + 10 * degToRad,
        duration: stageDuration,
        easing: Easing.linear,
        stage: 'shuffle-wobble-2-rot',
        onComplete: () => {
          // Stage 3: Wobble left (smaller)
          animationManager.animate({
            visualId,
            type: 'rotation',
            from: startRotation + 10 * degToRad,
            to: startRotation + -5 * degToRad,
            duration: stageDuration,
            easing: Easing.linear,
            stage: 'shuffle-wobble-3-rot',
            onComplete: () => {
              // Stage 4: Return to rest
              animationManager.animate({
                visualId,
                type: 'rotation',
                from: startRotation + -5 * degToRad,
                to: startRotation,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-wobble-4-rot',
                onComplete,
              });
              animationManager.animate({
                visualId,
                type: 'scale',
                from: 1.03,
                to: 1.0,
                duration: stageDuration,
                easing: Easing.easeOut,
                stage: 'shuffle-wobble-4-scale',
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
            stage: 'shuffle-wobble-3-scale',
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
        stage: 'shuffle-wobble-2-scale',
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
    stage: 'shuffle-wobble-1-scale',
  });
}

/**
 * Animate the background rectangles burst effect
 */
function animateBackgroundBurst(
  animationManager: AnimationManager,
  visualId: string,
  container: Container,
  stageDuration: number,
): void {
  // Create and verify ghost rectangles
  let ghost1: Container | null = null;
  let ghost2: Container | null = null;

  try {
    ghost1 = createGhostRectangle('shuffle-ghost-1', 0.6);
    ghost2 = createGhostRectangle('shuffle-ghost-2', 0.5);

    // Add ghosts at the beginning so they render behind the card
    container.addChildAt(ghost1, 0);
    container.addChildAt(ghost2, 0);

    // Verify
    const verify1 = container.getChildByLabel('shuffle-ghost-1', true);
    const verify2 = container.getChildByLabel('shuffle-ghost-2', true);

    if (!verify1 || !verify2) {
      throw new Error('Ghost rectangle verification failed');
    }
  } catch (error) {
    console.error(
      '[ShuffleBurstBackgroundWobble] Failed to create ghost rectangles',
      {
        errorId: SHUFFLE_GHOST_CREATE_FAILED,
        visualId,
        error: error instanceof Error ? error.message : String(error),
        ghost1Added: !!container.getChildByLabel('shuffle-ghost-1', true),
        ghost2Added: !!container.getChildByLabel('shuffle-ghost-2', true),
      },
    );

    // Clean up any partially created ghosts
    if (ghost1) container.removeChild(ghost1);
    if (ghost2) container.removeChild(ghost2);

    // Continue with animation (ghosts are optional enhancement)
    ghost1 = null;
    ghost2 = null;
  }

  const startX = 0;
  const startY = 0;
  const burstDistance = 25;

  // Animate Ghost 1 (if successfully created)
  if (ghost1) {
    animateGhost1(
      animationManager,
      visualId,
      startX,
      startY,
      burstDistance,
      stageDuration,
    );
  }

  // Animate Ghost 2 (if successfully created)
  if (ghost2) {
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
    childLabel: 'background-3d',
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
              // Stage 4: Return to original position
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
                  // Clean up temporary ghost rectangles (if they were created)
                  if (ghost1) container.removeChild(ghost1);
                  if (ghost2) container.removeChild(ghost2);
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
