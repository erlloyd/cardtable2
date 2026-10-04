import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { RenderMode, type IRendererAdapter } from './IRendererAdapter';

/**
 * Adapter for worker-based rendering mode.
 *
 * This adapter wraps the Web Worker and provides the unified IRendererAdapter
 * interface. Messages are sent via postMessage and received via worker.onmessage.
 * The worker is spawned by connect() and terminated by disconnect().
 */
export class WorkerRendererAdapter implements IRendererAdapter {
  readonly mode = RenderMode.Worker;

  private worker: Worker | null = null;
  private messageHandler: ((message: RendererToMainMessage) => void) | null =
    null;

  connect(): void {
    const worker = new Worker(new URL('../board.worker.ts', import.meta.url), {
      type: 'module',
    });

    // Set up message forwarding
    worker.addEventListener(
      'message',
      (event: MessageEvent<RendererToMainMessage>) => {
        if (this.messageHandler) {
          this.messageHandler(event.data);
        }
      },
    );

    // Set up error forwarding
    worker.addEventListener('error', (error) => {
      if (this.messageHandler) {
        this.messageHandler({
          type: 'error',
          error: error.message,
          context: 'worker',
        });
      }
    });

    this.worker = worker;
  }

  sendMessage(message: MainToRendererMessage): void {
    if (!this.worker) {
      throw new Error('WorkerRendererAdapter: sendMessage while disconnected');
    }
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

  disconnect(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
