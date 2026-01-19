import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import { getShuffleAnimation } from '../animations/shuffle';
import {
  ANIM_NOT_INIT,
  ANIM_VISUAL_NOT_FOUND,
  ANIM_TICKER_CRITICAL,
  ANIM_UPDATE_FAILED,
  ANIM_CHILD_NOT_FOUND,
  ANIM_CHILD_WRONG_TYPE,
  ANIM_TIMEOUT,
} from '../../constants/errorIds';

/**
 * Animation type - what property to animate
 */
export type AnimationType =
  | 'rotation'
  | 'scale'
  | 'scaleX'
  | 'scaleY'
  | 'position'
  | 'alpha';

/**
 * Animation configuration for a single object
 */
export interface Animation {
  visualId: string;
  type: AnimationType;
  from: number | { x: number; y: number };
  to: number | { x: number; y: number };
  duration: number; // milliseconds
  easing?: (t: number) => number; // easing function (0-1 input/output)
  onComplete?: () => void;
  stage?: string; // Optional stage identifier for multi-stage animations (e.g., "flip-compress", "flip-expand")
  childLabel?: string; // Optional child label to animate specific child instead of root container (e.g., "background-3d")
}

/**
 * Active animation state
 */
interface ActiveAnimation extends Animation {
  startTime: number;
}

/**
 * Animation updater function type
 */
type AnimationUpdater = (
  visual: Container,
  anim: Animation,
  progress: number,
) => void;

/**
 * Animation updaters - Strategy pattern to eliminate switch statement
 */
const animationUpdaters: Record<AnimationType, AnimationUpdater> = {
  rotation: (visual, anim, progress) => {
    const from = anim.from as number;
    const to = anim.to as number;
    visual.rotation = from + (to - from) * progress;
  },
  scale: (visual, anim, progress) => {
    const from = anim.from as number;
    const to = anim.to as number;
    const scale = from + (to - from) * progress;
    visual.scale.set(scale);
  },
  scaleX: (visual, anim, progress) => {
    const from = anim.from as number;
    const to = anim.to as number;
    visual.scale.x = from + (to - from) * progress;
  },
  scaleY: (visual, anim, progress) => {
    const from = anim.from as number;
    const to = anim.to as number;
    visual.scale.y = from + (to - from) * progress;
  },
  position: (visual, anim, progress) => {
    const from = anim.from as { x: number; y: number };
    const to = anim.to as { x: number; y: number };
    visual.x = from.x + (to.x - from.x) * progress;
    visual.y = from.y + (to.y - from.y) * progress;
  },
  alpha: (visual, anim, progress) => {
    const from = anim.from as number;
    const to = anim.to as number;
    visual.alpha = from + (to - from) * progress;
  },
};

/**
 * AnimationManager - Handles smooth animations for object properties
 *
 * Provides a centralized, reusable animation system that:
 * - Manages PixiJS ticker lifecycle (starts/stops automatically)
 * - Supports multiple simultaneous animations
 * - Works with any visual property (rotation, scale, position, alpha)
 * - Uses easing functions for smooth transitions
 * - Auto-cleans up completed animations
 *
 * Usage:
 * ```ts
 * animationManager.animate({
 *   visualId: 'stack-123',
 *   type: 'rotation',
 *   from: 0,
 *   to: Math.PI / 2, // 90 degrees in radians
 *   duration: 200, // ms
 * });
 * ```
 */
export class AnimationManager {
  private app: Application | null = null;
  private objectVisuals: Map<string, Container> = new Map();
  private activeAnimations: Map<string, ActiveAnimation> = new Map();
  private tickerCallback: (() => void) | null = null;
  private isTickerActive = false;

  /**
   * Initialize the animation manager with PixiJS app and visual references
   */
  initialize(app: Application, objectVisuals: Map<string, Container>): void {
    this.app = app;
    this.objectVisuals = objectVisuals;
  }

