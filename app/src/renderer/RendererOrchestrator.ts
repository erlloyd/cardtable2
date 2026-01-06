/**
 * Renderer Orchestrator
 *
 * Replaces RendererCore with a message-bus-based architecture.
 * Composes managers and delegates message handling to RendererMessageBus.
 */

import { Application, Container } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  InteractionMode,
  GameAssets,
} from '@cardtable2/shared';
import type { RenderMode } from './IRendererAdapter';
import { SceneManager } from './SceneManager';
import {
  AnimationManager,
  CoordinateConverter,
  CameraManager,
  GestureRecognizer,
  SelectionManager,
  DragManager,
  HoverManager,
  SelectionRectangleManager,
  AwarenessManager,
  VisualManager,
  GridSnapManager,
} from './managers';
import { RendererMessageBus } from './RendererMessageBus';
import type { RendererContext } from './RendererContext';
import { TextureLoader } from './services/TextureLoader';
import { debounce } from '../utils/debounce';

/**
 * Abstract base class for renderer orchestrator
 *
 * Manages PixiJS initialization, composes managers, and delegates
 * message handling to RendererMessageBus.
 *
 * Subclasses (WorkerRendererAdapter, MainThreadRendererAdapter) provide
 * the postResponse implementation for their respective communication channels.
 */
export abstract class RendererOrchestrator {
  // PixiJS
  private app: Application | null = null;
  private worldContainer: Container | null = null;

  // Rendering mode
  protected renderMode: RenderMode;

  // Scene management
  private sceneManager: SceneManager = new SceneManager();

  // Managers
  private animation: AnimationManager = new AnimationManager();
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
  private gridSnap: GridSnapManager = new GridSnapManager();

  // Services
  private textureLoader: TextureLoader = new TextureLoader();

  // Message bus
  private messageBus: RendererMessageBus | null = null;

  // State
  private interactionMode: InteractionMode = 'pan';
  private gridSnapEnabled: boolean = false;
  private gameAssets: GameAssets | null = null;

  // Zoom tracking for scene regeneration
  private lastRegeneratedZoom: number = 1.0;
  // Regeneration threshold balances quality vs performance
  // Only regenerate visuals when zoom changes by ±0.5 (50% zoom change)
  // Lower values = smoother quality transitions but more frequent regeneration cost
  private readonly REGENERATION_DELTA = 0.5;

  // Zoom debounce (M3.5.1-T6)
  // Debounces zoom-ended messages to avoid flickering ActionHandle during rapid scroll
  private debouncedZoomEnd = debounce(() => {
    this.handleZoomEnd();
  }, 250);

  constructor(renderMode: RenderMode) {
    this.renderMode = renderMode;
    this.camera = new CameraManager(this.coordConverter);
  }

  /**
   * Send response message to main thread
   *
   * Implemented by subclasses (Worker vs MainThread)
   */
  protected abstract postResponse(message: RendererToMainMessage): void;

  /**
   * Handle incoming message
   *
   * Routes to initialize() for 'init' message,
   * delegates all other messages to message bus.
   */
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    try {
      // Handle init separately (bootstraps the system)
      if (message.type === 'init') {
        await this.initialize(message);
        return;
      }

      // Handle set-interaction-mode here (needs to update orchestrator state)
      if (message.type === 'set-interaction-mode') {
        this.interactionMode = message.mode;
        return;
      }

      // Handle set-grid-snap-enabled here (needs to update orchestrator state)
      if (message.type === 'set-grid-snap-enabled') {
        this.gridSnapEnabled = message.enabled;
        // Clear ghosts when grid snap is disabled
        if (!message.enabled) {
          this.gridSnap.clearGhosts();
        }
        return;
      }

      // Handle set-game-assets here (needs to update orchestrator state)
      if (message.type === 'set-game-assets') {
        try {
          this.gameAssets = message.assets;

          // Set assets and trigger re-render of affected objects (stacks need card images)
          this.visual.setGameAssets(
            message.assets,
            this.sceneManager,
            this.selection,
            this.hover,
          );

          // Force a render to show the updated visuals
          if (this.app) {
            this.app.renderer.render(this.app.stage);
          }

          console.log(
            '[RendererOrchestrator] Game assets updated successfully',
            {
              hasAssets: !!message.assets,
              cardCount: message.assets?.cards
                ? Object.keys(message.assets.cards).length
                : 0,
            },
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[RendererOrchestrator] Failed to set game assets', {
            error,
            errorMessage,
            hasAssets: !!message.assets,
          });
          this.postResponse({
            type: 'error',
            error: `Failed to update game assets: ${errorMessage}`,
            context: 'set-game-assets',
          });
        }

        return;
      }

