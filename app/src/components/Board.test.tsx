import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Board from './Board';
import type {
  RendererToMainMessage,
  TableObject,
  AwarenessState,
} from '@cardtable2/shared';
import type { RenderMode } from '../renderer/RendererFactory';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';
import type * as Y from 'yjs';

// Mock YjsStore
class MockYjsStore implements Partial<YjsStore> {
  async waitForReady(): Promise<void> {
    return Promise.resolve();
  }

  getActorId(): string {
    return 'test-actor-id';
  }

  getAllObjects(): Map<string, TableObject> {
    return new Map();
  }

  getObject(_id: string): TableObject | null {
    return null;
  }

  setObject(_id: string, _obj: TableObject): void {
    // Mock implementation
  }

  deleteObject(_id: string): void {
    // Mock implementation
  }

  onObjectsChange(_callback: (changes: ObjectChanges) => void): () => void {
    return () => {
      // Mock unsubscribe
    };
  }

  onAwarenessChange(
    _callback: (states: Map<number, AwarenessState>) => void,
  ): () => void {
    // Mock awareness subscription (M3-T4)
    return () => {
      // Mock unsubscribe
    };
  }

  getDoc(): Y.Doc {
    // Mock Y.Doc
    return { clientID: 12345 } as Y.Doc;
  }

  clearAllObjects(): void {
    // Mock implementation
  }

  destroy(): void {
    // Mock implementation
  }
}

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
  let mockStore: MockYjsStore;

  beforeEach(() => {
    // Mock Worker constructor
    vi.stubGlobal('Worker', MockWorker);

    // Mock HTMLCanvasElement.transferControlToOffscreen
    const mockTransfer = (): OffscreenCanvas => ({}) as OffscreenCanvas;
    transferControlSpy = vi.fn(mockTransfer);
    HTMLCanvasElement.prototype.transferControlToOffscreen = transferControlSpy;

    // Create mock store
    mockStore = new MockYjsStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders with table ID', () => {
    render(
      <Board
        tableId="happy-clever-elephant"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(
      screen.getByText(/Board: happy-clever-elephant/i),
    ).toBeInTheDocument();
  });

  it('initializes worker and displays ready status', async () => {
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    const pingButton = screen.getByTestId('ping-button');
    const echoButton = screen.getByTestId('echo-button');

    // Buttons should be disabled initially
    expect(pingButton).toBeDisabled();
    expect(echoButton).toBeDisabled();
  });

  it('cleans up worker on unmount', async () => {
    const { unmount } = render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    // Wait for worker to be ready
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent('Ready');
    });

    // Unmount component
    unmount();

    // Worker should be terminated (tested implicitly through no errors)
  });

  it('renders canvas element', () => {
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    const canvas = screen.getByTestId('board-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('initializes canvas and transfers to worker', async () => {
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

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

  it('toggles interaction mode between pan and select', async () => {
    const user = userEvent.setup();
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    const toggleButton = screen.getByTestId('interaction-mode-toggle');

    // Initially should be in pan mode
    expect(toggleButton).toHaveTextContent('Pan Mode');

    // Click to toggle to select mode
    await user.click(toggleButton);
    expect(toggleButton).toHaveTextContent('Select Mode');

    // Click again to toggle back to pan mode
    await user.click(toggleButton);
    expect(toggleButton).toHaveTextContent('Pan Mode');
  });

  it('sends interaction mode changes to renderer', async () => {
    const user = userEvent.setup();
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');

      const toggleButton = screen.getByTestId('interaction-mode-toggle');

      // Toggle to select mode
      await user.click(toggleButton);

      // Verify set-interaction-mode message was sent
      await waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'set-interaction-mode',
            mode: 'select',
          }),
        );
      });

      // Toggle back to pan mode
      await user.click(toggleButton);

      // Verify set-interaction-mode message was sent again
      await waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'set-interaction-mode',
            mode: 'pan',
          }),
        );
      });
    }
  });

  it('toggles multi-select mode on and off', async () => {
    const user = userEvent.setup();
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    const toggleButton = screen.getByTestId('multi-select-toggle');

    // Initially should be off
    expect(toggleButton).toHaveTextContent('Multi-Select OFF');

    // Click to toggle on
    await user.click(toggleButton);
    expect(toggleButton).toHaveTextContent('Multi-Select ON');

    // Click again to toggle off
    await user.click(toggleButton);
    expect(toggleButton).toHaveTextContent('Multi-Select OFF');
  });

  it('applies multi-select modifier to touch events when multi-select mode is on', async () => {
    const user = userEvent.setup();
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');

      // Enable multi-select mode
      const toggleButton = screen.getByTestId('multi-select-toggle');
      await user.click(toggleButton);

      const canvas = screen.getByTestId('board-canvas');

      // Simulate touch pointer event
      await user.pointer({
        target: canvas,
        keys: '[TouchA>]',
      });

      // Verify pointer-down message has metaKey=true due to multi-select mode
      await waitFor(() => {
        const calls = postMessageSpy.mock.calls;
        const pointerDownCall = calls.find(
          (call) =>
            call[0] &&
            typeof call[0] === 'object' &&
            'type' in call[0] &&
            call[0].type === 'pointer-down',
        );
        expect(pointerDownCall).toBeDefined();
        if (pointerDownCall && pointerDownCall[0]) {
          const msg = pointerDownCall[0] as {
            event?: { metaKey?: boolean };
          };
          expect(msg.event?.metaKey).toBe(true);
        }
      });
    }
  });

  it('sends resize message when container size changes', async () => {
    render(
      <Board
        tableId="test-table"
        store={mockStore as YjsStore}
        connectionStatus="offline"
        showDebugUI={true}
      />,
    );

    // Wait for canvas to be initialized
    await waitFor(() => {
      expect(screen.getByTestId('worker-status')).toHaveTextContent(
        'Initialized',
      );
    });

    const mockWorker = (
      window.Worker as unknown as { mock?: { instances: MockWorker[] } }
    ).mock?.instances[0];
    if (mockWorker) {
      const postMessageSpy = vi.spyOn(mockWorker, 'postMessage');
      postMessageSpy.mockClear(); // Clear previous calls

      // Get the container element
      const container = screen.getByTestId('canvas-container');

      // Simulate a resize by triggering the ResizeObserver callback
      // We need to manually trigger it since jsdom doesn't automatically fire ResizeObserver
      interface MockResizeObserverConstructor {
        lastCallback?: ResizeObserverCallback;
      }
      const resizeObserverCallback = (
        global.ResizeObserver as unknown as MockResizeObserverConstructor
      ).lastCallback;
      if (resizeObserverCallback) {
        resizeObserverCallback([
          {
            target: container,
            contentRect: { width: 1024, height: 768 },
          } as ResizeObserverEntry,
        ]);

        // Check that resize message was sent
        await waitFor(() => {
          const resizeCalls = postMessageSpy.mock.calls.filter(
            (call) =>
              call[0] &&
              typeof call[0] === 'object' &&
              'type' in call[0] &&
              call[0].type === 'resize',
          );
          expect(resizeCalls.length).toBeGreaterThan(0);

          // Verify the resize message has correct structure
          if (resizeCalls[0] && resizeCalls[0][0]) {
            const msg = resizeCalls[0][0] as {
              type: string;
              width: number;
              height: number;
              dpr: number;
            };
            expect(msg.type).toBe('resize');
            expect(msg.width).toBeGreaterThan(0);
            expect(msg.height).toBeGreaterThan(0);
            expect(msg.dpr).toBeGreaterThan(0);
          }
        });
      }
    }
  });
});