  /**
   * Start an animation for a visual object
   * If an animation is already running for this visual+type, it will be replaced
   */
  animate(config: Animation): void {
    if (!this.app) {
      console.error(
        '[AnimationManager] Not initialized - animation cannot start',
        {
          errorId: ANIM_NOT_INIT,
          visualId: config.visualId,
          type: config.type,
        },
      );
      // Call callback to prevent broken animation chains
      config.onComplete?.();
      return;
    }

    const visual = this.objectVisuals.get(config.visualId);
    if (!visual) {
      console.error(
        `[AnimationManager] Visual not found - animation cannot start`,
        {
          errorId: ANIM_VISUAL_NOT_FOUND,
          visualId: config.visualId,
          type: config.type,
          availableVisuals: Array.from(this.objectVisuals.keys()),
        },
      );
      // Call callback to prevent broken animation chains
      config.onComplete?.();
      return;
    }

    // Create animation key (visual + type + optional stage)
    // The stage ensures chained animations (like flip stage 1 → stage 2) don't collide
    const animKey = config.stage
      ? `${config.visualId}:${config.type}:${config.stage}`
      : `${config.visualId}:${config.type}`;

    // Add animation
    this.activeAnimations.set(animKey, {
      ...config,
      startTime: performance.now(),
    });

    // Start ticker if not already running
    if (!this.isTickerActive) {
      this.startTicker();
    }
  }

  /**
   * Cancel an animation for a specific visual and type
   * Also cancels any staged variants (e.g., flip-compress, flip-expand)
   */
  cancel(visualId: string, type: AnimationType): void {
    // Cancel non-staged animation
    const animKey = `${visualId}:${type}`;
    this.activeAnimations.delete(animKey);

    // Also cancel any staged animations (e.g., flip-compress, flip-expand)
    for (const key of this.activeAnimations.keys()) {
      if (key.startsWith(`${visualId}:${type}:`)) {
        this.activeAnimations.delete(key);
      }
    }

    // Stop ticker if no animations remain
    if (this.activeAnimations.size === 0 && this.isTickerActive) {
      this.stopTicker();
    }
  }

  /**
   * Cancel all animations for a specific visual
   */
  cancelAll(visualId: string): void {
    // Remove all animations for this visual
    for (const key of this.activeAnimations.keys()) {
      if (key.startsWith(`${visualId}:`)) {
        this.activeAnimations.delete(key);
      }
    }

    // Stop ticker if no animations remain
    if (this.activeAnimations.size === 0 && this.isTickerActive) {
      this.stopTicker();
    }
  }

