import { Application, Graphics, Container, BlurFilter } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  PointerEventData,
  WheelEventData,
  TableObject,
} from '@cardtable2/shared';
import { RenderMode } from './IRendererAdapter';
import { SceneManager } from './SceneManager';
import { CARD_WIDTH, CARD_HEIGHT, TEST_CARD_COLORS } from './constants';

/**
 * Core rendering logic shared between worker and main-thread modes.
 *
 * This class contains ALL rendering logic and processes messages identically
 * regardless of where it runs. The ONLY difference between modes is how
 * postResponse() is implemented (postMessage vs callback).
 */
// Drag slop thresholds by pointer type (M2-T3)
const DRAG_SLOP = {
  touch: 12,
  pen: 6,
  mouse: 3,
} as const;

export abstract class RendererCore {
  protected app: Application | null = null;
  protected worldContainer: Container | null = null;
  private animationStartTime: number = 0;
  private isAnimating: boolean = false;

  // Rendering mode (set by subclasses)
  protected renderMode: RenderMode = RenderMode.Worker; // Default to worker mode

  // Scene management (M2-T4)
  private sceneManager: SceneManager = new SceneManager();
  private hoveredObjectId: string | null = null;
  private objectVisuals: Map<string, Container & { targetScale?: number }> =
    new Map();
  private hoverAnimationActive = false;

  // Object selection state
  private selectedObjectIds: Set<string> = new Set();

  // Object dragging state (M2-T5)
  private draggedObjectId: string | null = null;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private isObjectDragging = false;
  // Track initial positions of all selected cards when drag starts (for multi-drag)
  private draggedObjectsStartPositions: Map<string, { x: number; y: number }> =
    new Map();
  // Store pointer down event for selection logic on pointer up
  private pointerDownEvent: PointerEventData | null = null;

  // Camera state (M2-T3)
  private cameraScale = 1.0;

  // Pointer tracking for gesture recognition
  private pointers: Map<
    number,
    {
      startX: number;
      startY: number;
      type: string;
      lastX: number;
      lastY: number;
    }
  > = new Map();
  private isDragging = false;
  private isPinching = false;
  private initialPinchDistance = 0;
  private initialPinchScale = 1.0;
  private initialPinchMidpoint = { x: 0, y: 0 }; // Locked screen point for pinch zoom
  private initialPinchWorldPoint = { x: 0, y: 0 }; // World coords under locked midpoint

  /**
   * Send a response message back to the main thread.
   * Worker mode: uses self.postMessage
   * Main-thread mode: uses callback
   */
  protected abstract postResponse(message: RendererToMainMessage): void;

  /**
   * Handle incoming message from main thread.
   * This method is IDENTICAL for both worker and main-thread modes.
   */
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'init': {
          // Initialize PixiJS
          const { canvas, width, height, dpr } = message;

          console.log('[RendererCore] Initializing PixiJS...');
          console.log('[RendererCore] Canvas type:', canvas.constructor.name);
          console.log('[RendererCore] Canvas size:', width, 'x', height);
          console.log('[RendererCore] DPR:', dpr);

          try {
            console.log('[RendererCore] Creating Application...');
            this.app = new Application();

            console.log('[RendererCore] Calling app.init()...');
            console.log('[RendererCore] Init config:', {
              canvasType: canvas.constructor.name,
              width,
              height,
              resolution: dpr,
              autoDensity: true,
              backgroundColor: 0xd4d4d4,
              autoStart: false, // CRITICAL: Disable auto-start to prevent iOS crashes
            });

            // Try WebGL first, but let PixiJS fallback to canvas if needed
            await this.app.init({
              canvas,
              width,
              height,
              resolution: dpr,
              autoDensity: true,
              backgroundColor: 0xd4d4d4,
              autoStart: false, // CRITICAL: Prevent automatic ticker start (causes iOS worker crashes)
              // Remove explicit preference to allow automatic fallback
            });

            console.log('[RendererCore] ✓ PixiJS initialized successfully');
            console.log(
              '[RendererCore] Renderer type:',
              this.app.renderer.type,
            );
            console.log(
              '[RendererCore] Renderer name:',
              this.app.renderer.name,
            );
            console.log(
              '[RendererCore] Canvas dimensions:',
              this.app.canvas.width,
              'x',
              this.app.canvas.height,
            );
            console.log(
              '[RendererCore] Renderer resolution:',
              this.app.renderer.resolution,
            );
            console.log(
              '[RendererCore] Screen size:',
              this.app.screen.width,
              'x',
              this.app.screen.height,
            );
            console.log(
              '[RendererCore] Ticker started:',
              this.app.ticker.started,
            );

            // Verify ticker didn't auto-start (should be false with autoStart: false)
            if (this.app.ticker.started) {
              console.warn(
                '[RendererCore] WARNING: Ticker auto-started despite autoStart: false!',
              );
              console.log('[RendererCore] Stopping ticker...');
              this.app.ticker.stop();
            }

            // Initialize viewport (M2-T3)
            console.log('[RendererCore] Initializing viewport...');
            this.initializeViewport(width, height);
            console.log('[RendererCore] ✓ Viewport initialized');

            // Render a simple test scene
            console.log('[RendererCore] Rendering test scene...');
            this.renderTestScene();
            console.log('[RendererCore] ✓ Test scene rendered');

            // Do ONE manual render
            console.log('[RendererCore] Performing manual render...');
            this.app.renderer.render(this.app.stage);
            console.log('[RendererCore] ✓ Manual render complete');

            // IMPORTANT: In main-thread mode, PixiJS sets canvas.style to explicit pixel dimensions
            // which breaks our responsive layout. Reset to 100% to fill container.
            // Note: OffscreenCanvas doesn't have a 'style' property, so this only runs in main-thread mode
            if ('style' in canvas) {
              console.log(
                '[RendererCore] Resetting canvas style for main-thread mode...',
              );
              canvas.style.width = '100%';
              canvas.style.height = '100%';
              console.log(
                '[RendererCore] ✓ Canvas style reset to responsive sizing',
              );
            }

            this.postResponse({ type: 'initialized' });
          } catch (initError) {
            const errorMsg =
              initError instanceof Error
                ? initError.message
                : String(initError);
            console.error(
              '[RendererCore] ✗ PixiJS initialization failed:',
              errorMsg,
            );
            console.error('[RendererCore] Error stack:', initError);
            this.postResponse({
              type: 'error',
              error: `PixiJS initialization failed: ${errorMsg}`,
              context: 'init',
            });
          }
          break;
        }

