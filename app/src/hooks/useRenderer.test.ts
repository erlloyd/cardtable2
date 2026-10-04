import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { useRenderer } from './useRenderer';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { RendererToMainMessage } from '@cardtable2/shared';

// Mock the renderer factory
vi.mock('../renderer/RendererFactory', () => ({
  createRenderer: vi.fn((mode) => {
    const messageHandlers: Array<(msg: RendererToMainMessage) => void> = [];
    const mockRenderer: IRendererAdapter & {
      _triggerMessage: (msg: RendererToMainMessage) => void;
    } = {
      mode:
        mode === 'auto'
          ? RenderMode.Worker
          : mode === RenderMode.Worker
            ? RenderMode.Worker
            : RenderMode.MainThread,
      sendMessage: vi.fn(),
      onMessage: vi.fn((handler: (msg: RendererToMainMessage) => void) => {
        messageHandlers.push(handler);
        return () => {
          const index = messageHandlers.indexOf(handler);
          if (index > -1) {
            messageHandlers.splice(index, 1);
          }
        };
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      // Helper to trigger messages
      _triggerMessage: (msg: RendererToMainMessage) => {
        messageHandlers.forEach((handler) => handler(msg));
      },
    };
    return mockRenderer;
  }),
}));

describe('useRenderer', () => {
  let originalSearch: string;

  beforeEach(() => {
    // Save original search
    originalSearch = window.location.search;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original search
    Object.defineProperty(window, 'location', {
      value: Object.assign({}, window.location, { search: originalSearch }),
      writable: true,
    });
  });

  it('creates renderer with auto mode by default', () => {
    const { result } = renderHook(() => useRenderer());

    expect(result.current.renderer).not.toBeNull();
    expect(result.current.renderMode).toBe(RenderMode.Worker); // auto resolves to Worker in mock
  });

  it('creates renderer with forced worker mode', () => {
    const { result } = renderHook(() => useRenderer(RenderMode.Worker));

    expect(result.current.renderer).not.toBeNull();
    expect(result.current.renderMode).toBe(RenderMode.Worker);
  });

  it('creates renderer with forced main-thread mode', () => {
    const { result } = renderHook(() => useRenderer(RenderMode.MainThread));

    expect(result.current.renderer).not.toBeNull();
    expect(result.current.renderMode).toBe(RenderMode.MainThread);
  });

  it('returns correct render mode', () => {
    const { result } = renderHook(() => useRenderer(RenderMode.MainThread));

    expect(result.current.renderMode).toBe(RenderMode.MainThread);
  });

  it('connects on mount and disconnects on unmount', () => {
    const { result, unmount } = renderHook(() => useRenderer());

    const renderer = result.current.renderer;
    expect(renderer.connect as unknown as MockInstance).toHaveBeenCalledTimes(
      1,
    );
    expect(
      renderer.disconnect as unknown as MockInstance,
    ).not.toHaveBeenCalled();

    unmount();

    expect(
      renderer.disconnect as unknown as MockInstance,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps the same renderer across re-renders', () => {
    const { result, rerender } = renderHook(() => useRenderer());

    const firstRenderer = result.current.renderer;
    rerender();

    expect(result.current.renderer).toBe(firstRenderer);
    expect(
      firstRenderer.connect as unknown as MockInstance,
    ).toHaveBeenCalledTimes(1);
  });

  it('connects, disconnects, then connects the same instance under StrictMode', () => {
    const { result } = renderHook(() => useRenderer(), {
      wrapper: StrictMode,
    });

    const renderer = result.current.renderer;
    const connect = renderer.connect as unknown as MockInstance;
    const disconnect = renderer.disconnect as unknown as MockInstance;

    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect.mock.invocationCallOrder[0]).toBeLessThan(
      disconnect.mock.invocationCallOrder[0],
    );
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      connect.mock.invocationCallOrder[1],
    );
  });

  // NOTE: isReady and isCanvasInitialized are now managed by Board component's
  // message handler (via BoardMessageBus), not by useRenderer hook.
  // Tests for these states are in Board.test.tsx
});