  /**
   * Check if an animation is running for a visual
   */
  isAnimating(visualId: string, type?: AnimationType): boolean {
    if (type) {
      return this.activeAnimations.has(`${visualId}:${type}`);
    }
    // Check if any animation is running for this visual
    for (const key of this.activeAnimations.keys()) {
      if (key.startsWith(`${visualId}:`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a shuffle animation is currently running for a visual
   */
  isShuffling(visualId: string): boolean {
    const activeKeys = Array.from(this.activeAnimations.keys());
    const shuffleKeys = activeKeys.filter(
      (key) => key.startsWith(`${visualId}:`) && key.includes('shuffle'),
    );
    return shuffleKeys.length > 0;
  }

  /**
   * Animate a flip effect (horizontal squash and stretch)
   *
   * Performs a two-stage flip animation:
   * 1. Compress horizontally (scaleX: 1 → 0)
   * 2. Expand horizontally (scaleX: 0 → 1)
   *
   * The onMidpoint callback is called when the visual is fully compressed (invisible),
   * which is the ideal time to swap the visual content (e.g., change face up/down).
   *
   * @param visualId - ID of the visual to flip
   * @param onMidpoint - Callback to execute at the midpoint (when scaleX = 0)
   * @param duration - Total duration in ms (default: 150ms for snappy flip)
   * @param onComplete - Optional callback to execute when flip fully completes
   */
  animateFlip(
    visualId: string,
    onMidpoint: () => void,
    duration = 150,
    onComplete?: () => void,
  ): void {
    const halfDuration = duration / 2;

    // Stage 1: Compress (scaleX: 1 → 0)
    this.animate({
      visualId,
      type: 'scaleX',
      from: 1,
      to: 0,
      duration: halfDuration,
      easing: Easing.easeIn, // Accelerate into the flip
      stage: 'flip-compress',
      onComplete: () => {
        // At midpoint: visual is fully compressed
        onMidpoint();

        // Stage 2: Expand (scaleX: 0 → 1)
        this.animate({
          visualId,
          type: 'scaleX',
          from: 0,
          to: 1,
          duration: halfDuration,
          easing: Easing.easeOut, // Decelerate out of the flip
          stage: 'flip-expand',
          onComplete,
        });
      },
    });
  }

  /**
   * Animate a shuffle effect
   *
   * Uses the currently configured shuffle animation variant.
   * See app/src/renderer/animations/shuffle/index.ts to change the animation style.
   *
   * Available variants: wobble (default), spin, burst
   *
   * @param visualId - ID of the visual to shuffle
   * @param duration - Total duration in ms (default varies by animation)
   * @param onComplete - Optional callback to execute when shuffle completes
   */
  animateShuffle(
    visualId: string,
    duration?: number,
    onComplete?: () => void,
  ): void {
    const shuffleAnimation = getShuffleAnimation();
    shuffleAnimation(this, visualId, this.objectVisuals, duration, onComplete);
  }

  /**
   * Start the ticker for animation updates
   */
  private startTicker(): void {
    if (!this.app || this.isTickerActive) {
      return;
    }

    this.isTickerActive = true;

    this.tickerCallback = () => {
      try {
        if (!this.app) {
          this.stopTicker();
          return;
        }

        const now = performance.now();
        const completedAnimations: string[] = [];

        // Update all active animations
        for (const [key, anim] of this.activeAnimations) {
          try {
            const visual = this.objectVisuals.get(anim.visualId);
            if (!visual) {
              // Visual disappeared during animation - mark as complete
              console.warn(
                `[AnimationManager] Visual ${anim.visualId} disappeared during animation`,
                {
                  animationType: anim.type,
                  stage: anim.stage,
                },
              );
              completedAnimations.push(key);
              continue;
            }

            // Calculate progress (0 to 1)
            const elapsed = now - anim.startTime;
            const maxDuration = (anim.duration ?? 0) * 10; // Timeout at 10x expected duration

            // Check for animation timeout
            if (elapsed >= maxDuration && maxDuration > 0) {
              console.error(
                '[AnimationManager] Animation exceeded maximum duration',
                {
                  errorId: ANIM_TIMEOUT,
                  visualId: anim.visualId,
                  type: anim.type,
                  expectedDuration: anim.duration,
                  actualElapsed: elapsed,
                  maxDuration,
                },
              );
              completedAnimations.push(key);
              continue;
            }

            let progress = Math.min(elapsed / (anim.duration ?? 1), 1);

            // Apply easing if provided
            if (anim.easing) {
              progress = anim.easing(progress);

              // Validate easing output
              if (!Number.isFinite(progress)) {
                throw new Error(
                  `Easing function returned invalid progress: ${progress}`,
                );
              }
            }

            // Update the property based on type
            this.updateVisualProperty(visual, anim, progress);

            // Mark as complete if done
            if (elapsed >= anim.duration) {
              completedAnimations.push(key);
            }
          } catch (animError) {
            // Log specific animation failure but continue with others
            console.error('[AnimationManager] Animation update failed', {
              errorId: ANIM_UPDATE_FAILED,
              visualId: anim.visualId,
              type: anim.type,
              stage: anim.stage,
              error:
                animError instanceof Error
                  ? animError.message
                  : String(animError),
              stack: animError instanceof Error ? animError.stack : undefined,
            });

            // Mark this animation as complete to remove it
            completedAnimations.push(key);
          }
        }

        // Call onComplete callbacks AFTER updating all animations
        // This ensures chained animations (stage 2) are added before we check if animations remain
        for (const key of completedAnimations) {
          const anim = this.activeAnimations.get(key);
          if (anim?.onComplete) {
            try {
              anim.onComplete();
            } catch (callbackError) {
              console.error(
                '[AnimationManager] Animation completion callback failed',
                {
                  errorId: ANIM_UPDATE_FAILED,
                  visualId: anim.visualId,
                  type: anim.type,
                  error:
                    callbackError instanceof Error
                      ? callbackError.message
                      : String(callbackError),
                },
              );
            }
          }
        }

        // Remove completed animations AFTER callbacks (which may add new animations)
        for (const key of completedAnimations) {
          this.activeAnimations.delete(key);
        }

        // Always render to show animation updates
        this.app.renderer.render(this.app.stage);

        // Stop ticker when all animations complete
        if (this.activeAnimations.size === 0) {
          this.stopTicker();
        }
      } catch (error) {
        // Only critical errors that prevent ticker from functioning should reach here
        console.error(
          '[AnimationManager] Critical ticker error - stopping all animations',
          {
            errorId: ANIM_TICKER_CRITICAL,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            activeAnimationCount: this.activeAnimations.size,
          },
        );

        // Stop ticker and clear animations to prevent infinite errors
        this.stopTicker();
        this.activeAnimations.clear();
      }
    };

    this.app.ticker.add(this.tickerCallback);

    // CRITICAL: With autoStart: false (for iOS stability), we must manually start the ticker
    if (!this.app.ticker.started) {
      this.app.ticker.start();
    }
  }

  /**
   * Stop the ticker
   */
  private stopTicker(): void {
    if (!this.app || !this.tickerCallback || !this.isTickerActive) {
      return;
    }

    this.app.ticker.remove(this.tickerCallback);
    this.tickerCallback = null;
    this.isTickerActive = false;
  }

  /**
   * Update a visual's property based on animation progress
   */
  private updateVisualProperty(
    visual: Container,
    anim: Animation,
    progress: number,
  ): void {
    // If childLabel is specified, animate the child instead of the root container
    let target: Container = visual;
    if (anim.childLabel) {
      // Use deep=true to search recursively through grandchildren
      const child = visual.getChildByLabel(anim.childLabel, true);

      if (!child) {
        console.error('[AnimationManager] Animation child not found', {
          errorId: ANIM_CHILD_NOT_FOUND,
          visualId: anim.visualId,
          childLabel: anim.childLabel,
          type: anim.type,
          stage: anim.stage,
          availableChildren: this.getChildLabels(visual),
        });
        return;
      }

      if (!(child instanceof Container)) {
        // Safe to access constructor here since child exists (checked above)
        const childType = (child as { constructor: { name: string } })
          .constructor.name;
        console.error('[AnimationManager] Animation child is not a Container', {
          errorId: ANIM_CHILD_WRONG_TYPE,
          visualId: anim.visualId,
          childLabel: anim.childLabel,
          actualType: childType,
          expectedType: 'Container',
        });
        return;
      }

      target = child;
    }

    const updater = animationUpdaters[anim.type];
    if (updater) {
      updater(target, anim, progress);
    }
  }

  /**
   * Get all child labels in a container (for debugging)
   */
  private getChildLabels(container: Container): string[] {
    const labels: string[] = [];
    const traverse = (c: Container) => {
      if (c.label) labels.push(c.label);
      c.children.forEach((child) => {
        if (child instanceof Container) traverse(child);
      });
    };
    traverse(container);
    return labels;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopTicker();
    this.activeAnimations.clear();
    this.app = null;
  }
}

/**
 * Common easing functions
 */
export const Easing = {
  // Linear (no easing)
  linear: (t: number) => t,

  // Ease out (fast start, slow end) - Good for most UI animations
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),

  // Ease in (slow start, fast end)
  easeIn: (t: number) => t * t * t,

  // Ease in-out (slow start and end, fast middle)
  easeInOut: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Elastic (bouncy)
  elastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};
