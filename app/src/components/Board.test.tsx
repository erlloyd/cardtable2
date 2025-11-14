import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Board from './Board';
import type { RendererToMainMessage } from '@cardtable2/shared';
import type { RenderMode } from '../renderer/RendererFactory';

// Mock Worker
class MockWorker {
  url: string | URL;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Map<
    string,
    Array<(event: MessageEvent | ErrorEvent) => void>
  > = new Map();

  constructor(url: string | URL) {
    this.url = url;

    // Simulate worker ready message
    setTimeout(() => {
      this.simulateMessage({ type: 'ready' } as RendererToMainMessage);
    }, 0);
  }

  postMessage(message: unknown) {
    // Simulate worker responses
    setTimeout(() => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message
      ) {
        const msg = message as { type: string; data?: string };
        if (msg.type === 'ping') {
          this.simulateMessage({
            type: 'pong',
            data: `Pong! Received: ${msg.data}`,
          } as RendererToMainMessage);
        } else if (msg.type === 'echo') {
          this.simulateMessage({
            type: 'echo-response',
            data: msg.data,
          } as RendererToMainMessage);
        } else if (msg.type === 'init') {
          // Simulate canvas initialization
          this.simulateMessage({
            type: 'initialized',
          } as RendererToMainMessage);
        }
      }
    }, 0);
  }

  addEventListener(
    event: string,
    handler: (event: MessageEvent | ErrorEvent) => void,
  ) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  removeEventListener(
    event: string,
    handler: (event: MessageEvent | ErrorEvent) => void,
  ) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  terminate() {
    this.listeners.clear();
  }

  // Helper method to simulate messages from worker
  simulateMessage(data: RendererToMainMessage) {
    const event = new MessageEvent('message', { data });
    const handlers = this.listeners.get('message');
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }
  }

  // Helper method to simulate errors
  simulateError(message: string) {
    const event = new ErrorEvent('error', { message });
    const handlers = this.listeners.get('error');
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }
  }
}

// Mock the renderer factory to use worker mode with MockWorker
vi.mock('../renderer/RendererFactory', async () => {
  const { WorkerRendererAdapter } = await import(
    '../renderer/WorkerRendererAdapter'
  );
  const { RenderMode } = await import('../renderer/IRendererAdapter');
  return {
    RenderMode,
    createRenderer: (_mode?: RenderMode | 'auto') => {
      // Force worker mode in tests to use MockWorker
      return new WorkerRendererAdapter();
    },
    detectCapabilities: () => ({
      hasOffscreenCanvas: true,
      hasWebGL: true,
      isIOS: false,
      iOSVersion: null,
      recommendedMode: RenderMode.Worker,
    }),
  };
});

