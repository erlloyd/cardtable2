import { Application, Container, Graphics, BlurFilter, Text } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { getBehaviors } from '../objects';
import { createScaleStrokeWidth } from '../handlers/objects';
import { STACK_WIDTH, STACK_HEIGHT } from '../objects/stack/constants';
import { getTokenSize } from '../objects/token/utils';
import { getMatSize } from '../objects/mat/utils';
import { getCounterSize } from '../objects/counter/utils';
import type { SceneManager } from '../SceneManager';
import { RenderMode } from '../IRendererAdapter';

/**
 * VisualManager - Manages visual effects and object rendering.
 *
 * Handles:
 * - Object visual creation (Container + Graphics)
 * - Shadow rendering (hover and drag shadows)
 * - Highlight rendering (selection borders)
 * - Scale animations (hover effects)
 * - Blur filter caching for performance
 *
 * Visual feedback states:
 * - Hover: 1.05x scale, black shadow
 * - Drag: 1.05x scale, blue shadow (worker mode only)
 * - Selection: Red 4px border
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class VisualManager {
  private objectVisuals: Map<string, Container & { targetScale?: number }> =
    new Map();
  private app: Application | null = null;
  private renderMode: RenderMode = RenderMode.Worker;
  private cameraScale: number = 1.0;

  // Animation state
  private hoverAnimationActive = false;

  // Cached blur filters for performance (M2-T5 optimization)
  private hoverBlurFilter: BlurFilter | null = null;
  private dragBlurFilter: BlurFilter | null = null;

  // Text resolution for zoom quality
  private textResolutionMultiplier: number = 1.0;

  // Track current stack target for clearing
  private currentStackTargetId: string | null = null;

  /**
   * Initialize with app reference.
   */
  initialize(app: Application, renderMode: RenderMode): void {
    this.app = app;
    this.renderMode = renderMode;
  }

  /**
   * Set the current camera scale (for zoom-aware shadows and stroke widths).
   * Scales with zoom level to maintain consistent visual appearance.
   */
  setCameraScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      console.error('[VisualManager] Invalid camera scale:', scale);
      return; // Don't update with invalid value
    }
    this.cameraScale = scale;
  }

  /**
   * Set text resolution multiplier for dynamic zoom quality.
   * Scales text resolution with zoom level to maintain sharpness (higher when
   * zoomed in, lower when zoomed out).
   */
  setTextResolutionMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      console.error(
        '[VisualManager] Invalid text resolution multiplier (must be > 0):',
        multiplier,
      );
      return; // Don't update with invalid value
    }
    this.textResolutionMultiplier = multiplier;
  }

  /**
   * Get the current text resolution multiplier.
   */
  getTextResolutionMultiplier(): number {
    return this.textResolutionMultiplier;
  }

  /**
   * Create a visual representation for a TableObject.
   */
  createObjectVisual(objectId: string, obj: TableObject): Container {
    const container = new Container();

    // Create base shape using behaviors
    const shapeGraphic = this.createBaseShapeGraphic(
      objectId,
      obj,
      false,
      false,
    );
    container.addChild(shapeGraphic);

    // Add text label showing object type
    container.addChild(this.createKindLabel(obj._kind));

    return container;
  }

  /**
   * Add a visual to the tracking map.
   */
  addVisual(
    objectId: string,
    visual: Container & { targetScale?: number },
  ): void {
    this.objectVisuals.set(objectId, visual);
  }

  /**
   * Get a visual from the tracking map.
   */
  getVisual(
    objectId: string,
  ): (Container & { targetScale?: number }) | undefined {
    return this.objectVisuals.get(objectId);
  }

  /**
   * Remove a visual from tracking.
   */
  removeVisual(objectId: string): void {
    this.objectVisuals.delete(objectId);
  }

  /**
   * Get all visuals.
   */
  getAllVisuals(): Map<string, Container & { targetScale?: number }> {
    return this.objectVisuals;
  }

  /**
   * Update visual feedback for an object (hover state and selection border).
   */
  updateVisualFeedback(
    objectId: string,
    isHovered: boolean,
    isSelected: boolean,
    sceneManager: SceneManager,
  ): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    // Store target scale on the visual object
    visual.targetScale = isHovered ? 1.05 : 1.0;

    // Start hover animation if not already running
    if (!this.hoverAnimationActive) {
      this.startHoverAnimation();
    }

    // Redraw the visual with current hover state
    this.redrawVisual(objectId, sceneManager, { isHovered, isSelected });
  }

  /**
   * Update drag visual feedback for an object.
   */
  updateDragFeedback(
    objectId: string,
    isDragging: boolean,
    isSelected: boolean,
    sceneManager: SceneManager,
  ): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    // Store target scale on the visual object
    visual.targetScale = isDragging ? 1.05 : 1.0;

    // Start hover animation if not already running (reuses same animation system)
    if (!this.hoverAnimationActive) {
      this.startHoverAnimation();
    }

    // Redraw the visual with current drag state
    this.redrawVisual(objectId, sceneManager, { isDragging, isSelected });
  }

  /**
   * Update stack target visual feedback - highlights a stack as a valid drop target.
   */
  updateStackTargetFeedback(
    objectId: string,
    isStackTarget: boolean,
    isSelected: boolean,
    sceneManager: SceneManager,
  ): void {
    // Clear previous stack target feedback if it's different from the new one
    if (this.currentStackTargetId && this.currentStackTargetId !== objectId) {
      const prevIsSelected =
        sceneManager.getObject(this.currentStackTargetId)?._selectedBy !== null;
      this.redrawVisual(this.currentStackTargetId, sceneManager, {
        isStackTarget: false,
        isSelected: prevIsSelected,
      });
    }

    // Update current stack target ID
    this.currentStackTargetId = isStackTarget ? objectId : null;

    // Apply feedback to new stack target (if objectId is valid)
    if (objectId && isStackTarget) {
      const visual = this.objectVisuals.get(objectId);
      if (!visual) return;

      // Redraw the visual with stack target state
      this.redrawVisual(objectId, sceneManager, { isStackTarget, isSelected });
    }
  }

  /**
   * Update object visual when object data changes (e.g., _faceUp, _meta).
   * Forces a full re-render to reflect updated properties.
   */
  updateVisualForObjectChange(
    objectId: string,
    sceneManager: SceneManager,
    options?: {
      isHovered?: boolean;
      isDragging?: boolean;
      isSelected?: boolean;
      preservePosition?: boolean;
      preserveScale?: boolean;
    },
  ): void {
    this.redrawVisual(objectId, sceneManager, options);
  }

  /**
   * Redraw an object's visual representation.
   * @param objectId - ID of the object to redraw
   * @param sceneManager - Scene manager for accessing object data
   * @param options - Visual state options
   * @param options.isHovered - Whether the object is hovered (black shadow)
   * @param options.isDragging - Whether the object is being dragged (blue shadow)
   * @param options.isSelected - Whether the object is selected (red border)
   * @param options.isStackTarget - Whether the object is a valid stack drop target (green border)
   * @param options.preservePosition - If true, restore visual position after redraw (for transient states like drag)
   * @param options.preserveScale - If true, restore visual scale after redraw (for animations like flip)
   */
  private redrawVisual(
    objectId: string,
    sceneManager: SceneManager,
    options?: {
      isHovered?: boolean;
      isDragging?: boolean;
      isSelected?: boolean;
      isStackTarget?: boolean;
      preservePosition?: boolean;
      preserveScale?: boolean;
    },
  ): void {
    // Destructure with defaults
    const {
      isHovered = false,
      isDragging = false,
      isSelected = false,
      isStackTarget = false,
      preservePosition = false,
      preserveScale = false,
    } = options ?? {};

    const visual = this.objectVisuals.get(objectId);
    if (!visual) {
      console.error(
        '[VisualManager] Attempted to redraw visual that does not exist',
        {
          objectId,
          hasObject: !!sceneManager.getObject(objectId),
          totalVisuals: this.objectVisuals.size,
          context: 'redrawVisual',
        },
      );
      return;
    }

    const obj = sceneManager.getObject(objectId);
    if (!obj) {
      console.error(
        '[VisualManager] Attempted to redraw object that no longer exists in scene',
        {
          objectId,
          hasVisual: true, // We know visual exists from above
          totalObjects: sceneManager.getAllObjects().size,
          context: 'redrawVisual',
        },
      );
      return;
    }

    // Preserve position and scale if requested (for transient states like drag/animation)
    const preservedX = preservePosition ? visual.x : undefined;
    const preservedY = preservePosition ? visual.y : undefined;
    const preservedRotation = preservePosition ? visual.rotation : undefined;
    const preservedScaleX = preserveScale ? visual.scale.x : 1;
    const preservedScaleY = preserveScale ? visual.scale.y : 1;

    // Clear existing children
    visual.removeChildren();

    // Apply shadow for both hover and drag states (M2-T4, M2-T5)
    // For drag, only apply shadow in worker mode (performance optimization for main-thread mode)
    const shouldShowShadow =
      isHovered || (isDragging && this.renderMode === RenderMode.Worker);
    if (shouldShowShadow) {
      // Create shadow graphic with blur filter
      const shadowGraphic = new Graphics();
      const shadowPadding = 8;

      // Get shadow config from behaviors
      const behaviors = getBehaviors(obj._kind);
      const shadowConfig = behaviors.getShadowConfig(obj);

      if (shadowConfig.shape === 'circle') {
        // Circular shadow for round objects
        shadowGraphic.circle(0, 0, shadowConfig.width / 2 + shadowPadding);
      } else {
        // Rectangular shadow for cards and zones
        shadowGraphic.roundRect(
          -shadowConfig.width / 2 - shadowPadding,
          -shadowConfig.height / 2 - shadowPadding,
          shadowConfig.width + shadowPadding * 2,
          shadowConfig.height + shadowPadding * 2,
          shadowConfig.borderRadius,
        );
      }

      // Use different shadow colors: black for hover, blue for drag
      const shadowColor = isDragging ? 0x3b82f6 : 0x000000; // Blue for drag, black for hover
      shadowGraphic.fill({ color: shadowColor, alpha: 0.3 });

      // Reuse cached blur filters instead of creating new ones every time (performance optimization)
      // Scale blur strength by camera scale to maintain consistent appearance at all zoom levels
      const currentStrength = 16 * this.cameraScale;

      if (isDragging) {
        // Use/create drag blur filter
        if (!this.dragBlurFilter) {
          this.dragBlurFilter = new BlurFilter({
            strength: currentStrength,
            quality: 4, // Lower quality for drag (performance)
          });
        } else {
          this.dragBlurFilter.strength = currentStrength;
        }
        shadowGraphic.filters = [this.dragBlurFilter];
      } else {
        // Use/create hover blur filter
        if (!this.hoverBlurFilter) {
          this.hoverBlurFilter = new BlurFilter({
            strength: currentStrength,
            quality: 8, // Medium quality for hover (balance)
          });
        } else {
          this.hoverBlurFilter.strength = currentStrength;
        }
        shadowGraphic.filters = [this.hoverBlurFilter];
      }

      visual.addChild(shadowGraphic);
    }

    // Create and add the base shape graphic
    const shapeGraphic = this.createBaseShapeGraphic(
      objectId,
      obj,
      isSelected,
      isStackTarget,
    );
    visual.addChild(shapeGraphic);

    // Add text label showing object type
    visual.addChild(this.createKindLabel(obj._kind));

    // Restore preserved position if requested (for transient states like drag/animation)
    if (preservePosition && preservedX !== undefined) {
      visual.x = preservedX;
      visual.y = preservedY!;
      visual.rotation = preservedRotation!;
    }

    // Restore scale if requested (for animations like flip that modify scaleX/Y)
    if (preserveScale) {
      visual.scale.set(preservedScaleX, preservedScaleY);
    }
  }

  /**
   * Create base shape graphic for an object based on its kind.
   * Does NOT include text label or shadow.
   */
  private createBaseShapeGraphic(
    _objectId: string,
    obj: TableObject,
    isSelected: boolean,
    isStackTarget: boolean,
  ): Graphics {
    const behaviors = getBehaviors(obj._kind);
    return behaviors.render(obj, {
      isSelected,
      isHovered: false, // Hover state handled by shadow, not render
      isDragging: false, // Drag state handled by shadow, not render
      isStackTarget,
      cameraScale: this.cameraScale,
      createText: this.createText.bind(this),
      scaleStrokeWidth: createScaleStrokeWidth(
        this.cameraScale,
        'VisualManager',
      ),
    });
  }

  /**
   * Create text with automatic zoom-aware resolution.
   * Use this instead of `new Text()` to ensure text stays sharp at all zoom levels.
   *
   * Resolution scaling: baseResolution (3x) × textResolutionMultiplier
   * At 2x zoom: 3 × 2 = 6x resolution (maintains sharpness)
   *
   * WARNING: If you pass a `resolution` option, it will be OVERRIDDEN by the
   * zoom-aware resolution calculation. Let this helper manage resolution automatically.
   */
  createText(options: import('pixi.js').TextOptions): Text {
    // Validate text resolution multiplier
    if (
      !Number.isFinite(this.textResolutionMultiplier) ||
      this.textResolutionMultiplier <= 0
    ) {
      console.error(
        '[VisualManager] Invalid textResolutionMultiplier in createText:',
        {
          textResolutionMultiplier: this.textResolutionMultiplier,
          textContent: options.text,
        },
      );
      // Fall back to base resolution
      return new Text({
        ...options,
        resolution: 3, // Base resolution
      });
    }

    // Apply default base resolution (3x for crisp rendering)
    const baseResolution = 3;
    const zoomAwareResolution = baseResolution * this.textResolutionMultiplier;

    // Clamp resolution to reasonable limits to prevent memory issues
    // At 10x zoom: 3 × 10 = 30x resolution (maximum)
    const maxResolution = 30;
    const clampedResolution = Math.min(zoomAwareResolution, maxResolution);

    if (zoomAwareResolution !== clampedResolution) {
      console.warn('[VisualManager] Text resolution clamped to maximum:', {
        requested: zoomAwareResolution,
        clamped: clampedResolution,
        textResolutionMultiplier: this.textResolutionMultiplier,
      });
    }

    try {
      return new Text({
        ...options,
        resolution: clampedResolution,
      });
    } catch (error) {
      console.error('[VisualManager] Failed to create Text object:', {
        options,
        resolution: clampedResolution,
        error: error instanceof Error ? error.message : String(error),
      });
      // Return minimal fallback text
      return new Text({ text: '?', resolution: 3 });
    }
  }

  /**
   * Create a text label showing the object's kind.
   * Returns a centered Text object ready to be added to a container.
   *
   * Uses lower base resolution (2x vs 3x) for performance since labels
   * are larger and less critical for visual quality.
   */
  private createKindLabel(kind: string): Text {
    // Validate text resolution multiplier
    if (
      !Number.isFinite(this.textResolutionMultiplier) ||
      this.textResolutionMultiplier <= 0
    ) {
      console.error(
        '[VisualManager] Invalid textResolutionMultiplier in createKindLabel:',
        {
          textResolutionMultiplier: this.textResolutionMultiplier,
          kind,
        },
      );
      // Fall back to base resolution
      const kindText = new Text({
        text: kind,
        style: {
          fontFamily: 'Arial',
          fontSize: 24,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 2 },
          align: 'center',
        },
        resolution: 2, // Base resolution
      });
      kindText.anchor.set(0.5);
      kindText.y = 0;
      return kindText;
    }

    // Use lower base resolution for labels (2x instead of 3x)
    const baseResolution = 2;
    const textResolution = baseResolution * this.textResolutionMultiplier;

    // Clamp resolution to reasonable limits
    const maxResolution = 20; // Lower than createText since labels are less critical
    const clampedResolution = Math.min(textResolution, maxResolution);

    const kindText = new Text({
      text: kind,
      style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xffffff, // White text
        stroke: { color: 0x000000, width: 2 }, // Black outline for readability
        align: 'center',
      },
      resolution: clampedResolution,
    });
    kindText.anchor.set(0.5); // Center the text
    kindText.y = 0; // Center vertically in the object

    return kindText;
  }

  /**
   * Start smooth hover animation using ticker (M2-T4).
   */
  private startHoverAnimation(): void {
    if (!this.app || this.hoverAnimationActive) {
      return;
    }

    this.hoverAnimationActive = true;

    const hoverTicker = () => {
      if (!this.app) {
        this.hoverAnimationActive = false;
        return;
      }

      let hasActiveAnimation = false;

      // Animate all visuals towards their target scale
      for (const [, visual] of this.objectVisuals) {
        const targetScale = visual.targetScale ?? 1.0;
        const currentScale = visual.scale.x;

        // Lerp towards target (smooth easing)
        const lerpFactor = 0.25; // Higher = faster animation
        const newScale =
          currentScale + (targetScale - currentScale) * lerpFactor;

        // Only update if there's a meaningful difference
        if (Math.abs(newScale - currentScale) > 0.001) {
          visual.scale.set(newScale);
          hasActiveAnimation = true;
        } else if (Math.abs(targetScale - currentScale) > 0.001) {
          // Snap to target if very close
          visual.scale.set(targetScale);
        }
      }

      // Render if animation is active
      if (hasActiveAnimation) {
        this.app.renderer.render(this.app.stage);
      } else {
        // Stop ticker when all animations complete
        this.app.ticker.remove(hoverTicker);
        this.hoverAnimationActive = false;
      }
    };

    this.app.ticker.add(hoverTicker);

    // CRITICAL: With autoStart: false (for iOS stability), we must manually start the ticker
    if (!this.app.ticker.started) {
      this.app.ticker.start();
    }
  }

  /**
   * Calculate screen coordinates for objects (M3.5.1-T6).
   */
  calculateScreenCoords(
    ids: string[],
    sceneManager: SceneManager,
    devicePixelRatio: number,
  ): Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const screenCoords: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    for (const id of ids) {
      const visual = this.objectVisuals.get(id);
      const obj = sceneManager.getObject(id);

      if (visual && obj) {
        // Use PixiJS toGlobal() to convert visual's position to canvas coordinates
        const canvasPos = visual.toGlobal({ x: 0, y: 0 });

        // Convert to DOM coordinates (divide by devicePixelRatio)
        const domX = canvasPos.x / devicePixelRatio;
        const domY = canvasPos.y / devicePixelRatio;

        // Calculate dimensions based on object type
        let width = 0;
        let height = 0;

        if (obj._kind === ObjectKind.Stack) {
          width = (STACK_WIDTH * this.cameraScale) / devicePixelRatio;
          height = (STACK_HEIGHT * this.cameraScale) / devicePixelRatio;
        } else if (
          obj._kind === ObjectKind.Zone &&
          obj._meta?.width &&
          obj._meta?.height
        ) {
          width =
            ((obj._meta.width as number) * this.cameraScale) / devicePixelRatio;
          height =
            ((obj._meta.height as number) * this.cameraScale) /
            devicePixelRatio;
        } else if (obj._kind === ObjectKind.Token) {
          const radius =
            (getTokenSize(obj) * this.cameraScale) / devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Mat) {
          const radius =
            (getMatSize(obj) * this.cameraScale) / devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Counter) {
          const radius =
            (getCounterSize(obj) * this.cameraScale) / devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        }

        screenCoords.push({
          id,
          x: domX,
          y: domY,
          width,
          height,
        });
      }
    }

    return screenCoords;
  }

  /**
   * Request a render (convenience method).
   */
  requestRender(): void {
    if (this.app) {
      this.app.renderer.render(this.app.stage);
    }
  }

  /**
   * Clear all visuals.
   */
  clear(worldContainer: Container): void {
    // Remove all visuals from world container and destroy them
    for (const [, visual] of this.objectVisuals) {
      worldContainer.removeChild(visual);
      visual.destroy();
    }

    this.objectVisuals.clear();
    this.currentStackTargetId = null;
  }
}
