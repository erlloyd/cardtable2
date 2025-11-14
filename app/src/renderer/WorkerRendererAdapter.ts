import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import type { IRendererAdapter } from './IRendererAdapter';

/**
 * Adapter for worker-based rendering mode.
 *
 * This adapter wraps the Web Worker and provides the unified IRendererAdapter
 * interface. Messages are sent via postMessage and received via worker.onmessage.
 */
export class WorkerRendererAdapter implements IRendererAdapter {
  private worker: Worker;
  private messageHandler: ((message: RendererToMainMessage) => void) | null =
    null;

  constructor() {
    // Create the worker
    this.worker = new Worker(new URL('../board.worker.ts', import.meta.url), {
      type: 'module',
    });

    // Set up message forwarding
    this.worker.addEventListener(
      'message',
      (event: MessageEvent<RendererToMainMessage>) => {
        if (this.messageHandler) {
          this.messageHandler(event.data);
        }
      },
    );

    // Set up error forwarding
    this.worker.addEventListener('error', (error) => {
      if (this.messageHandler) {
        this.messageHandler({
          type: 'error',
          error: error.message,
          context: 'worker',
        });
      }
    });
  }

  sendMessage(message: MainToRendererMessage): void {
    // For init messages with transferable canvas, use transfer list
    if (message.type === 'init' && 'canvas' in message) {
      this.worker.postMessage(message, [message.canvas]);
    } else {
      this.worker.postMessage(message);
    }
  }

  onMessage(handler: (message: RendererToMainMessage) => void): void {
    this.messageHandler = handler;
  }

  destroy(): void {
    this.messageHandler = null;
    this.worker.terminate();
  }
}