        case 'resize': {
          // Handle canvas resize
          if (this.app) {
            const { width, height, dpr } = message;

            // Store old dimensions before resizing
            const oldWidth = this.app.renderer.width;
            const oldHeight = this.app.renderer.height;

            this.app.renderer.resize(width, height);
            this.app.renderer.resolution = dpr;

            // Update world container position to keep it centered, preserving pan offset
            if (this.worldContainer) {
              const offsetX = this.worldContainer.position.x - oldWidth / 2;
              const offsetY = this.worldContainer.position.y - oldHeight / 2;
              this.worldContainer.position.set(
                width / 2 + offsetX,
                height / 2 + offsetY,
              );
            }
          }
          break;
        }

        case 'ping': {
          // Respond to ping with pong
          this.postResponse({
            type: 'pong',
            data: `Pong! Received: ${message.data}`,
          });
          break;
        }

        case 'echo': {
          // Echo back the data
          this.postResponse({
            type: 'echo-response',
            data: message.data,
          });
          break;
        }

        case 'test-animation': {
          // Test animation with ticker enabled
          console.log('[RendererCore] Starting test animation...');
          this.startTestAnimation();
          break;
        }

        case 'pointer-down': {
          this.handlePointerDown(message.event);
          break;
        }

        case 'pointer-move': {
          this.handlePointerMove(message.event);
          break;
        }

        case 'pointer-up': {
          this.handlePointerUp(message.event);
          break;
        }

        case 'pointer-cancel': {
          this.handlePointerCancel(message.event);
          break;
        }

        case 'wheel': {
          this.handleWheel(message.event);
          break;
        }

