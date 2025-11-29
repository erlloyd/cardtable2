import { Application, Graphics, Container, BlurFilter, Text } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  PointerEventData,
  WheelEventData,
  TableObject,
  InteractionMode,
  AwarenessState,
} from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { RenderMode } from './IRendererAdapter';
import { SceneManager } from './SceneManager';
import { getBehaviors, getEventHandlers, type EventHandlers } from './objects';
import { STACK_WIDTH, STACK_HEIGHT } from './objects/stack/constants';
import { getTokenSize } from './objects/token/utils';
import { getMatSize } from './objects/mat/utils';
import { getCounterSize } from './objects/counter/utils';
import { debounce } from '../utils/debounce';
import {
  CoordinateConverter,
  CameraManager,
  GestureRecognizer,
  SelectionManager,
  DragManager,
  HoverManager,
  SelectionRectangleManager,
  AwarenessManager,
  VisualManager,
} from './managers';

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

// Zoom debounce delay for overlay coordinate updates (M3.5.1-T6)
// Delays re-showing ActionHandle until zoom operations settle
const ZOOM_DEBOUNCE_DELAY_MS = 200;

export abstract class RendererCore {
  protected app: Application | null = null;
  protected worldContainer: Container | null = null;
  private animationStartTime: number = 0;
  private isAnimating: boolean = false;

  // Rendering mode (set by subclasses)
  protected renderMode: RenderMode = RenderMode.Worker; // Default to worker mode

  // Scene management (M2-T4)
  private sceneManager: SceneManager = new SceneManager();

  // Managers (Phase 2 - Hybrid Architecture Refactor)
  private coordConverter: CoordinateConverter = new CoordinateConverter();
  private camera: CameraManager;
  private gestures: GestureRecognizer = new GestureRecognizer();
  private selection: SelectionManager = new SelectionManager();
  private drag: DragManager = new DragManager();
  private hover: HoverManager = new HoverManager();
  private rectangleSelect: SelectionRectangleManager =
    new SelectionRectangleManager();
  private awareness: AwarenessManager = new AwarenessManager();
  private visual: VisualManager = new VisualManager();

  constructor() {
    // Initialize CameraManager with coordinate converter dependency
    this.camera = new CameraManager(this.coordConverter);
  }

  // Interaction mode (pan/select toggle) - still managed directly by RendererCore
  private interactionMode: InteractionMode = 'pan';

  // Zoom end debounce (M3.5.1-T6)
  private debouncedZoomEnd = debounce(() => {
    this.postResponse({ type: 'zoom-ended' });
  }, ZOOM_DEBOUNCE_DELAY_MS);

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
          const { canvas, width, height, dpr, actorId } = message;

          // Initialize managers with actor ID and devicePixelRatio
          this.selection.setActorId(actorId);
          this.coordConverter.setDevicePixelRatio(dpr);
          this.coordConverter.setCameraScale(1.0);

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

            // Do ONE manual render (blank canvas - objects will come from store sync)
            console.log('[RendererCore] Performing initial render...');
            this.app.renderer.render(this.app.stage);
            console.log('[RendererCore] ✓ Initial render complete');

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

            // IMPORTANT: In main-thread mode, PixiJS may set canvas.style to explicit pixel dimensions
            // which breaks our responsive layout. Reset to 100% to fill container.
            // Note: OffscreenCanvas doesn't have a 'style' property, so this only runs in main-thread mode
            if ('style' in this.app.canvas) {
              this.app.canvas.style.width = '100%';
              this.app.canvas.style.height = '100%';
            }

            // Update world container position to keep it centered, preserving pan offset
            if (this.worldContainer) {
              const offsetX = this.worldContainer.position.x - oldWidth / 2;
              const offsetY = this.worldContainer.position.y - oldHeight / 2;
              this.worldContainer.position.set(
                width / 2 + offsetX,
                height / 2 + offsetY,
              );
            }

            // Force a render to update the display
            this.app.renderer.render(this.app.stage);
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

        case 'flush': {
          // E2E Test API: Wait for renderer's pending operations to complete
          // This tracks the full round-trip: pointer-down → Board → Store → Renderer → syncSelectionCache
          console.log(
            `[RendererCore] Received flush, current pendingOperations: ${this.pendingOperations}`,
          );

          if (this.pendingOperations === 0) {
            // No pending operations - respond immediately after 1 frame
            // (to ensure any in-flight rendering is complete)
            console.log(
              '[RendererCore] No pending ops, responding after 1 frame',
            );
            requestAnimationFrame(() => {
              this.postResponse({
                type: 'flushed',
              });
            });
          } else {
            // Poll until renderer's pending operations counter reaches 0
            // This ensures the full round-trip has completed:
            // 1. Renderer processes pointer-down (counter++)
            // 2. Renderer sends objects-selected/moved/unselected to Board
            // 3. Board updates store, Yjs observer sends objects-updated back
            // 4. Renderer receives objects-updated and calls syncSelectionCache (counter--)
            const maxPolls = 100; // Safety limit (100 frames = ~1.67s at 60fps)
            let pollCount = 0;

            const pollFrame = () => {
              pollCount++;

              if (this.pendingOperations === 0) {
                console.log(
                  `[RendererCore] Flush complete after ${pollCount} frames`,
                );
                this.postResponse({
                  type: 'flushed',
                });
              } else if (pollCount >= maxPolls) {
                // Safety timeout - warn but still resolve
                console.warn(
                  `[RendererCore] Flush timeout after ${maxPolls} frames (${this.pendingOperations} ops still pending)`,
                );
                this.postResponse({
                  type: 'flushed',
                });
              } else {
                requestAnimationFrame(pollFrame);
              }
            };

            requestAnimationFrame(pollFrame);
          }
          break;
        }

