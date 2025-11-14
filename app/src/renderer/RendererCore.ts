import { Application, Graphics, Container } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  PointerEventData,
  WheelEventData,
} from '@cardtable2/shared';

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
              backgroundColor: 0x1a1a2e,
              autoStart: false, // CRITICAL: Disable auto-start to prevent iOS crashes
            });

            // Try WebGL first, but let PixiJS fallback to canvas if needed
            await this.app.init({
              canvas,
              width,
              height,
              resolution: dpr,
              autoDensity: true,
              backgroundColor: 0x1a1a2e,
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
   * Handle pointer down event (M2-T3).
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
      // Start dragging if this is the primary pointer (and not pinching)
      this.isDragging = false; // Will become true once we exceed slop threshold
    }
  }

  /**
   * Handle pointer move event (M2-T3 + pinch-to-zoom).
   */
  private handlePointerMove(event: PointerEventData): void {
    if (!this.worldContainer || !this.app) return;

    const pointerInfo = this.pointers.get(event.pointerId);
    if (!pointerInfo) return;

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
      return;
    }

    // Handle single-pointer pan/drag
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
      if (!this.isDragging && distance > slopThreshold && event.isPrimary) {
        this.isDragging = true;
      }

      // If dragging, manually pan the camera
      if (this.isDragging && event.isPrimary) {
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

  /**
   * Handle pointer up event (M2-T3 + pinch-to-zoom).
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

    // End dragging
    if (event.isPrimary) {
      this.isDragging = false;
    }
  }

  /**
   * Handle pointer cancel event (M2-T3 + pinch-to-zoom).
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

    // End dragging
    if (event.isPrimary) {
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
   * Render a simple test scene (M2-T2).
   * This will be replaced with real scene management in later tasks.
   */
  private renderTestScene(): void {
    if (!this.worldContainer) return;

    // Clear any existing children
    this.worldContainer.removeChildren();

    // Create objects in world space (0,0 is world origin, camera will be centered)
    // Create a simple colored rectangle
    const rect = new Graphics();
    rect.rect(-200, -150, 200, 150);
    rect.fill(0x6c5ce7);
    this.worldContainer.addChild(rect);

    // Create another rectangle
    const rect2 = new Graphics();
    rect2.rect(50, -100, 150, 200);
    rect2.fill(0x00b894);
    this.worldContainer.addChild(rect2);

    // Create a circle at world origin
    const circle = new Graphics();
    circle.circle(0, 0, 75);
    circle.fill(0xfdcb6e);
    this.worldContainer.addChild(circle);
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
