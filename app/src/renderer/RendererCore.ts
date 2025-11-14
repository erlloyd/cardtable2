import { Application, Graphics } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';

/**
 * Core rendering logic shared between worker and main-thread modes.
 *
 * This class contains ALL rendering logic and processes messages identically
 * regardless of where it runs. The ONLY difference between modes is how
 * postResponse() is implemented (postMessage vs callback).
 */
export abstract class RendererCore {
  protected app: Application | null = null;

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

          try {
            this.app = new Application();
            // Try WebGL first, but let PixiJS fallback to canvas if needed
            await this.app.init({
              canvas,
              width,
              height,
              resolution: dpr,
              autoDensity: true,
              backgroundColor: 0x1a1a2e,
              // Remove explicit preference to allow automatic fallback
            });

            // Render a simple test scene
            this.renderTestScene();

            this.postResponse({ type: 'initialized' });
          } catch (initError) {
            const errorMsg =
              initError instanceof Error
                ? initError.message
                : String(initError);
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
            this.app.renderer.resize(width, height);
            this.app.renderer.resolution = dpr;
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
   * Render a simple test scene (M2-T2).
   * This will be replaced with real scene management in later tasks.
   */
  private renderTestScene(): void {
    if (!this.app) return;

    const stage = this.app.stage;

    // Clear any existing children
    stage.removeChildren();

    // Create a simple colored rectangle to verify rendering
    const rect = new Graphics();
    rect.rect(50, 50, 200, 150);
    rect.fill(0x6c5ce7);
    stage.addChild(rect);

    // Create another rectangle
    const rect2 = new Graphics();
    rect2.rect(300, 100, 150, 200);
    rect2.fill(0x00b894);
    stage.addChild(rect2);

    // Create a circle
    const circle = new Graphics();
    circle.circle(500, 250, 75);
    circle.fill(0xfdcb6e);
    stage.addChild(circle);
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    if (this.app) {
      this.app.destroy();
      this.app = null;
    }
  }
}