        case 'set-interaction-mode': {
          this.interactionMode = message.mode;
          console.log(
            `[RendererCore] Interaction mode set to: ${message.mode}`,
          );
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

        case 'pointer-leave': {
          // M3-T4: Pointer left the canvas
          // Clear hover state
          if (this.hoveredObjectId) {
            this.updateHoverFeedback(this.hoveredObjectId, false);
            this.hoveredObjectId = null;
            if (this.app) {
              this.app.renderer.render(this.app.stage);
            }
          }
          break;
        }

        case 'wheel': {
          this.handleWheel(message.event);
          break;
        }

        case 'sync-objects': {
          console.log(
            `[RendererCore] Syncing ${message.objects.length} objects from store`,
          );
          this.clearObjects();
          for (const { id, obj } of message.objects) {
            this.addObjectVisual(id, obj);
          }
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'objects-added': {
          console.log(
            `[RendererCore] Adding ${message.objects.length} object(s)`,
          );
          for (const { id, obj } of message.objects) {
            this.addObjectVisual(id, obj);
          }
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'objects-updated': {
          console.log(
            `[RendererCore] Updating ${message.objects.length} object(s)`,
          );
          for (const { id, obj } of message.objects) {
            this.updateObjectVisual(id, obj);
          }
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'objects-removed': {
          console.log(
            `[RendererCore] Removing ${message.ids.length} object(s)`,
          );
          for (const id of message.ids) {
            this.removeObjectVisual(id);
          }
          // Render after removing
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'clear-objects': {
          console.log('[RendererCore] Clearing all objects');
          this.clearObjects();
          // Render after clearing
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'awareness-update': {
          // M3-T4: Handle remote awareness updates
          this.updateRemoteAwareness(message.states);
          // Render to show awareness changes
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }
          break;
        }

        case 'request-screen-coords': {
          // M3.5.1-T6: Calculate and send screen coordinates on demand
          this.handleRequestScreenCoords(message.ids);
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

      // Sync selection cache only for messages that affect object state (M3-T3)
      // Most messages (init, resize, pointer events) don't modify objects, so no sync needed
      if (this.shouldSyncSelectionCache(message.type)) {
        this.syncSelectionCache();
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

    // Set initial scale (1.0 by default, managed by CameraManager)
    this.worldContainer.scale.set(1.0);

    // Initialize managers with app and containers
    this.camera.initialize(this.app, this.worldContainer);
    this.visual.initialize(this.app, this.renderMode);
    this.awareness.initialize(this.app.stage);
  }

  /**
   * Handle pointer down event (M2-T3 + M2-T5 object dragging).
   */
  private handlePointerDown(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Track pointer start position for gesture recognition
    this.gestures.addPointer(event);

    // Check if we have 2 touch pointers (pinch gesture)
    if (this.gestures.isPinchGesture(event)) {
      // Cancel any ongoing drag operations
      this.drag.cancelObjectDrag();
      this.rectangleSelect.clear();

      // M3.5.1-T6: Notify Board that zoom started (pinch)
      this.postResponse({ type: 'zoom-started' });

      // Start pinch zoom (delegates all pinch state to CameraManager)
      this.camera.startPinch(this.gestures, this.worldContainer);
    } else if (event.isPrimary) {
      // E2E Test API: Increment pending operations counter
      // This will be decremented after the full round-trip completes (syncSelectionCache)
      this.selection.incrementPendingOperations();

      // Store pointer down event for selection logic on pointer up
      this.drag.setPointerDownEvent(event);

      // Always do hit-testing first to determine if we're over a card
      const worldPos = this.coordConverter.screenToWorld(
        event.clientX,
        event.clientY,
        this.worldContainer,
      );

      const hitResult = this.sceneManager.hitTest(worldPos.x, worldPos.y);

      // Determine if we're in rectangle-select mode based on interaction mode + modifiers
      const modifierPressed = event.metaKey || event.ctrlKey;
      const shouldRectangleSelect =
        (this.interactionMode === 'select' && !modifierPressed) ||
        (this.interactionMode === 'pan' && modifierPressed);

      if (hitResult) {
        // Clicking on a card - always prepare for object drag (regardless of mode)
        this.drag.prepareObjectDrag(hitResult.id, worldPos.x, worldPos.y);
        this.rectangleSelect.clear();
      } else if (shouldRectangleSelect) {
        // Clicking on empty space in rectangle select mode - prepare for rectangle selection
        // Note: Not starting yet - will start once we exceed slop threshold in handlePointerMove
        this.rectangleSelect.clear(); // Reset any previous state
        this.drag.cancelObjectDrag();
      } else {
        // Clicking on empty space in pan mode - prepare for camera pan
        this.drag.cancelObjectDrag();
        this.rectangleSelect.clear();
      }
    }
  }

  /**
   * Handle pointer move event (M2-T3 + pinch-to-zoom + M2-T4 hover).
   */
  private handlePointerMove(event: PointerEventData): void {
    if (!this.worldContainer || !this.app) return;

    const pointerInfo = this.gestures.getPointer(event.pointerId);

    // Only handle gestures if pointer is being tracked (after pointer-down)
    if (pointerInfo) {
      // Update pointer position in gesture recognizer
      this.gestures.updatePointer(event);

      // Handle pinch zoom (2 fingers)
      if (this.camera.updatePinch(this.gestures, this.worldContainer)) {
        // Update coordinate converter with new scale
        this.coordConverter.setCameraScale(this.worldContainer.scale.x);
        this.visual.setCameraScale(this.worldContainer.scale.x);

        // Request render
        this.app.renderer.render(this.app.stage);
        // Don't return - we still want to do hit-test for hover
      }

      // Handle single-pointer pan/drag (M2-T3 + M2-T5 object dragging)
      if (this.gestures.getPointerCount() === 1) {
        // Check if movement exceeds drag slop threshold
        if (
          this.gestures.exceedsDragSlop(event, pointerInfo) &&
          !this.drag.isDragging() &&
          !this.rectangleSelect.isSelecting() &&
          event.isPrimary
        ) {
          // Determine what to start based on what was prepared in handlePointerDown
          const draggedId = this.drag.getDraggedObjectId();

          if (draggedId) {
            // M3.5.1-T6: Notify Board that object drag started
            this.postResponse({ type: 'object-drag-started' });

            // Start object drag (determines which objects to drag, handles selection, updates z-order)
            const draggedIds = this.drag.startObjectDrag(
              this.sceneManager,
              this.selection,
            );

            // Handle selection updates if needed (async)
            const isDraggedObjectSelected = this.selection.isSelected(draggedId);
            const pointerDownEvent = this.drag.getPointerDownEvent();
            const isMultiSelectModifier =
              pointerDownEvent &&
              (pointerDownEvent.metaKey || pointerDownEvent.ctrlKey);

            if (!isDraggedObjectSelected) {
              // Dragging an unselected object - update selection
              if (isMultiSelectModifier) {
                this.selectObjects([draggedId], false); // Add to selection
              } else {
                this.selectObjects([draggedId], true); // Replace selection
              }
            }

            // Apply drag visual feedback to all dragged objects
            for (const objectId of draggedIds) {
              const isSelected = this.selection.isSelected(objectId);
              this.visual.updateDragFeedback(
                objectId,
                true,
                isSelected,
                this.sceneManager,
              );

              // Update visual z-order
              const visual = this.visual.getVisual(objectId);
              if (visual && this.worldContainer) {
                this.worldContainer.setChildIndex(
                  visual,
                  this.worldContainer.children.length - 1,
                );
              }
            }
          } else {
            // Check if we should start rectangle selection or camera pan
            // Rectangle selection is prepared when clicking empty space in select mode
            const worldPos = this.coordConverter.screenToWorld(
              pointerInfo.startX,
              pointerInfo.startY,
              this.worldContainer,
            );

            // If we're in a mode that supports rectangle selection, start it
            const shouldStartRectangle =
              this.interactionMode === 'select' ||
              (pointerInfo && 'metaKey' in event && (event.metaKey || event.ctrlKey));

            if (shouldStartRectangle) {
              this.rectangleSelect.start(worldPos.x, worldPos.y);
              console.log('[RendererCore] Starting rectangle selection');
            } else {
              // No object and not rectangle selecting - start camera pan
              // M3.5.1-T6: Notify Board that pan started
              this.postResponse({ type: 'pan-started' });
            }
          }
        }

        // If dragging an object, update positions of all dragged objects
        if (this.drag.isDragging() && event.isPrimary) {
          // Calculate current world position
          const worldPos = this.coordConverter.screenToWorld(
            event.clientX,
            event.clientY,
            this.worldContainer,
          );

          // Update drag positions (handles all dragged objects)
          this.drag.updateDragPositions(
            worldPos.x,
            worldPos.y,
            this.sceneManager,
            this.visual.getAllVisuals(),
          );

          // Send drag state update for awareness (M5-T1)
          const dragStateUpdate = this.drag.getDragStateUpdate(this.sceneManager);
          if (dragStateUpdate) {
            this.postResponse({
              type: 'drag-state-update',
              gid: dragStateUpdate.gid,
              primaryId: dragStateUpdate.primaryId,
              pos: dragStateUpdate.pos,
              secondaryOffsets: dragStateUpdate.secondaryOffsets,
            });
          }

          // Request render
          // Note: SceneManager spatial index update is deferred until drag ends
          // to avoid expensive RBush removal/insertion on every pointer move
          this.app.renderer.render(this.app.stage);
        }
        // If dragging camera, manually pan the camera
        else if (event.isPrimary && !this.drag.isDragging() && !this.rectangleSelect.isSelecting()) {
          // Use camera manager to pan
          if (this.camera.pan(pointerInfo.lastX, pointerInfo.lastY, event.clientX, event.clientY, this.worldContainer)) {
            // Request render
            this.app.renderer.render(this.app.stage);
          }
        }
        // If rectangle selecting, update the selection rectangle
        else if (this.rectangleSelect.isSelecting() && event.isPrimary) {
          // Calculate current world position
          const worldPos = this.coordConverter.screenToWorld(
            event.clientX,
            event.clientY,
            this.worldContainer,
          );

          // Update selection rectangle
          this.rectangleSelect.update(worldPos.x, worldPos.y, this.worldContainer);

          // Request render
          this.app.renderer.render(this.app.stage);
        }
      }
    }

    // Hit-test for hover feedback (M2-T4)
    // Only for mouse and pen pointers - touch doesn't have hover
    // Also skip if we're actively dragging, pinching, dragging an object, or rectangle selecting
    if (
      this.hover.shouldProcessHover(
        event.pointerType,
        this.drag.isDragging(),
        this.camera.isPinching(),
        this.rectangleSelect.isSelecting(),
      )
    ) {
      // Convert screen coordinates to world coordinates
      const worldPos = this.coordConverter.screenToWorld(
        event.clientX,
        event.clientY,
        this.worldContainer,
      );

      // Perform hit-test
      const hitResult = this.sceneManager.hitTest(worldPos.x, worldPos.y);
      const newHoveredId = hitResult ? hitResult.id : null;

      // Update hover state if changed
      if (this.hover.updateHoveredObject(newHoveredId)) {
        // Clear previous hover
        const prevId = this.hover.getPreviousHoveredId();
        if (prevId) {
          const isSelected = this.selection.isSelected(prevId);
          this.visual.updateHoverFeedback(
            prevId,
            false,
            isSelected,
            this.sceneManager,
          );
        }

        // Set new hover
        const currentId = this.hover.getHoveredObjectId();
        if (currentId) {
          const isSelected = this.selection.isSelected(currentId);
          this.visual.updateHoverFeedback(
            currentId,
            true,
            isSelected,
            this.sceneManager,
          );
        }

        // Request render to show hover feedback
        this.app.renderer.render(this.app.stage);
      }
    } else {
      // Clear hover when not applicable (touch, dragging, or pinching)
      // But don't clear if we're dragging the hovered object (M2-T5)
      const hoveredId = this.hover.getHoveredObjectId();
      const draggedId = this.drag.getDraggedObjectId();
      if (hoveredId && hoveredId !== draggedId) {
        const isSelected = this.selection.isSelected(hoveredId);
        this.visual.updateHoverFeedback(
          hoveredId,
          false,
          isSelected,
          this.sceneManager,
        );
        this.hover.clearHover();
        this.app.renderer.render(this.app.stage);
      }
    }

    // Send cursor position in world coordinates (M3-T4)
    // Skip cursor updates during object drag (drag-state-update already sent)
    // This avoids double awareness updates (cursor + drag = 60Hz instead of 30Hz)
    if (!this.drag.isDragging()) {
      const worldPos = this.coordConverter.screenToWorld(
        event.clientX,
        event.clientY,
        this.worldContainer,
      );

      this.postResponse({
        type: 'cursor-position',
        x: worldPos.x,
        y: worldPos.y,
      });
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
   * Update or create selection rectangle graphic.
   */
  private updateSelectionRectangle(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    if (!this.worldContainer) return;

    // Create selection rectangle if it doesn't exist
    if (!this.selectionRectangle) {
      this.selectionRectangle = new Graphics();
      this.worldContainer.addChild(this.selectionRectangle);
    }

    // Clear and redraw rectangle
    this.selectionRectangle.clear();

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Draw filled rectangle with border
    this.selectionRectangle.rect(minX, minY, width, height);
    this.selectionRectangle.fill({ color: 0x3b82f6, alpha: 0.2 }); // Blue fill
    this.selectionRectangle.stroke({ width: 2, color: 0x3b82f6 }); // Blue border
  }

  /**
   * Clear selection rectangle graphic.
   */
  private clearSelectionRectangle(): void {
    if (this.selectionRectangle && this.worldContainer) {
      this.worldContainer.removeChild(this.selectionRectangle);
      this.selectionRectangle.destroy();
      this.selectionRectangle = null;
    }
  }

  /**
   * Create base shape graphic for an object based on its kind.
   * Does NOT include text label or shadow.
   */
  private createBaseShapeGraphic(
    objectId: string,
    obj: TableObject,
    isSelected: boolean,
  ): Graphics {
    const behaviors = getBehaviors(obj._kind);
    return behaviors.render(obj, {
      isSelected,
      isHovered: this.hoveredObjectId === objectId,
      isDragging: this.draggedObjectId === objectId,
      cameraScale: this.cameraScale,
    });
  }

  /**
   * Create a text label showing the object's kind.
   * Returns a centered Text object ready to be added to a container.
   */
  private createKindLabel(kind: string): Text {
    const kindText = new Text({
      text: kind,
      style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xffffff, // White text
        stroke: { color: 0x000000, width: 2 }, // Black outline for readability
        align: 'center',
      },
    });
    kindText.anchor.set(0.5); // Center the text
    kindText.y = 0; // Center vertically in the object

    return kindText;
  }

  /**
   * Call an event handler for an object if one is registered.
   * This provides infrastructure for future event-driven behaviors.
   *
   * NOTE: Prefixed with _ to indicate this is intentionally unused infrastructure.
   * It will be integrated when event handlers are needed in the rendering pipeline.
   *
   * @param obj - The table object to handle events for
   * @param eventName - The name of the event to trigger
   * @param args - Event-specific arguments (unknown type because different events have different arg types)
   *
   * Note: Using `unknown` instead of `any` for type safety. This forces proper type checking
   * when this infrastructure is eventually integrated. The actual arg types vary by event:
   * - onHover: boolean
   * - onClick/onDoubleClick: PointerEventData
   * - onDrag: { x: number; y: number }
   * - onDrop: TableObject | null
   *
   * @example
   * // Future integration example:
   * const obj = this.sceneManager.getObject(objectId);
   * if (obj) {
   *   this._callEventHandler(obj, 'onHover', true);
   * }
   */
  // @ts-expect-error TS6133 - Intentionally unused infrastructure for future event handler integration
  private _callEventHandler(
    obj: TableObject,
    eventName: keyof EventHandlers,
    args?: unknown,
  ): void {
    const handlers = getEventHandlers(obj._kind);
    const handler = handlers[eventName];
    if (handler) {
      // Type assertion needed because EventHandlers creates a complex union type
      // that TypeScript can't narrow properly. This is safe because we're calling
      // the handler with the object and args that match the event signature.
      (handler as (obj: TableObject, args?: unknown) => void)(obj, args);
    }
  }

  /**
   * Redraw an object's visual representation (M2-T4, M2-T5).
   * @param isHovered - Whether the object is hovered (black shadow)
   * @param isDragging - Whether the object is being dragged (blue shadow)
   * @param isSelected - Whether the object is selected (red border)
   */
  private redrawCardVisual(
    objectId: string,
    isHovered: boolean,
    isDragging: boolean,
    isSelected: boolean,
  ): void {
    const visual = this.objectVisuals.get(objectId);
    if (!visual) return;

    const obj = this.sceneManager.getObject(objectId);
    if (!obj) return;

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
      // TODO: BUG - If hovering a card while zooming, the shadow doesn't update until hover changes.
      // This causes the shadow size to be wrong at the new zoom level until you move the mouse.
      // Fix: Listen to zoom changes and redraw hovered card, or update filter strength directly.
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
    const shapeGraphic = this.createBaseShapeGraphic(objectId, obj, isSelected);
    visual.addChild(shapeGraphic);

    // Add text label showing object type
    visual.addChild(this.createKindLabel(obj._kind));
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
   * Handle selection logic on pointer end (up or cancel).
   * Extracted to avoid duplication between handlePointerUp and handlePointerCancel.
   */
  private handleSelectionOnPointerEnd(
    event: PointerEventData,
    wasRectangleSelecting: boolean,
  ): void {
    // Handle selection on click/tap (only if we didn't drag object or camera or rectangle select)
    if (
      event.isPrimary &&
      !this.isObjectDragging &&
      !this.isDragging &&
      !wasRectangleSelecting &&
      this.pointerDownEvent
    ) {
      const worldX =
        (event.clientX - this.worldContainer!.position.x) / this.cameraScale;
      const worldY =
        (event.clientY - this.worldContainer!.position.y) / this.cameraScale;

      const hitResult = this.sceneManager.hitTest(worldX, worldY);

      if (hitResult) {
        // Clicked on an object - handle selection logic
        const isMultiSelectModifier =
          this.pointerDownEvent.metaKey || this.pointerDownEvent.ctrlKey;

        if (isMultiSelectModifier) {
          // Cmd/Ctrl+click: toggle selection
          if (this.selectedObjectIds.has(hitResult.id)) {
            this.unselectObjects([hitResult.id]);
          } else {
            this.selectObjects([hitResult.id], false);
          }
        } else {
          // Single click: select only this card (unless already selected)
          if (!this.selectedObjectIds.has(hitResult.id)) {
            this.selectObjects([hitResult.id], true);
          } else {
            // M3.5.1-T4: Already selected, send empty message to signal click processed
            // (for context menu timing - ensures waitForSelectionSettled resolves)
            this.postResponse({
              type: 'objects-selected',
              ids: [],
              screenCoords: [],
            });
          }
        }

        // Request render to show selection changes
        this.app!.renderer.render(this.app!.stage);
      } else {
        // Clicked on empty space - deselect all
        if (this.selectedObjectIds.size > 0) {
          const toUnselect = Array.from(this.selectedObjectIds);
          this.unselectObjects(toUnselect);

          // Request render to show deselection
          this.app!.renderer.render(this.app!.stage);
        } else {
          // M3.5.1-T4: Even if nothing was selected, send an empty unselect message
          // to signal that the click event has been processed (for context menu timing)
          this.postResponse({
            type: 'objects-unselected',
            ids: [],
          });
        }
      }

      // Clear stored pointer down event
      this.pointerDownEvent = null;
    }
  }

  /**
   * Clear drag state after pointer end (up or cancel).
   * Extracted to avoid duplication between handlePointerUp and handlePointerCancel.
   */
  private clearDragState(event: PointerEventData): void {
    // End dragging
    if (event.isPrimary) {
      // Clear object drag state (M2-T5)
      if (this.isObjectDragging && this.draggedObjectId) {
        // Collect position updates for all dragged objects (M3-T2.5 bi-directional sync)
        const positionUpdates: Array<{
          id: string;
          pos: { x: number; y: number; r: number };
        }> = [];

        // Update SceneManager spatial index for all dragged cards now that drag is complete
        // (deferred from pointer move for performance)
        // IMPORTANT: Use draggedObjectsStartPositions instead of selectedObjectIds to avoid race condition
        // when dragging unselected objects (selection update is async)
        for (const objectId of this.draggedObjectsStartPositions.keys()) {
          const obj = this.sceneManager.getObject(objectId);
          if (obj) {
            this.sceneManager.updateObject(objectId, obj);
            // Collect position update
            positionUpdates.push({ id: objectId, pos: obj._pos });
          }
          // Clear drag visual feedback
          this.updateDragFeedback(objectId, false);
        }

        // Send position updates to Board (which will update the store)
        if (positionUpdates.length > 0) {
          this.postResponse({
            type: 'objects-moved',
            updates: positionUpdates,
          });
        }

        // Send drag state clear for awareness (M5-T1)
        if (this.currentDragGestureId) {
          this.postResponse({
            type: 'drag-state-clear',
          });
        }

        // M3.5.1-T6: Notify Board that object drag ended
        this.postResponse({ type: 'object-drag-ended' });

        // Clear drag state
        this.isObjectDragging = false;
        this.draggedObjectId = null;
        this.draggedObjectsStartPositions.clear();
        this.currentDragGestureId = null;
      }

      // Clear rectangle selection state if needed
      if (this.isRectangleSelecting) {
        this.clearSelectionRectangle();
        this.isRectangleSelecting = false;
        this.rectangleSelectStartX = 0;
        this.rectangleSelectStartY = 0;
      }

      // Clear camera drag
      const wasPanning = this.isDragging;
      this.isDragging = false;

      // M3.5.1-T6: Notify Board that pan ended
      if (wasPanning) {
        this.postResponse({ type: 'pan-ended' });
      }
    }
  }

  /**
   * Handle pointer up event (M2-T3 + pinch-to-zoom + M2-T5 object dragging).
   */
  private handlePointerUp(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Store rectangle selecting state before we potentially reset it
    const wasRectangleSelecting = this.rectangleSelect.isSelecting();

    // Clear pointer tracking
    this.gestures.removePointer(event.pointerId);

    // If we were pinching and now have less than 2 pointers, end pinch
    if (this.camera.isPinching() && this.gestures.getPointerCount() < 2) {
      this.camera.endPinch();
      console.log('[RendererCore] Pinch gesture ended');

      // M3.5.1-T6: Notify Board that zoom ended (debounced)
      this.debouncedZoomEnd();

      // Clear rectangle selection state to prevent ghost selections
      this.rectangleSelect.clear();

      // Transition to pan mode: reset remaining pointer's start position
      // so user doesn't need to exceed drag slop again
      if (this.gestures.getPointerCount() === 1) {
        this.gestures.resetRemainingPointer();
      }
    }

    // Handle rectangle selection completion
    if (this.rectangleSelect.isSelecting() && event.isPrimary) {
      // Calculate current world position
      const worldPos = this.coordConverter.screenToWorld(
        event.clientX,
        event.clientY,
        this.worldContainer,
      );

      // Complete rectangle selection and get selected object IDs
      const selectedIds = this.rectangleSelect.complete(
        worldPos.x,
        worldPos.y,
        this.sceneManager,
        this.worldContainer,
      );

      // Determine if multi-select (keep existing selections)
      const pointerDownEvent = this.drag.getPointerDownEvent();
      const isMultiSelectModifier =
        pointerDownEvent?.metaKey || pointerDownEvent?.ctrlKey;

      // Select objects in rectangle
      this.selectObjects(selectedIds, !isMultiSelectModifier);

      console.log(
        `[RendererCore] Rectangle selected ${selectedIds.length} objects`,
      );

      // Request render
      this.app!.renderer.render(this.app!.stage);
    }

    // Handle selection logic
    this.handleSelectionOnPointerEnd(event, wasRectangleSelecting);

    // Clear drag state
    this.clearDragState(event);
  }

  /**
   * Handle pointer cancel event (M2-T3 + pinch-to-zoom + M2-T5 object dragging).
   */
  private handlePointerCancel(event: PointerEventData): void {
    if (!this.worldContainer) return;

    // Store rectangle selecting state before we potentially reset it
    const wasRectangleSelecting = this.rectangleSelect.isSelecting();

    // Clear pointer tracking
    this.gestures.removePointer(event.pointerId);

    // If we were pinching and now have less than 2 pointers, end pinch
    if (this.camera.isPinching() && this.gestures.getPointerCount() < 2) {
      this.camera.endPinch();
      console.log('[RendererCore] Pinch gesture cancelled');

      // Transition to pan mode: reset remaining pointer's start position
      // so user doesn't need to exceed drag slop again
      if (this.gestures.getPointerCount() === 1) {
        this.gestures.resetRemainingPointer();
      }
    }

    // Handle selection logic
    this.handleSelectionOnPointerEnd(event, wasRectangleSelecting);

    // Clear drag state
    this.clearDragState(event);
  }

  /**
   * Handle wheel event for zooming (M2-T3).
   * Zooms towards the mouse cursor position (zoom to point under cursor).
   */
  private handleWheel(event: WheelEventData): void {
    if (!this.worldContainer || !this.app) return;

    // M3.5.1-T6: Notify Board that zoom started
    this.postResponse({ type: 'zoom-started' });

    // Use camera manager to perform zoom
    this.camera.zoom(event, this.worldContainer);

    // Update coordinate converter and visual manager with new scale
    const newScale = this.worldContainer.scale.x;
    this.coordConverter.setCameraScale(newScale);
    this.visual.setCameraScale(newScale);

    // Request render
    this.app.renderer.render(this.app.stage);

    // M3.5.1-T6: Debounce zoom-ended message (150ms after last wheel event)
    this.debouncedZoomEnd();
  }

  /**
   * Add a visual representation for a TableObject (M3-T2.5 Phase 5-6).
   * Creates PixiJS Container with Graphics and adds to scene.
   */
  private addObjectVisual(id: string, obj: TableObject): void {
    if (!this.worldContainer) return;

    // Skip if visual already exists
    if (this.objectVisuals.has(id)) {
      console.warn(`[RendererCore] Visual for object ${id} already exists`);
      return;
    }

    // Add to scene manager for hit-testing
    this.sceneManager.addObject(id, obj);

    // Create visual representation
    const visual = this.createObjectGraphics(id, obj);

    // Position the visual
    visual.x = obj._pos.x;
    visual.y = obj._pos.y;
    visual.rotation = (obj._pos.r * Math.PI) / 180; // Convert degrees to radians

    // Store visual reference
    this.objectVisuals.set(id, visual);

    // Add to world container
    this.worldContainer.addChild(visual);
  }

  /**
   * Update an existing object visual (M3-T2.5 Phase 5-6).
   * Updates position, rotation, and potentially re-renders if kind/meta changed.
   */
  private updateObjectVisual(id: string, obj: TableObject): void {
    const visual = this.objectVisuals.get(id);
    if (!visual || !this.worldContainer) {
      console.warn(`[RendererCore] Visual for object ${id} not found`);
      return;
    }

    // Update scene manager
    this.sceneManager.updateObject(id, obj);

    // Update visual position and rotation
    visual.x = obj._pos.x;
    visual.y = obj._pos.y;
    visual.rotation = (obj._pos.r * Math.PI) / 180;

    // TODO: If kind or meta changed, we may need to recreate the visual
  }

  /**
   * Remove an object visual (M3-T2.5 Phase 5-6).
   */
  private removeObjectVisual(id: string): void {
    const visual = this.objectVisuals.get(id);
    if (visual && this.worldContainer) {
      this.worldContainer.removeChild(visual);
      visual.destroy();
    }

    this.objectVisuals.delete(id);
    this.sceneManager.removeObject(id);

    // Clear selection if this object was selected
    if (this.selectedObjectIds.has(id)) {
      this.selectedObjectIds.delete(id);
    }

    // Clear hover if this object was hovered
    if (this.hoveredObjectId === id) {
      this.hoveredObjectId = null;
    }

    // Clear drag if this object was being dragged
    if (this.draggedObjectId === id) {
      this.draggedObjectId = null;
      this.isObjectDragging = false;
    }
  }

  /**
   * Determine if a message type requires syncing the selection cache (M3-T3).
   *
   * Returns true only for message types that could affect object presence or _selectedBy field:
   * - sync-objects: Full object sync
   * - objects-added: New objects (may have _selectedBy set)
   * - objects-updated: Object properties changed (including _selectedBy)
   * - objects-removed: Objects deleted (may be selected)
   *
   * Other message types (init, resize, pointer events, etc.) don't affect object state,
   * so selection cache remains valid.
   *
   * @param messageType - The type of message being processed
   * @returns true if selection cache should be synced after this message
   */
  private shouldSyncSelectionCache(messageType: string): boolean {
    return (
      messageType === 'sync-objects' ||
      messageType === 'objects-added' ||
      messageType === 'objects-updated' ||
      messageType === 'objects-removed'
    );
  }

  /**
   * Sync selection cache from store state (M3-T3 - Derived State Pattern).
   *
   * This method rebuilds the selectedObjectIds cache based on the _selectedBy field
   * for ALL objects currently in the scene. The store is the single source of truth;
   * this cache exists only for O(1) lookup performance during rendering and drag operations.
   *
   * Called automatically after any message that updates object state.
   */
  private syncSelectionCache(): void {
    const previouslySelected = new Set(this.selectedObjectIds);
    this.selectedObjectIds.clear();

    // Rebuild cache from ALL objects in scene
    const allObjects = this.sceneManager.getAllObjects();
    allObjects.forEach((obj, id) => {
      if (obj._selectedBy === this.actorId) {
        this.selectedObjectIds.add(id);
      }
    });

    // Determine which objects changed selection state for redrawing
    const added = Array.from(this.selectedObjectIds).filter(
      (id) => !previouslySelected.has(id),
    );
    const removed = Array.from(previouslySelected).filter(
      (id) => !this.selectedObjectIds.has(id),
    );

    // Redraw visuals for objects whose selection state changed
    const allIds = new Set([...previouslySelected, ...this.selectedObjectIds]);

    allIds.forEach((id) => {
      const wasSelected = previouslySelected.has(id);
      const isSelected = this.selectedObjectIds.has(id);

      if (wasSelected !== isSelected) {
        // Selection state changed - redraw visual
        this.redrawCardVisual(id, false, false, isSelected);
      }
    });

    // E2E Test API: Decrement pending operations counter
    // Only decrement if there was actually a change (added or removed)
    // This matches the increment in handlePointerDown
    if (added.length > 0 || removed.length > 0) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1);
      console.log(
        `[RendererCore] pendingOperations-- → ${this.pendingOperations} (after syncSelectionCache)`,
      );
    }
  }

  /**
   * Select objects and notify main thread (M3-T3 - Derived State Pattern).
   *
   * This method ONLY sends a message to Board. It does NOT update local state.
   * The flow is:
   * 1. Send objects-selected → Board
   * 2. Board calls selectObjects(store)
   * 3. Store updates _selectedBy field
   * 4. Store sends objects-updated → Renderer
   * 5. syncSelectionCache() updates visual state
   *
   * @param ids - Object IDs to select
   * @param clearPrevious - Whether to clear previous selections first
   */
  private selectObjects(ids: string[], clearPrevious = false): void {
    // Calculate screen coordinates for all selected objects using PixiJS toScreen()
    const screenCoords: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    if (this.worldContainer && ids.length > 0) {
      for (const id of ids) {
        const visual = this.objectVisuals.get(id);
        const obj = this.sceneManager.getObject(id);

        if (visual && obj) {
          // Use PixiJS toGlobal() to convert visual's position to canvas coordinates
          // visual.position is in parent (worldContainer) coordinate space
          // toGlobal converts to stage (canvas) coordinate space
          const canvasPos = visual.toGlobal({ x: 0, y: 0 });

          // Convert to DOM coordinates (divide by devicePixelRatio)
          const domX = canvasPos.x / this.devicePixelRatio;
          const domY = canvasPos.y / this.devicePixelRatio;

          // Calculate dimensions based on object type
          // Dimensions need to account for both camera scale and devicePixelRatio
          let width = 0;
          let height = 0;

          if (obj._kind === ObjectKind.Stack) {
            // Stack dimensions in world space: use actual constants
            width = (STACK_WIDTH * this.cameraScale) / this.devicePixelRatio;
            height = (STACK_HEIGHT * this.cameraScale) / this.devicePixelRatio;
          } else if (
            obj._kind === ObjectKind.Zone &&
            obj._meta?.width &&
            obj._meta?.height
          ) {
            // Zone dimensions from metadata
            width =
              ((obj._meta.width as number) * this.cameraScale) /
              this.devicePixelRatio;
            height =
              ((obj._meta.height as number) * this.cameraScale) /
              this.devicePixelRatio;
          } else if (obj._kind === ObjectKind.Token) {
            // Token dimensions (circular with radius from helper)
            const radius =
              (getTokenSize(obj) * this.cameraScale) / this.devicePixelRatio;
            width = radius * 2;
            height = radius * 2;
          } else if (obj._kind === ObjectKind.Mat) {
            // Mat dimensions (circular with radius from helper)
            const radius =
              (getMatSize(obj) * this.cameraScale) / this.devicePixelRatio;
            width = radius * 2;
            height = radius * 2;
          } else if (obj._kind === ObjectKind.Counter) {
            // Counter dimensions (circular with radius from helper)
            const radius =
              (getCounterSize(obj) * this.cameraScale) / this.devicePixelRatio;
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
    }

    // If clearPrevious, send unselect message for currently selected objects
    if (clearPrevious && this.selectedObjectIds.size > 0) {
      const prevSelected = Array.from(this.selectedObjectIds);
      this.postResponse({
        type: 'objects-unselected',
        ids: prevSelected,
      });
    }

    // Send selection message with screen coordinates
    if (ids.length > 0) {
      this.postResponse({
        type: 'objects-selected',
        ids,
        screenCoords,
      });
    }
  }

  /**
   * Calculate and send screen coordinates for requested objects (M3.5.1-T6).
   * Called when Board component requests coordinates after camera operations.
   */
  private handleRequestScreenCoords(ids: string[]): void {
    const screenCoords: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    if (this.worldContainer && ids.length > 0) {
      for (const id of ids) {
        const visual = this.objectVisuals.get(id);
        const obj = this.sceneManager.getObject(id);

        if (visual && obj) {
          // Use PixiJS toGlobal() to convert visual's position to canvas coordinates
          const canvasPos = visual.toGlobal({ x: 0, y: 0 });

          // Convert to DOM coordinates (divide by devicePixelRatio)
          const domX = canvasPos.x / this.devicePixelRatio;
          const domY = canvasPos.y / this.devicePixelRatio;

          // Calculate dimensions based on object type
          let width = 0;
          let height = 0;

          if (obj._kind === ObjectKind.Stack) {
            width = (STACK_WIDTH * this.cameraScale) / this.devicePixelRatio;
            height = (STACK_HEIGHT * this.cameraScale) / this.devicePixelRatio;
          } else if (
            obj._kind === ObjectKind.Zone &&
            obj._meta?.width &&
            obj._meta?.height
          ) {
            width =
              ((obj._meta.width as number) * this.cameraScale) /
              this.devicePixelRatio;
            height =
              ((obj._meta.height as number) * this.cameraScale) /
              this.devicePixelRatio;
          } else if (obj._kind === ObjectKind.Token) {
            const radius =
              (getTokenSize(obj) * this.cameraScale) / this.devicePixelRatio;
            width = radius * 2;
            height = radius * 2;
          } else if (obj._kind === ObjectKind.Mat) {
            const radius =
              (getMatSize(obj) * this.cameraScale) / this.devicePixelRatio;
            width = radius * 2;
            height = radius * 2;
          } else if (obj._kind === ObjectKind.Counter) {
            const radius =
              (getCounterSize(obj) * this.cameraScale) / this.devicePixelRatio;
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
    }

    // Send screen coordinates response
    this.postResponse({
      type: 'screen-coords',
      screenCoords,
    });
  }

  /**
   * Unselect objects and notify main thread (M3-T3 - Derived State Pattern).
   *
   * This method ONLY sends a message to Board. Selection cache will be updated
   * when the store sends objects-updated message.
   *
   * @param ids - Object IDs to unselect
   */
  private unselectObjects(ids: string[]): void {
    if (ids.length > 0) {
      this.postResponse({
        type: 'objects-unselected',
        ids,
      });
    }
  }

  /**
   * Clear all object visuals (M3-T2.5 Phase 5-6).
   */
  private clearObjects(): void {
    if (!this.worldContainer) return;

    // Remove all visuals from world container and destroy them
    for (const [, visual] of this.objectVisuals) {
      this.worldContainer.removeChild(visual);
      visual.destroy();
    }

    // Clear data structures
    this.objectVisuals.clear();
    this.sceneManager.clear();
    this.selectedObjectIds.clear();
    this.hoveredObjectId = null;
    this.draggedObjectId = null;
    this.isObjectDragging = false;
  }

  /**
   * Create PixiJS Graphics for a TableObject (M3-T2.5 Phase 6).
   * Handles different object types (Stack, Token, Zone, etc.).
   */
  private createObjectGraphics(objectId: string, obj: TableObject): Container {
    const container = new Container();

    // Create base shape using shared method (no duplication!)
    const shapeGraphic = this.createBaseShapeGraphic(objectId, obj, false);
    container.addChild(shapeGraphic);

    // Add text label showing object type
    container.addChild(this.createKindLabel(obj._kind));

    return container;
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

  // ============================================================================
  // Awareness Rendering Methods (M3-T4)
  // ============================================================================

  /**
   * Update remote awareness states and render cursors/drag ghosts
   */
  private updateRemoteAwareness(
    states: Array<{ clientId: number; state: AwarenessState }>,
  ): void {
    if (!this.awarenessContainer || !this.worldContainer) return;

    const now = Date.now();
    const activeClientIds = new Set<number>();

    // Track awareness update rate (M5-T1)
    // Only count when we actually receive remote awareness states
    if (states.length > 0) {
      this.awarenessUpdateTimestamps.push(now);
      // Remove timestamps older than 1 second (rolling window)
      this.awarenessUpdateTimestamps = this.awarenessUpdateTimestamps.filter(
        (ts) => now - ts < 1000,
      );
      // Calculate Hz (updates in the last second)
      const currentHz = this.awarenessUpdateTimestamps.length;
      // Report Hz to UI every 250ms if changed significantly (±2 Hz)
      if (
        now - this.lastAwarenessHzReportTime > 250 &&
        Math.abs(currentHz - this.lastReportedAwarenessHz) >= 2
      ) {
        this.postResponse({
          type: 'awareness-update-rate',
          hz: currentHz,
        });
        this.lastReportedAwarenessHz = currentHz;
        this.lastAwarenessHzReportTime = now;
      }
    }

    // Update or create visuals for each remote actor
    for (const { clientId, state } of states) {
      // Skip our own awareness state (we render locally, not as a ghost)
      if (state.actorId === this.actorId) {
        continue;
      }

      activeClientIds.add(clientId);

      let awarenessData = this.remoteAwareness.get(clientId);
      if (!awarenessData) {
        // New remote actor
        awarenessData = {
          state,
          lastUpdate: now,
        };
        this.remoteAwareness.set(clientId, awarenessData);
      } else {
        // Store previous position for lerp
        if (state.cursor) {
          awarenessData.lerpFrom = awarenessData.state.cursor || state.cursor;
        }
        awarenessData.state = state;
        awarenessData.lastUpdate = now;
      }

      // Render cursor if present
      if (state.cursor) {
        this.renderRemoteCursor(clientId, state, awarenessData);
      } else if (awarenessData.cursor) {
        // Remove cursor visual if cursor data is gone
        this.awarenessContainer.removeChild(awarenessData.cursor);
        awarenessData.cursor.destroy();
        awarenessData.cursor = undefined;
      }

      // Render drag ghost if present
      if (state.drag) {
        this.renderDragGhost(clientId, state, awarenessData);
      } else if (awarenessData.dragGhost) {
        // Remove drag ghost if drag data is gone
        this.awarenessContainer.removeChild(awarenessData.dragGhost);
        awarenessData.dragGhost.destroy();
        awarenessData.dragGhost = undefined;
      }
    }

    // Clean up actors that are no longer present
    for (const [clientId, data] of this.remoteAwareness.entries()) {
      if (!activeClientIds.has(clientId)) {
        // Remove visuals
        if (data.cursor) {
          this.awarenessContainer.removeChild(data.cursor);
          data.cursor.destroy();
        }
        if (data.dragGhost) {
          this.awarenessContainer.removeChild(data.dragGhost);
          data.dragGhost.destroy();
        }
        this.remoteAwareness.delete(clientId);
      }
    }
  }

  /**
   * Render a remote cursor indicator
   */
  private renderRemoteCursor(
    clientId: number,
    state: AwarenessState,
    awarenessData: {
      state: AwarenessState;
      cursor?: Container;
      lastUpdate: number;
      lerpFrom?: { x: number; y: number };
    },
  ): void {
    if (!this.awarenessContainer || !this.worldContainer || !state.cursor)
      return;

    // Create cursor visual if it doesn't exist
    if (!awarenessData.cursor) {
      const cursorContainer = new Container();

      // Cursor pointer (triangle)
      const pointer = new Graphics();
      pointer.moveTo(0, 0);
      pointer.lineTo(12, 4);
      pointer.lineTo(4, 12);
      pointer.closePath();
      pointer.fill(0x3b82f6); // Blue color
      pointer.stroke({ width: 1, color: 0xffffff });

      // Actor name label
      const actorName = state.actorId || `Actor ${clientId}`;
      const label = new Text({
        text: actorName,
        style: {
          fontSize: 12,
          fill: 0xffffff,
          fontFamily: 'Arial',
        },
      });
      label.x = 16;
      label.y = 0;

      // Label background
      const labelBg = new Graphics();
      labelBg.roundRect(14, -2, label.width + 8, label.height + 4, 4);
      labelBg.fill(0x3b82f6);

      cursorContainer.addChild(labelBg);
      cursorContainer.addChild(pointer);
      cursorContainer.addChild(label);

      this.awarenessContainer.addChild(cursorContainer);
      awarenessData.cursor = cursorContainer;
    }

    // Convert world coordinates to screen coordinates
    const screenX =
      this.worldContainer.position.x + state.cursor.x * this.cameraScale;
    const screenY =
      this.worldContainer.position.y + state.cursor.y * this.cameraScale;

    // Simple lerp for smooth 30Hz → 60fps
    // TODO: Implement proper time-based lerp in next iteration
    awarenessData.cursor.x = screenX;
    awarenessData.cursor.y = screenY;
  }

  /**
   * Render a remote drag ghost
   */
  private renderDragGhost(
    _clientId: number,
    state: AwarenessState,
    awarenessData: {
      state: AwarenessState;
      dragGhost?: Container;
      draggedObjectIds?: string[];
      lastUpdate: number;
    },
  ): void {
    if (!this.awarenessContainer || !this.worldContainer || !state.drag) return;

    // Build set of current IDs (primary + secondaries)
    const currentIds = new Set<string>([state.drag.primaryId]);
    if (state.drag.secondaryOffsets) {
      for (const id of Object.keys(state.drag.secondaryOffsets)) {
        currentIds.add(id);
      }
    }

    // Check if dragged object IDs have changed
    const previousIds = awarenessData.draggedObjectIds || [];
    const hasIdsChanged =
      previousIds.length !== currentIds.size ||
      !previousIds.every((id) => currentIds.has(id));

    // Destroy and recreate ghost if object IDs changed
    if (hasIdsChanged && awarenessData.dragGhost) {
      awarenessData.dragGhost.destroy({ children: true });
      awarenessData.dragGhost = undefined;
    }

    // Create drag ghost visual if it doesn't exist
    if (!awarenessData.dragGhost) {
      const ghostContainer = new Container();

      // Render the primary object
      const primaryObj = this.sceneManager.getObject(state.drag.primaryId);

      if (primaryObj) {
        // Create a semi-transparent copy of the primary object
        const behaviors = getBehaviors(primaryObj._kind);
        const ghostGraphic = behaviors.render(primaryObj, {
          isSelected: false,
          isHovered: false,
          isDragging: false,
          cameraScale: this.cameraScale,
        });
        ghostGraphic.alpha = 0.5; // Semi-transparent

        ghostContainer.addChild(ghostGraphic);

        // Render secondary objects if we have offsets
        if (state.drag.secondaryOffsets) {
          for (const [secondaryObjId, offset] of Object.entries(
            state.drag.secondaryOffsets,
          )) {
            const secondaryObj = this.sceneManager.getObject(secondaryObjId);

            if (secondaryObj) {
              const secondaryBehaviors = getBehaviors(secondaryObj._kind);
              const secondaryGraphic = secondaryBehaviors.render(secondaryObj, {
                isSelected: false,
                isHovered: false,
                isDragging: false,
                cameraScale: this.cameraScale,
              });
              secondaryGraphic.alpha = 0.5; // Semi-transparent

              // Position relative to primary object
              secondaryGraphic.x = offset.dx;
              secondaryGraphic.y = offset.dy;
              secondaryGraphic.rotation = (offset.dr * Math.PI) / 180;

              ghostContainer.addChild(secondaryGraphic);
            }
          }
        }
      } else {
        // Fallback: render a generic rectangle if object not found
        const fallback = new Graphics();
        fallback.rect(-50, -70, 100, 140); // Stack size
        fallback.fill(0x3b82f6);
        fallback.alpha = 0.5;
        ghostContainer.addChild(fallback);
      }

      this.awarenessContainer.addChild(ghostContainer);
      awarenessData.dragGhost = ghostContainer;
      awarenessData.draggedObjectIds = Array.from(currentIds); // Track current IDs
    }

    // Convert world coordinates to screen coordinates
    const screenX =
      this.worldContainer.position.x + state.drag.pos.x * this.cameraScale;
    const screenY =
      this.worldContainer.position.y + state.drag.pos.y * this.cameraScale;

    // Apply position and scale
    awarenessData.dragGhost.x = screenX;
    awarenessData.dragGhost.y = screenY;
    awarenessData.dragGhost.scale.set(this.cameraScale);
    awarenessData.dragGhost.rotation = (state.drag.pos.r * Math.PI) / 180;
  }
}
