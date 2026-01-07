import type { Application, Container } from 'pixi.js';

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
      console.warn('[AnimationManager] Not initialized');
      return;
    }

    const visual = this.objectVisuals.get(config.visualId);
    if (!visual) {
      console.warn(
        `[AnimationManager] Visual ${config.visualId} not found, skipping animation`,
      );
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
   * Animate a shuffle effect (wobble + scale pulse)
   *
   * Performs a 4-stage shuffle animation that creates visible "shuffling" motion:
   * 1. Wobble left + scale up
   * 2. Wobble right + scale up more
   * 3. Wobble left (smaller) + scale down slightly
   * 4. Return to rest
   *
   * Total duration: ~360ms with 4 rapid wobbles
   *
   * @param visualId - ID of the visual to shuffle
   * @param duration - Total duration in ms (default: 360ms)
   * @param onComplete - Optional callback to execute when shuffle completes
   */
  animateShuffle(
    visualId: string,
    duration = 360,
    onComplete?: () => void,
  ): void {
    const stageDuration = duration / 4; // Each stage gets 1/4 of total time
    const degToRad = Math.PI / 180;

    // Get current visual rotation for smooth starting point
    const allVisuals = this.objectVisuals;
    const visual = allVisuals.get(visualId);
    const startRotation = visual ? visual.rotation : 0;

    // Stage 1: Wobble left + scale up
    this.animate({
      visualId,
      type: 'rotation',
      from: startRotation,
      to: startRotation + -8 * degToRad,
      duration: stageDuration,
      easing: Easing.easeIn,
      stage: 'shuffle-1-rot',
      onComplete: () => {
        // Stage 2: Wobble right
        this.animate({
          visualId,
          type: 'rotation',
          from: startRotation + -8 * degToRad,
          to: startRotation + 10 * degToRad,
          duration: stageDuration,
          easing: Easing.linear,
          stage: 'shuffle-2-rot',
          onComplete: () => {
            // Stage 3: Wobble left (smaller)
            this.animate({
              visualId,
              type: 'rotation',
              from: startRotation + 10 * degToRad,
              to: startRotation + -5 * degToRad,
              duration: stageDuration,
              easing: Easing.linear,
              stage: 'shuffle-3-rot',
              onComplete: () => {
                // Stage 4: Return to rest
                this.animate({
                  visualId,
                  type: 'rotation',
                  from: startRotation + -5 * degToRad,
                  to: startRotation,
                  duration: stageDuration,
                  easing: Easing.easeOut,
                  stage: 'shuffle-4-rot',
                  onComplete,
                });
                this.animate({
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
            this.animate({
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
        this.animate({
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
    this.animate({
      visualId,
      type: 'scale',
      from: 1.0,
      to: 1.04,
      duration: stageDuration,
      easing: Easing.easeIn,
      stage: 'shuffle-1-scale',
    });
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
          const visual = this.objectVisuals.get(anim.visualId);
          if (!visual) {
            completedAnimations.push(key);
            continue;
          }

          // Calculate progress (0 to 1)
          const elapsed = now - anim.startTime;
          let progress = Math.min(elapsed / anim.duration, 1);

          // Apply easing if provided
          if (anim.easing) {
            progress = anim.easing(progress);
          }

          // Update the property based on type
          this.updateVisualProperty(visual, anim, progress);

          // Mark as complete if done
          if (elapsed >= anim.duration) {
            completedAnimations.push(key);
          }
        }

        // Call onComplete callbacks AFTER updating all animations
        // This ensures chained animations (stage 2) are added before we check if animations remain
        for (const key of completedAnimations) {
          const anim = this.activeAnimations.get(key);
          if (anim?.onComplete) {
            anim.onComplete();
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
        console.error('[AnimationManager] Ticker error:', error);
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
    const updater = animationUpdaters[anim.type];
    if (updater) {
      updater(visual, anim, progress);
    }
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