        default: {
          // Unknown message type
          this.postResponse({
            type: 'error',
            error: `Unknown message type: ${(message as { type: string }).type}`,
            context: 'handleMessage',
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.postResponse({
        type: 'error',
        error: `Renderer error: ${errorMsg}`,
        context: 'handleMessage',
      });
    }
  }

  /**
   * Initialize world container for camera (M2-T3).
   * Using a simple Container with manual transforms instead of pixi-viewport
   * to avoid DOM dependencies (works in both Worker and main-thread modes).
   */
  private initializeViewport(width: number, height: number): void {
    if (!this.app) return;

    // Create a container for the world/scene
    this.worldContainer = new Container();

    // Add to stage
    this.app.stage.addChild(this.worldContainer);

    // Center camera on screen center initially
    this.worldContainer.position.set(width / 2, height / 2);

    // Set initial scale
    this.worldContainer.scale.set(this.cameraScale);
  }

  /**
   * Calculate distance between two pointers (for pinch gesture).
   */
  private getPointerDistance(
    p1: { lastX: number; lastY: number },
    p2: { lastX: number; lastY: number },
  ): number {
    const dx = p2.lastX - p1.lastX;
    const dy = p2.lastY - p1.lastY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Handle pointer down event (M2-T3 + M2-T5 object dragging).
   */
  private handlePointerDown(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Track pointer start position for gesture recognition
    this.pointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      type: event.pointerType,
    });

    // Check if we have 2 touch pointers (pinch gesture)
    if (this.pointers.size === 2 && event.pointerType === 'touch') {
      this.isDragging = false;
      this.isObjectDragging = false;
      this.draggedObjectId = null;
      this.isPinching = true;

      // Calculate initial pinch distance and LOCK the midpoint
      const pointerArray = Array.from(this.pointers.values());
      this.initialPinchDistance = this.getPointerDistance(
        pointerArray[0],
        pointerArray[1],
      );
      this.initialPinchScale = this.cameraScale;

      // Calculate and lock the midpoint (this should NOT change during the pinch)
      this.initialPinchMidpoint.x =
        (pointerArray[0].lastX + pointerArray[1].lastX) / 2;
      this.initialPinchMidpoint.y =
        (pointerArray[0].lastY + pointerArray[1].lastY) / 2;

      // Convert midpoint to world coordinates ONCE at start of pinch
      this.initialPinchWorldPoint.x =
        (this.initialPinchMidpoint.x - this.worldContainer.position.x) /
        this.initialPinchScale;
      this.initialPinchWorldPoint.y =
        (this.initialPinchMidpoint.y - this.worldContainer.position.y) /
        this.initialPinchScale;
    } else if (event.isPrimary) {
      // Perform hit test to check if clicking on an object (M2-T5)
      const worldX =
        (event.clientX - this.worldContainer.position.x) / this.cameraScale;
      const worldY =
        (event.clientY - this.worldContainer.position.y) / this.cameraScale;

      const hitResult = this.sceneManager.hitTest(worldX, worldY);

      // Store pointer down event for selection logic on pointer up
      this.pointerDownEvent = event;

      if (hitResult) {
        // Clicking on an object - prepare for potential object drag
        this.draggedObjectId = hitResult.id;
        this.dragStartWorldX = worldX;
        this.dragStartWorldY = worldY;
        this.isObjectDragging = false; // Will become true once we exceed slop threshold
        this.isDragging = false;
      } else {
        // Clicking on empty space - prepare for potential camera pan
        this.draggedObjectId = null;
        this.isDragging = false; // Will become true once we exceed slop threshold
        this.isObjectDragging = false;
      }
    }
  }

