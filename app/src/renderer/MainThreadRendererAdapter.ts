import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { RenderMode, type IRendererAdapter } from './IRendererAdapter';
import { RendererOrchestrator } from './RendererOrchestrator';

/**
 * Main-thread implementation of RendererOrchestrator.
 *
 * This class extends RendererOrchestrator and implements postResponse using
 * a callback function instead of postMessage.
 */
class MainThreadRendererOrchestrator extends RendererOrchestrator {
  private callback: ((message: RendererToMainMessage) => void) | null = null;

  constructor() {
    super(RenderMode.MainThread);
  }

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
  readonly mode = RenderMode.MainThread;

  private renderer: MainThreadRendererOrchestrator;
  private messageHandler: ((message: RendererToMainMessage) => void) | null =
    null;

  constructor() {
    this.renderer = new MainThreadRendererOrchestrator();

    // Set up callback for messages from renderer
    this.renderer.setCallback((message: RendererToMainMessage) => {
      if (this.messageHandler) {
        this.messageHandler(message);
      }
    });
  }

  sendMessage(message: MainToRendererMessage): void {
    // Call handleMessage directly (no postMessage needed)
    this.renderer.handleMessage(message).catch((error) => {
      console.error('[MainThreadRendererAdapter] handleMessage error:', error);

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

    // Send ready message immediately now that the handler is set
    // Use setTimeout to avoid issues if handler expects async behavior
    setTimeout(() => {
      handler({ type: 'ready' });
    }, 0);
  }

  destroy(): void {
    this.messageHandler = null;
    this.renderer.destroy();
  }
}