      // Delegate all other messages to message bus
      if (!this.messageBus || !this.app || !this.worldContainer) {
        throw new Error('RendererOrchestrator not initialized');
      }

      const context = this.createContext();
      await this.messageBus.handleMessage(message, context);

      // Sync selection cache for messages that affect objects (M3-T3)
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
   * Initialize renderer (handles 'init' message)
   *
   * Creates PixiJS app, initializes viewport and managers,
   * creates message bus.
   */
  private async initialize(
    message: Extract<MainToRendererMessage, { type: 'init' }>,
  ): Promise<void> {
    const { canvas, width, height, dpr, actorId } = message;

    // Initialize managers with basic config
    this.selection.setActorId(actorId);
    this.coordConverter.setDevicePixelRatio(dpr);
    this.coordConverter.setCameraScale(1.0);

    console.log('[RendererOrchestrator] Initializing PixiJS...');
    console.log('[RendererOrchestrator] Canvas type:', canvas.constructor.name);
    console.log('[RendererOrchestrator] Canvas size:', width, 'x', height);
    console.log('[RendererOrchestrator] DPR:', dpr);

    try {
      console.log('[RendererOrchestrator] Creating Application...');
      this.app = new Application();

      console.log('[RendererOrchestrator] Calling app.init()...');

      // Build PixiJS init config
      // Disable antialias during E2E tests to avoid performance/memory issues in CI
      // Enable in development and production for smoother graphics
      const initConfig = {
        canvas,
        width,
        height,
        resolution: dpr,
        autoDensity: true,
        backgroundColor: 0xd4d4d4,
        autoStart: false, // CRITICAL: Prevent automatic ticker start (causes iOS worker crashes)
        antialias: !import.meta.env.VITE_E2E,
      };

      console.log('[RendererOrchestrator] Init config:', {
        canvasType: canvas.constructor.name,
        ...initConfig,
      });

      // Initialize PixiJS app
      await this.app.init(initConfig);

      console.log('[RendererOrchestrator] ✓ PixiJS initialized successfully');
      console.log(
        '[RendererOrchestrator] Renderer type:',
        this.app.renderer.type,
      );
      console.log(
        '[RendererOrchestrator] Renderer name:',
        this.app.renderer.name,
      );
      console.log(
        '[RendererOrchestrator] Canvas dimensions:',
        this.app.canvas.width,
        'x',
        this.app.canvas.height,
      );
      console.log(
        '[RendererOrchestrator] Renderer resolution:',
        this.app.renderer.resolution,
      );
      console.log(
        '[RendererOrchestrator] Screen size:',
        this.app.screen.width,
        'x',
        this.app.screen.height,
      );
      console.log(
        '[RendererOrchestrator] Ticker started:',
        this.app.ticker.started,
      );

      // Verify ticker didn't auto-start (should be false with autoStart: false)
      if (this.app.ticker.started) {
        console.warn(
          '[RendererOrchestrator] WARNING: Ticker auto-started despite autoStart: false!',
        );
        console.log('[RendererOrchestrator] Stopping ticker...');
        this.app.ticker.stop();
      }

      // Initialize viewport (M2-T3)
      console.log('[RendererOrchestrator] Initializing viewport...');
      this.initializeViewport(width, height);
      console.log('[RendererOrchestrator] ✓ Viewport initialized');

      // Do ONE manual render (blank canvas - objects will come from store sync)
      console.log('[RendererOrchestrator] Performing initial render...');
      this.app.renderer.render(this.app.stage);
      console.log('[RendererOrchestrator] ✓ Initial render complete');

      // IMPORTANT: In main-thread mode, PixiJS sets canvas.style to explicit pixel dimensions
      // which breaks our responsive layout. Reset to 100% to fill container.
      // Note: OffscreenCanvas doesn't have a 'style' property, so this only runs in main-thread mode
      if ('style' in canvas) {
        console.log(
          '[RendererOrchestrator] Resetting canvas style for main-thread mode...',
        );
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        console.log(
          '[RendererOrchestrator] ✓ Canvas style reset (width: 100%, height: 100%)',
        );
      }

      // Create message bus
      this.messageBus = new RendererMessageBus();

      this.postResponse({ type: 'initialized' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[RendererOrchestrator] Initialization failed:', error);
      this.postResponse({
        type: 'error',
        error: `PixiJS initialization failed: ${errorMsg}`,
        context: 'init',
      });
    }
  }

  /**
   * Initialize viewport and managers
   *
   * Creates world container, sets initial camera position,
   * initializes all managers.
   */
  private initializeViewport(width: number, height: number): void {
    if (!this.app) return;

    // Create world container
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
    this.visual.setTextureLoader(this.textureLoader);
    this.awareness.initialize(this.app.stage);
    this.gridSnap.initialize(this.app.stage);
    this.animation.initialize(this.app, this.visual.getAllVisuals());
  }

  /**
   * Create context for handlers
   *
   * Provides access to all managers, PixiJS objects, and communication.
   */
  private createContext(): RendererContext {
    if (!this.app || !this.worldContainer) {
      throw new Error('Cannot create context before initialization');
    }

    return {
      // PixiJS
      app: this.app,
      worldContainer: this.worldContainer,
      renderMode: this.renderMode,

      // Managers
      animation: this.animation,
      coordConverter: this.coordConverter,
      camera: this.camera,
      gestures: this.gestures,
      selection: this.selection,
      drag: this.drag,
      hover: this.hover,
      rectangleSelect: this.rectangleSelect,
      awareness: this.awareness,
      visual: this.visual,
      gridSnap: this.gridSnap,
      sceneManager: this.sceneManager,

      // Services
      textureLoader: this.textureLoader,

      // Communication
      postResponse: this.postResponse.bind(this),

      // Debounced functions
      debouncedZoomEnd: this.debouncedZoomEnd,

      // Game content
      gameAssets: this.gameAssets,

      // Mutable state
      interactionMode: this.interactionMode,
      gridSnapEnabled: this.gridSnapEnabled,
    };
  }

  /**
   * Handle zoom end - regenerate visuals if zoom changed significantly
   *
   * Called after zoom gesture completes (debounced 250ms).
   * Regenerates all object visuals (text and strokes) when zoom changes by
   * more than REGENERATION_DELTA (0.5) to maintain visual quality and consistency.
   * Updates both text resolution (for sharpness) and stroke widths (for consistent appearance).
   */
  private handleZoomEnd(): void {
    // Send zoom-ended message to main thread
    this.postResponse({ type: 'zoom-ended' });

    // Check if text regeneration is needed
    if (!this.worldContainer) {
      console.error(
        '[RendererOrchestrator] handleZoomEnd called without worldContainer',
        {
          hasApp: !!this.app,
          orchestratorState: 'zoom-end-handler',
        },
      );
      return;
    }

    const currentZoom = this.worldContainer.scale.x;

    // Validate zoom value before proceeding
    if (!Number.isFinite(currentZoom) || currentZoom <= 0) {
      console.error(
        '[RendererOrchestrator] Invalid zoom value in handleZoomEnd',
        {
          currentZoom,
          containerScale: {
            x: this.worldContainer.scale.x,
            y: this.worldContainer.scale.y,
          },
        },
      );
      return;
    }

    const zoomChange = Math.abs(currentZoom - this.lastRegeneratedZoom);

    // Regenerate when zoom changes significantly to update both:
    // - Stroke widths (counter-scaled to maintain consistent visual appearance)
    // - Text resolution (scaled to maintain sharpness)
    if (zoomChange > this.REGENERATION_DELTA) {
      this.regenerateSceneAtZoom(currentZoom);
      this.lastRegeneratedZoom = currentZoom;
    }
  }

  /**
   * Regenerate all scene visuals at current zoom level
   *
   * Updates text resolution to maintain sharp text (scales linearly with zoom).
   * Updates camera scale for counter-scaled stroke widths (maintains consistent
   * visual stroke width on screen regardless of zoom level).
   *
   * Counter-scaling approach: Stroke widths are divided by sqrt(zoom) to maintain
   * consistent visual appearance across all zoom levels. This prevents strokes
   * from appearing too thick when zoomed in or too thin when zoomed out.
   * Square root scaling (rather than linear) provides better perceptual consistency.
   *
   * Note: This assumes graphics are rendered as tessellated vectors. If cacheAsBitmap
   * or texture-based rendering is used, this approach may need adjustment.
   */
  private regenerateSceneAtZoom(zoomLevel: number): void {
    // Validate dependencies first
    if (!this.worldContainer || !this.app) {
      console.error(
        '[RendererOrchestrator] regenerateSceneAtZoom called with missing dependencies',
        {
          hasWorldContainer: !!this.worldContainer,
          hasApp: !!this.app,
          zoomLevel,
          orchestratorState: 'regenerate-scene',
        },
      );
      return;
    }

    // Validate zoom level before proceeding
    if (!Number.isFinite(zoomLevel) || zoomLevel <= 0) {
      console.error(
        '[RendererOrchestrator] Invalid zoom level in regenerateSceneAtZoom',
        {
          zoomLevel,
          type: typeof zoomLevel,
        },
      );
      return;
    }

    try {
      // Update visual manager with new zoom level for counter-scaled stroke widths
      this.visual.setCameraScale(zoomLevel);

      // Update text resolution multiplier for sharp text at high zoom
      this.visual.setTextResolutionMultiplier(zoomLevel);

      // Regenerate all visuals at new zoom level
      this.visual.regenerateVisuals(
        this.sceneManager,
        this.selection,
        this.hover,
      );

      // Force an immediate render since ticker may not be running (autoStart: false)
      // This ensures visual updates are displayed immediately after zoom ends
      this.app.renderer.render(this.app.stage);
    } catch (error) {
      console.error(
        '[RendererOrchestrator] Critical failure during scene regeneration at zoom',
        {
          zoomLevel,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
    }
  }

  /**
   * Check if message type requires selection cache sync
   *
   * Returns true only for message types that could affect object presence or _selectedBy field.
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
   * Sync selection cache from store (M3-T3 - Derived State Pattern)
   *
   * Rebuilds the selectedObjectIds cache based on the _selectedBy field
   * for ALL objects currently in the scene, and updates visual feedback for changed objects.
   */
  private syncSelectionCache(): void {
    if (!this.app || !this.worldContainer) return;

    // Sync selection state from store (returns which objects changed)
    const { added, removed } = this.selection.syncFromStore(this.sceneManager);

    // Update visual feedback for objects whose selection state changed
    const changedIds = [...added, ...removed];
    for (const objectId of changedIds) {
      const obj = this.sceneManager.getObject(objectId);
      if (!obj) continue;

      const isSelected = this.selection.isSelected(objectId);
      const isHovered = this.hover.getHoveredObjectId() === objectId;

      // Update visual feedback (this will redraw with/without red border)
      this.visual.updateVisualFeedback(
        objectId,
        isHovered,
        isSelected,
        this.sceneManager,
      );
    }

    // Render if there were any changes
    if (changedIds.length > 0) {
      this.app.renderer.render(this.app.stage);
    }
  }

  /**
   * Cleanup resources
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
    this.gestures.clear();
    this.sceneManager.clear();
    if (this.worldContainer) {
      this.visual.clear(this.worldContainer);
    }
    this.hover.clearAll();
  }
}