  /**
   * Handle pointer move event (M2-T3 + pinch-to-zoom + M2-T4 hover).
   */
  private handlePointerMove(event: PointerEventData): void {
    if (!this.worldContainer || !this.app) return;

    const pointerInfo = this.pointers.get(event.pointerId);

    // Only handle gestures if pointer is being tracked (after pointer-down)
    if (pointerInfo) {
      // Store last position for delta calculation
      const lastX = pointerInfo.lastX;
      const lastY = pointerInfo.lastY;

      // Update pointer position
      pointerInfo.lastX = event.clientX;
      pointerInfo.lastY = event.clientY;

      // Handle pinch zoom (2 fingers)
      if (this.isPinching && this.pointers.size === 2) {
        const pointerArray = Array.from(this.pointers.values());
        const currentDistance = this.getPointerDistance(
          pointerArray[0],
          pointerArray[1],
        );

        // Calculate scale change
        const scaleChange = currentDistance / this.initialPinchDistance;
        this.cameraScale = this.initialPinchScale * scaleChange;

        // Apply zoom (no clamping - unlimited zoom)
        this.worldContainer.scale.set(this.cameraScale);

        // Adjust position so the LOCKED world point stays under the LOCKED screen midpoint
        // Formula: screenPos = cameraPos + worldPos * scale
        // Therefore: cameraPos = screenPos - worldPos * scale
        this.worldContainer.position.x =
          this.initialPinchMidpoint.x -
          this.initialPinchWorldPoint.x * this.cameraScale;
        this.worldContainer.position.y =
          this.initialPinchMidpoint.y -
          this.initialPinchWorldPoint.y * this.cameraScale;

        // Request render
        this.app.renderer.render(this.app.stage);
        // Don't return - we still want to do hit-test for hover
      }

      // Handle single-pointer pan/drag (M2-T3 + M2-T5 object dragging)
      if (this.pointers.size === 1) {
        // Calculate movement delta from start
        const dx = event.clientX - pointerInfo.startX;
        const dy = event.clientY - pointerInfo.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if movement exceeds drag slop threshold
        const pointerType = event.pointerType;
        const slopThreshold =
          pointerType === 'mouse' ||
          pointerType === 'pen' ||
          pointerType === 'touch'
            ? DRAG_SLOP[pointerType]
            : DRAG_SLOP.mouse;

        // Start dragging once we exceed the slop threshold
        if (
          !this.isDragging &&
          !this.isObjectDragging &&
          distance > slopThreshold &&
          event.isPrimary
        ) {
          if (this.draggedObjectId) {
            // We're tracking an object - start object drag
            this.isObjectDragging = true;

            // If the dragged object isn't selected, select it (clearing other selections)
            if (!this.selectedObjectIds.has(this.draggedObjectId)) {
              // Clear previous selections and redraw them
              const prevSelected = Array.from(this.selectedObjectIds);
              this.selectedObjectIds.clear();

              for (const id of prevSelected) {
                this.redrawCardVisual(id, false, false, false);
              }

              // Select the dragged card
              this.selectedObjectIds.add(this.draggedObjectId);
              this.redrawCardVisual(this.draggedObjectId, false, false, true);
            }

            // Save initial positions of all selected cards for multi-drag
            this.draggedObjectsStartPositions.clear();
            for (const objectId of this.selectedObjectIds) {
              const obj = this.sceneManager.getObject(objectId);
              if (obj) {
                this.draggedObjectsStartPositions.set(objectId, {
                  x: obj._pos.x,
                  y: obj._pos.y,
                });
              }
            }

            // Apply drag visual feedback to all selected cards
            // Also update _sortKey to ensure hit-testing respects the new z-order

            // Find the current maximum sortKey (lexicographic comparison for fractional indexing)
            let maxSortKey = '0';
            for (const [, obj] of this.sceneManager.getAllObjects()) {
              if (obj._sortKey > maxSortKey) {
                maxSortKey = obj._sortKey;
              }
            }

            // Generate new sortKeys for dragged cards using fractional indexing
            // Increment the prefix to ensure new keys are lexicographically greater
            const [prefix] = maxSortKey.split('|');
            const newPrefix = String(Number(prefix) + 1);

            let sortKeyCounter = 0;
            for (const objectId of this.selectedObjectIds) {
              this.updateDragFeedback(objectId, true);

              // Move all selected objects to top of z-order (both visual and logical)
              const visual = this.objectVisuals.get(objectId);
              const obj = this.sceneManager.getObject(objectId);
              if (visual && obj && this.worldContainer) {
                // Update visual z-order
                this.worldContainer.setChildIndex(
                  visual,
                  this.worldContainer.children.length - 1,
                );

                // Update logical z-order (_sortKey) using fractional indexing format
                obj._sortKey = `${newPrefix}|${String.fromCharCode(97 + sortKeyCounter++)}`;
              }
            }
          } else {
            // No object - start camera pan
            this.isDragging = true;
          }
        }

        // If dragging an object, update positions of all selected objects
        if (this.isObjectDragging && this.draggedObjectId && event.isPrimary) {
          // Calculate current world position
          const worldX =
            (event.clientX - this.worldContainer.position.x) / this.cameraScale;
          const worldY =
            (event.clientY - this.worldContainer.position.y) / this.cameraScale;

          // Calculate drag delta from the primary dragged object's start position
          const deltaX = worldX - this.dragStartWorldX;
          const deltaY = worldY - this.dragStartWorldY;

          // Update all selected objects' positions based on delta
          for (const objectId of this.selectedObjectIds) {
            const startPos = this.draggedObjectsStartPositions.get(objectId);
            const obj = this.sceneManager.getObject(objectId);

            if (startPos && obj) {
              // Update object position in memory (relative to start position)
              obj._pos.x = startPos.x + deltaX;
              obj._pos.y = startPos.y + deltaY;

              // Update visual position immediately for smooth rendering
              const visual = this.objectVisuals.get(objectId);
              if (visual) {
                visual.x = obj._pos.x;
                visual.y = obj._pos.y;
              }
            }
          }

          // Request render
          // Note: SceneManager spatial index update is deferred until drag ends
          // to avoid expensive RBush removal/insertion on every pointer move
          this.app.renderer.render(this.app.stage);
        }
        // If dragging camera, manually pan the camera
        else if (this.isDragging && event.isPrimary) {
          // Calculate delta from last position
          const deltaX = event.clientX - lastX;
          const deltaY = event.clientY - lastY;

          // Move world container (camera pans by moving the world)
          this.worldContainer.position.x += deltaX;
          this.worldContainer.position.y += deltaY;

          // Request render
          this.app.renderer.render(this.app.stage);
        }
      }
    }

    // Hit-test for hover feedback (M2-T4)
    // Only for mouse and pen pointers - touch doesn't have hover
    // Also skip if we're actively dragging, pinching, or dragging an object
    if (
      (event.pointerType === 'mouse' || event.pointerType === 'pen') &&
      !this.isDragging &&
      !this.isPinching &&
      !this.isObjectDragging
    ) {
      // Convert screen coordinates to world coordinates
      const worldX =
        (event.clientX - this.worldContainer.position.x) / this.cameraScale;
      const worldY =
        (event.clientY - this.worldContainer.position.y) / this.cameraScale;

      // Perform hit-test
      const hitResult = this.sceneManager.hitTest(worldX, worldY);
      const newHoveredId = hitResult ? hitResult.id : null;

      // Update hover state if changed
      if (newHoveredId !== this.hoveredObjectId) {
        // Clear previous hover
        if (this.hoveredObjectId) {
          this.updateHoverFeedback(this.hoveredObjectId, false);
        }

        // Set new hover
        this.hoveredObjectId = newHoveredId;
        if (this.hoveredObjectId) {
          this.updateHoverFeedback(this.hoveredObjectId, true);
        }

        // Request render to show hover feedback
        this.app.renderer.render(this.app.stage);
      }
    } else {
      // Clear hover when not applicable (touch, dragging, or pinching)
      // But don't clear if we're dragging the hovered object (M2-T5)
      if (
        this.hoveredObjectId &&
        this.hoveredObjectId !== this.draggedObjectId
      ) {
        this.updateHoverFeedback(this.hoveredObjectId, false);
        this.hoveredObjectId = null;
        this.app.renderer.render(this.app.stage);
      }
    }
  }