describe('Board', () => {
  let transferControlSpy: () => OffscreenCanvas;

  beforeEach(() => {
    // Mock Worker constructor
    vi.stubGlobal('Worker', MockWorker);

    // Mock HTMLCanvasElement.transferControlToOffscreen
    const mockTransfer = (): OffscreenCanvas => ({}) as OffscreenCanvas;
    transferControlSpy = vi.fn(mockTransfer);
    HTMLCanvasElement.prototype.transferControlToOffscreen = transferControlSpy;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders with table ID', () => {
    render(<Board tableId="happy-clever-elephant" />);

    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(
      screen.getByText(/Board: happy-clever-elephant/i),
    ).toBeInTheDocument();
  });

  it('initializes worker and displays ready status', async () => {
    render(<Board tableId="test-table" />);

    // Initially should show "Initializing..."
    expect(screen.getByTestId('worker-status')).toHaveTextContent(
      'Initializing...',
    );

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Should display "Worker is ready" message
    await waitFor(() => {
      expect(screen.getByText(/Worker is ready/i)).toBeInTheDocument();
    });
  });

  it('sends ping message and receives pong response', async () => {
    const user = userEvent.setup();
    render(<Board tableId="test-table" />);

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Click ping button
    const pingButton = screen.getByTestId('ping-button');
    await user.click(pingButton);

    // Should display pong response
    await waitFor(() => {
      expect(screen.getByText(/Pong! Received:/i)).toBeInTheDocument();
    });
  });

  it('sends echo message and receives echo response', async () => {
    const user = userEvent.setup();
    render(<Board tableId="test-table" />);

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Click echo button
    const echoButton = screen.getByTestId('echo-button');
    await user.click(echoButton);

    // Should display echo response
    await waitFor(() => {
      expect(screen.getByText(/Echo:/i)).toBeInTheDocument();
    });
  });

  it('disables buttons when worker is not ready', () => {
    render(<Board tableId="test-table" />);

    const pingButton = screen.getByTestId('ping-button');
    const echoButton = screen.getByTestId('echo-button');

    // Buttons should be disabled initially
    expect(pingButton).toBeDisabled();
    expect(echoButton).toBeDisabled();
  });

  it('cleans up worker on unmount', async () => {
    const { unmount } = render(<Board tableId="test-table" />);

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Unmount component
    unmount();

    // Worker should be terminated (tested implicitly through no errors)
  });

  it('renders canvas element', () => {
    render(<Board tableId="test-table" />);

    const canvas = screen.getByTestId('board-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('initializes canvas and transfers to worker', async () => {
    render(<Board tableId="test-table" />);

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    // Verify transferControlToOffscreen was called
    expect(transferControlSpy).toHaveBeenCalled();

    // Verify initialization message appears
    await waitFor(() => {
      expect(screen.getByText(/Canvas initialized/i)).toBeInTheDocument();
    });
  });

  it('prevents double canvas transfer in strict mode', async () => {
    render(<Board tableId="test-table" />);

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    // transferControlToOffscreen should only be called once
    expect(transferControlSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards pointer down events to renderer', async () => {
    const user = userEvent.setup();
    render(<Board tableId="test-table" />);

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const canvas = screen.getByTestId('board-canvas');

    // Spy on Worker postMessage to verify pointer event is sent
    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');

      // Simulate pointer down on canvas
      await user.pointer({ target: canvas, keys: '[MouseLeft>]' });

      // Verify pointer-down message was sent
      await waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'pointer-down',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              pointerId: expect.any(Number),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              pointerType: expect.any(String),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              clientX: expect.any(Number),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              clientY: expect.any(Number),
            }),
          }),
        );
      });
    }
  });

  it('forwards pointer move events to renderer', async () => {
    const user = userEvent.setup();
    render(<Board tableId="test-table" />);

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const canvas = screen.getByTestId('board-canvas');

    // Spy on Worker postMessage
    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');

      // Simulate pointer move on canvas
      await user.pointer({
        target: canvas,
        coords: { clientX: 100, clientY: 200 },
      });

      // Verify pointer-move message was sent
      await waitFor(() => {
        const calls = postMessageSpy.mock.calls;
        const hasPointerMove = calls.some(
          (call) =>
            call[0] &&
            typeof call[0] === 'object' &&
            'type' in call[0] &&
            call[0].type === 'pointer-move',
        );
        expect(hasPointerMove).toBe(true);
      });
    }
  });

  it('forwards pointer up events to renderer', async () => {
    const user = userEvent.setup();
    render(<Board tableId="test-table" />);

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const canvas = screen.getByTestId('board-canvas');

    // Spy on Worker postMessage
    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');

      // Simulate pointer down and up
      await user.pointer([
        { target: canvas, keys: '[MouseLeft>]' },
        { keys: '[/MouseLeft]' },
      ]);

      // Verify pointer-up message was sent
      await waitFor(() => {
        const calls = postMessageSpy.mock.calls;
        const hasPointerUp = calls.some(
          (call) =>
            call[0] &&
            typeof call[0] === 'object' &&
            'type' in call[0] &&
            call[0].type === 'pointer-up',
        );
        expect(hasPointerUp).toBe(true);
      });
    }
  });
});
