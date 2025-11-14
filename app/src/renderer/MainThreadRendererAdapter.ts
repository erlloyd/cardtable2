import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import type { IRendererAdapter } from './IRendererAdapter';
import { RendererCore } from './RendererCore';

/**
 * Main-thread implementation of RendererCore.
 *
 * This class extends RendererCore and implements postResponse using
 * a callback function instead of postMessage.
 */
class MainThreadRendererCore extends RendererCore {
  private callback: ((message: RendererToMainMessage) => void) | null = null;

  setCallback(callback: (message: RendererToMainMessage) => void): void {
    this.callback = callback;
  }

  protected postResponse(message: RendererToMainMessage): void {
    if (this.callback) {
      this.callback(message);
    }
  }
}

/**
 * Adapter for main-thread rendering mode.
 *
 * This adapter runs the renderer directly on the main thread instead of
 * in a worker. Messages are sent via direct method calls and received via
 * callback function.
 *
 * This mode is used when OffscreenCanvas is not available or when explicitly
 * requested by the user (e.g., for debugging or battery saving).
 */
export class MainThreadRendererAdapter implements IRendererAdapter {
  private renderer: MainThreadRendererCore;
  private messageHandler: ((message: RendererToMainMessage) => void) | null =
    null;

  constructor() {
    this.renderer = new MainThreadRendererCore();

    // Set up callback for messages from renderer
    this.renderer.setCallback((message: RendererToMainMessage) => {
      if (this.messageHandler) {
        this.messageHandler(message);
      }
    });

    // Send ready message immediately (no worker initialization delay)
    setTimeout(() => {
      if (this.messageHandler) {
        this.messageHandler({ type: 'ready' });
      }
    }, 0);
  }

  sendMessage(message: MainToRendererMessage): void {
    // Call handleMessage directly (no postMessage needed)
    this.renderer.handleMessage(message).catch((error) => {
      // Forward any unhandled errors to the message handler
      if (this.messageHandler) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.messageHandler({
          type: 'error',
          error: `Unhandled renderer error: ${errorMsg}`,
          context: 'main-thread',
        });
      }
    });
  }

  onMessage(handler: (message: RendererToMainMessage) => void): void {
    this.messageHandler = handler;
  }

  destroy(): void {
    this.messageHandler = null;
    this.renderer.destroy();
  }
}