  /**
   * Update hover visual feedback for an object (M2-T4).
   * Makes the card appear to lift off the table with shadow and scale.
   */
  private updateHoverFeedback(objectId: string, isHovered: boolean): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    // Store target scale on the visual object
    visual.targetScale = isHovered ? 1.05 : 1.0;

    // Start hover animation if not already running
    if (!this.hoverAnimationActive) {
      this.startHoverAnimation();
    }

    // Redraw the visual with current hover state
    const isSelected = this.selectedObjectIds.has(objectId);
    this.redrawCardVisual(objectId, isHovered, false, isSelected);
  }

  /**
   * Update drag visual feedback for an object (M2-T5).
   * Makes the card appear to lift off the table with colored shadow and scale.
   */
  private updateDragFeedback(objectId: string, isDragging: boolean): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    // Store target scale on the visual object
    visual.targetScale = isDragging ? 1.05 : 1.0;

    // Start hover animation if not already running (reuses same animation system)
    if (!this.hoverAnimationActive) {
      this.startHoverAnimation();
    }

    // Redraw the visual with current drag state
    const isSelected = this.selectedObjectIds.has(objectId);
    this.redrawCardVisual(objectId, false, isDragging, isSelected);
  }

  /**
   * Redraw a card's visual representation (M2-T4, M2-T5).
   * @param isHovered - Whether the card is hovered (black shadow)
   * @param isDragging - Whether the card is being dragged (blue shadow)
   * @param isSelected - Whether the card is selected (yellow border)
   */
  private redrawCardVisual(
    objectId: string,
    isHovered: boolean,
    isDragging: boolean,
    isSelected: boolean,
  ): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    // Get color from object metadata, or fall back to TEST_CARD_COLORS for legacy cards
    const obj = this.sceneManager.getObject(objectId);
    const color =
      (obj?._meta?.color as number) || TEST_CARD_COLORS[objectId] || 0x6c5ce7;

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
      const borderRadius = 12;

      shadowGraphic.roundRect(
        -CARD_WIDTH / 2 - shadowPadding,
        -CARD_HEIGHT / 2 - shadowPadding,
        CARD_WIDTH + shadowPadding * 2,
        CARD_HEIGHT + shadowPadding * 2,
        borderRadius,
      );

      // Use different shadow colors: black for hover, blue for drag
      const shadowColor = isDragging ? 0x3b82f6 : 0x000000; // Blue for drag, black for hover
      shadowGraphic.fill({ color: shadowColor, alpha: 0.3 });

      // Apply blur filter for diffuse shadow
      // Scale blur strength by camera scale to maintain consistent appearance at all zoom levels
      // TODO: BUG - If hovering a card while zooming, the shadow doesn't update until hover changes.
      // This causes the shadow size to be wrong at the new zoom level until you move the mouse.
      // Fix: Listen to zoom changes and redraw hovered card, or update filter strength directly.
      const blurFilter = new BlurFilter({
        strength: 16 * this.cameraScale,
        quality: 10, // Higher quality for smoother blur at high strengths
      });
      shadowGraphic.filters = [blurFilter];

      visual.addChild(shadowGraphic);
    }

    // Create card graphic (always on top, no filter)
    const cardGraphic = new Graphics();
    cardGraphic.rect(
      -CARD_WIDTH / 2,
      -CARD_HEIGHT / 2,
      CARD_WIDTH,
      CARD_HEIGHT,
    );
    cardGraphic.fill(color);

    // Use different border colors for selection state
    const borderColor = isSelected ? 0xef4444 : 0x2d3436; // Red for selected, dark gray otherwise
    const borderWidth = isSelected ? 4 : 2; // Thicker border when selected
    cardGraphic.stroke({ width: borderWidth, color: borderColor });

    visual.addChild(cardGraphic);
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
      if (!this.app || !this.worldContainer) {
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
   * Handle pointer up event (M2-T3 + pinch-to-zoom + M2-T5 object dragging).
   */
  private handlePointerUp(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Clear pointer tracking
    this.pointers.delete(event.pointerId);

    // If we were pinching and now have less than 2 pointers, end pinch
    if (this.isPinching && this.pointers.size < 2) {
      this.isPinching = false;
      console.log('[RendererCore] Pinch gesture ended');

      // Transition to pan mode: reset remaining pointer's start position
      // so user doesn't need to exceed drag slop again
      if (this.pointers.size === 1) {
        const remainingPointer = Array.from(this.pointers.values())[0];
        remainingPointer.startX = remainingPointer.lastX;
        remainingPointer.startY = remainingPointer.lastY;
        // Allow immediate dragging without slop threshold
        this.isDragging = true;
      }
    }

    // Handle selection on click/tap (only if we didn't drag object or camera)
    if (
      event.isPrimary &&
      !this.isObjectDragging &&
      !this.isDragging &&
      this.pointerDownEvent
    ) {
      const worldX =
        (event.clientX - this.worldContainer.position.x) / this.cameraScale;
      const worldY =
        (event.clientY - this.worldContainer.position.y) / this.cameraScale;

      const hitResult = this.sceneManager.hitTest(worldX, worldY);

      if (hitResult) {
        // Clicked on an object - handle selection logic
        const isMultiSelectModifier =
          this.pointerDownEvent.metaKey || this.pointerDownEvent.ctrlKey;

        if (isMultiSelectModifier) {
          // Cmd/Ctrl+click: toggle selection
          if (this.selectedObjectIds.has(hitResult.id)) {
            this.selectedObjectIds.delete(hitResult.id);
            this.redrawCardVisual(hitResult.id, false, false, false);
          } else {
            this.selectedObjectIds.add(hitResult.id);
            this.redrawCardVisual(hitResult.id, false, false, true);
          }
        } else {
          // Single click: select only this card (unless already selected)
          if (!this.selectedObjectIds.has(hitResult.id)) {
            // Clear previous selection and select new card
            const prevSelected = Array.from(this.selectedObjectIds);
            this.selectedObjectIds.clear();
            this.selectedObjectIds.add(hitResult.id);

            // Redraw previously selected cards (now deselected)
            for (const id of prevSelected) {
              if (id !== hitResult.id) {
                this.redrawCardVisual(id, false, false, false);
              }
            }
            // Redraw newly selected card
            this.redrawCardVisual(hitResult.id, false, false, true);
          }
          // If already selected, don't change selection (allows multi-drag)
        }

        // Request render to show selection changes
        this.app.renderer.render(this.app.stage);
      } else {
        // Clicked on empty space - deselect all
        if (this.selectedObjectIds.size > 0) {
          const prevSelected = Array.from(this.selectedObjectIds);
          this.selectedObjectIds.clear();

          // Redraw all previously selected cards
          for (const id of prevSelected) {
            this.redrawCardVisual(id, false, false, false);
          }

          // Request render to show deselection
          this.app.renderer.render(this.app.stage);
        }
      }

      // Clear stored pointer down event
      this.pointerDownEvent = null;
    }

    // End dragging
    if (event.isPrimary) {
      // Clear object drag state (M2-T5)
      if (this.isObjectDragging && this.draggedObjectId) {
        // Update SceneManager spatial index for all selected cards now that drag is complete
        // (deferred from pointer move for performance)
        for (const objectId of this.selectedObjectIds) {
          const obj = this.sceneManager.getObject(objectId);
          if (obj) {
            this.sceneManager.updateObject(objectId, obj);
          }
          // Clear drag visual feedback
          this.updateDragFeedback(objectId, false);
        }

        // Clear drag state
        this.isObjectDragging = false;
        this.draggedObjectId = null;
        this.draggedObjectsStartPositions.clear();
      }

      this.isDragging = false;
    }
  }

  /**
   * Handle pointer cancel event (M2-T3 + pinch-to-zoom + M2-T5 object dragging).
   */
  private handlePointerCancel(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Clear pointer tracking
    this.pointers.delete(event.pointerId);

    // If we were pinching and now have less than 2 pointers, end pinch
    if (this.isPinching && this.pointers.size < 2) {
      this.isPinching = false;
      console.log('[RendererCore] Pinch gesture cancelled');

      // Transition to pan mode: reset remaining pointer's start position
      // so user doesn't need to exceed drag slop again
      if (this.pointers.size === 1) {
        const remainingPointer = Array.from(this.pointers.values())[0];
        remainingPointer.startX = remainingPointer.lastX;
        remainingPointer.startY = remainingPointer.lastY;
        // Allow immediate dragging without slop threshold
        this.isDragging = true;
      }
    }

    // Handle selection on click/tap (only if we didn't drag object or camera)
    if (
      event.isPrimary &&
      !this.isObjectDragging &&
      !this.isDragging &&
      this.pointerDownEvent
    ) {
      const worldX =
        (event.clientX - this.worldContainer.position.x) / this.cameraScale;
      const worldY =
        (event.clientY - this.worldContainer.position.y) / this.cameraScale;

      const hitResult = this.sceneManager.hitTest(worldX, worldY);

      if (hitResult) {
        // Clicked on an object - handle selection logic
        const isMultiSelectModifier =
          this.pointerDownEvent.metaKey || this.pointerDownEvent.ctrlKey;

        if (isMultiSelectModifier) {
          // Cmd/Ctrl+click: toggle selection
          if (this.selectedObjectIds.has(hitResult.id)) {
            this.selectedObjectIds.delete(hitResult.id);
            this.redrawCardVisual(hitResult.id, false, false, false);
          } else {
            this.selectedObjectIds.add(hitResult.id);
            this.redrawCardVisual(hitResult.id, false, false, true);
          }
        } else {
          // Single click: select only this card (unless already selected)
          if (!this.selectedObjectIds.has(hitResult.id)) {
            // Clear previous selection and select new card
            const prevSelected = Array.from(this.selectedObjectIds);
            this.selectedObjectIds.clear();
            this.selectedObjectIds.add(hitResult.id);

            // Redraw previously selected cards (now deselected)
            for (const id of prevSelected) {
              if (id !== hitResult.id) {
                this.redrawCardVisual(id, false, false, false);
              }
            }
            // Redraw newly selected card
            this.redrawCardVisual(hitResult.id, false, false, true);
          }
          // If already selected, don't change selection (allows multi-drag)
        }

        // Request render to show selection changes
        this.app.renderer.render(this.app.stage);
      } else {
        // Clicked on empty space - deselect all
        if (this.selectedObjectIds.size > 0) {
          const prevSelected = Array.from(this.selectedObjectIds);
          this.selectedObjectIds.clear();

          // Redraw all previously selected cards
          for (const id of prevSelected) {
            this.redrawCardVisual(id, false, false, false);
          }

          // Request render to show deselection
          this.app.renderer.render(this.app.stage);
        }
      }

      // Clear stored pointer down event
      this.pointerDownEvent = null;
    }

    // End dragging
    if (event.isPrimary) {
      // Clear object drag state (M2-T5)
      if (this.isObjectDragging && this.draggedObjectId) {
        // Update SceneManager spatial index for all selected cards now that drag is complete
        // (deferred from pointer move for performance)
        for (const objectId of this.selectedObjectIds) {
          const obj = this.sceneManager.getObject(objectId);
          if (obj) {
            this.sceneManager.updateObject(objectId, obj);
          }
          // Clear drag visual feedback
          this.updateDragFeedback(objectId, false);
        }

        // Clear drag state
        this.isObjectDragging = false;
        this.draggedObjectId = null;
        this.draggedObjectsStartPositions.clear();
      }

      this.isDragging = false;
    }
  }

  /**
   * Handle wheel event for zooming (M2-T3).
   * Zooms towards the mouse cursor position (zoom to point under cursor).
   */
  private handleWheel(event: WheelEventData): void {
    if (!this.worldContainer || !this.app) return;

    // Mouse position is already canvas-relative (converted in Board.tsx)
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    // Convert mouse position to world coordinates before scaling
    const worldX = (mouseX - this.worldContainer.position.x) / this.cameraScale;
    const worldY = (mouseY - this.worldContainer.position.y) / this.cameraScale;

    // Calculate zoom factor from wheel delta
    const zoomFactor = event.deltaY > 0 ? 0.95 : 1.05;

    // Apply new scale (no clamping - unlimited zoom)
    this.cameraScale = this.cameraScale * zoomFactor;
    this.worldContainer.scale.set(this.cameraScale);

    // Adjust position so the world point under cursor stays under cursor
    this.worldContainer.position.x = mouseX - worldX * this.cameraScale;
    this.worldContainer.position.y = mouseY - worldY * this.cameraScale;

    // Request render
    this.app.renderer.render(this.app.stage);
  }

  /**
   * Render a simple test scene with TableObjects (M2-T4).
   * Creates several portrait-oriented cards at different positions and z-orders.
   */
  private renderTestScene(): void {
    if (!this.worldContainer) return;

    // Clear any existing children and scene
    this.worldContainer.removeChildren();
    this.sceneManager.clear();
    this.objectVisuals.clear();

    // Create 300 test cards with randomized positions for stress testing
    const testCards: Array<{
      id: string;
      x: number;
      y: number;
      sortKey: string;
      color: number;
    }> = [];

    const NUM_CARDS = 20;
    const AREA_WIDTH = 1200; // Random area width
    const AREA_HEIGHT = 900; // Random area height

    // Available colors from TEST_CARD_COLORS
    const availableColors = [
      TEST_CARD_COLORS['card-1'], // Purple
      TEST_CARD_COLORS['card-2'], // Green
      TEST_CARD_COLORS['card-3'], // Yellow
      TEST_CARD_COLORS['card-4'], // Red
      TEST_CARD_COLORS['card-5'], // Blue
    ];

    for (let i = 0; i < NUM_CARDS; i++) {
      const cardId = `card-${i + 1}`;
      // Random position within area, centered around (0, 0)
      const x = Math.random() * AREA_WIDTH - AREA_WIDTH / 2;
      const y = Math.random() * AREA_HEIGHT - AREA_HEIGHT / 2;
      // Generate sortKey using fractional indexing format
      const sortKey = `0|${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`;
      const color = availableColors[i % availableColors.length];

      testCards.push({ id: cardId, x, y, sortKey, color });
    }

    for (const card of testCards) {
      // Create TableObject
      const tableObject: TableObject = {
        _kind: 'stack',
        _containerId: null,
        _pos: { x: card.x, y: card.y, r: 0 },
        _sortKey: card.sortKey,
        _locked: false,
        _selectedBy: null,
        _meta: { color: card.color }, // Store color in metadata
      };

      // Add to scene manager
      this.sceneManager.addObject(card.id, tableObject);

      // Create visual representation as Container (so we can have shadow + card separately)
      const visual = new Container();

      // Create card graphic
      const cardGraphic = new Graphics();
      cardGraphic.rect(
        -CARD_WIDTH / 2,
        -CARD_HEIGHT / 2,
        CARD_WIDTH,
        CARD_HEIGHT,
      );
      cardGraphic.fill(card.color);
      cardGraphic.stroke({ width: 2, color: 0x2d3436 });

      visual.addChild(cardGraphic);

      // Position the visual
      visual.x = card.x;
      visual.y = card.y;

      // Store visual reference
      this.objectVisuals.set(card.id, visual);

      // Add to world container
      this.worldContainer.addChild(visual);
    }

    console.log(
      `[RendererCore] Test scene created with ${testCards.length} cards`,
    );
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    if (this.worldContainer) {
      this.worldContainer.destroy();
      this.worldContainer = null;
    }
    if (this.app) {
      this.app.destroy();
      this.app = null;
    }
    this.pointers.clear();
    this.sceneManager.clear();
    this.objectVisuals.clear();
    this.hoveredObjectId = null;
  }

  /**
   * Start a test animation to verify ticker enable/disable works.
   * Moves the circle back and forth for 3 seconds.
   */
  private startTestAnimation(): void {
    if (!this.app || !this.worldContainer || this.isAnimating) {
      console.warn(
        '[RendererCore] Cannot start animation - app not ready or already animating',
      );
      return;
    }

    console.log('[RendererCore] Enabling ticker for animation...');
    console.log(
      '[RendererCore] Ticker started before:',
      this.app.ticker.started,
    );

    this.isAnimating = true;
    this.animationStartTime = Date.now();

    // Get the circle (third child in worldContainer)
    const circle = this.worldContainer.children[2];
    if (!circle) {
      console.error('[RendererCore] Circle not found for animation');
      return;
    }

    // Store original position
    const originalX = circle.x;
    const originalY = circle.y;

    let frameCount = 0;

    // Create ticker callback
    const animationTicker = () => {
      frameCount++;
      const elapsed = Date.now() - this.animationStartTime;
      const duration = 3000; // 3 seconds

      if (elapsed < duration) {
        // Move the circle back and forth
        const progress = elapsed / duration;
        const oscillation = Math.sin(progress * Math.PI * 4); // 2 full cycles
        circle.x = originalX + oscillation * 100;
        circle.y = originalY + oscillation * 50;

        // Render on each frame
        this.app!.renderer.render(this.app!.stage);

        if (frameCount % 30 === 0) {
          console.log(
            `[RendererCore] Animation frame ${frameCount}, elapsed: ${elapsed}ms`,
          );
        }
      } else {
        // Animation complete
        console.log(
          `[RendererCore] Animation complete after ${frameCount} frames, stopping ticker...`,
        );
        this.app!.ticker.remove(animationTicker);
        this.app!.ticker.stop();
        console.log(
          '[RendererCore] Ticker started after stop:',
          this.app!.ticker.started,
        );

        // Reset position
        circle.x = originalX;
        circle.y = originalY;
        this.isAnimating = false;

        // Do final render
        this.app!.renderer.render(this.app!.stage);

        // Notify complete
        this.postResponse({ type: 'animation-complete' });
        console.log('[RendererCore] Animation test complete!');
      }
    };

    // Add ticker callback and start
    this.app.ticker.add(animationTicker);
    this.app.ticker.start();
    console.log(
      '[RendererCore] Ticker started after start:',
      this.app.ticker.started,
    );
    console.log('[RendererCore] Animation running...');
  }
}
