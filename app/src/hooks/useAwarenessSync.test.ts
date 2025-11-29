import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAwarenessSync } from './useAwarenessSync';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore } from '../store/YjsStore';
import type { AwarenessState } from '@cardtable2/shared';

describe('useAwarenessSync', () => {
  let mockRenderer: IRendererAdapter;
  let mockStore: Partial<YjsStore> & {
    onAwarenessChange: Mock;
    getDoc: Mock;
  };
  let awarenessCallback: (states: Map<number, AwarenessState>) => void;

  beforeEach(() => {
    mockRenderer = {
      sendMessage: vi.fn(),
      onMessage: vi.fn(),
      destroy: vi.fn(),
      mode: RenderMode.Worker,
    };

    awarenessCallback = vi.fn();

    mockStore = {
      onAwarenessChange: vi.fn(
        (callback: (states: Map<number, AwarenessState>) => void) => {
          awarenessCallback = callback;
          return vi.fn(); // unsubscribe
        },
      ),
      getDoc: vi.fn(
        () =>
          ({
            clientID: 123,
          }) as unknown as ReturnType<YjsStore['getDoc']>,
      ),
    };
  });

  it('does nothing when renderer is null', () => {
    renderHook(() =>
      useAwarenessSync(null, mockStore as unknown as YjsStore, true),
    );

    const onAwarenessChangeMock = mockStore.onAwarenessChange;
    expect(onAwarenessChangeMock).not.toHaveBeenCalled();
  });

  it('does nothing when not synced', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, false),
    );

    const onAwarenessChangeMock = mockStore.onAwarenessChange;
    expect(onAwarenessChangeMock).not.toHaveBeenCalled();
  });

  it('subscribes to awareness changes when synced', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const onAwarenessChangeMock = mockStore.onAwarenessChange;
    expect(onAwarenessChangeMock).toHaveBeenCalled();
  });

  it('filters out local client awareness', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const states = new Map<number, AwarenessState>([
      [123, { actorId: 'actor-123', cursor: { x: 10, y: 20 } }], // Local client
      [456, { actorId: 'actor-456', cursor: { x: 30, y: 40 } }], // Remote client
    ]);

    awarenessCallback(states);

    expect(mockRenderer.sendMessage as MockInstance).toHaveBeenCalledWith({
      type: 'awareness-update',
      states: [
        {
          clientId: 456,
          state: { actorId: 'actor-456', cursor: { x: 30, y: 40 } },
        },
      ],
    });
  });

  it('forwards remote awareness to renderer', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const states = new Map<number, AwarenessState>([
      [456, { actorId: 'actor-456', cursor: { x: 30, y: 40 } }],
      [789, { actorId: 'actor-789', cursor: { x: 50, y: 60 } }],
    ]);

    awarenessCallback(states);

    expect(mockRenderer.sendMessage as MockInstance).toHaveBeenCalledWith({
      type: 'awareness-update',
      states: [
        {
          clientId: 456,
          state: { actorId: 'actor-456', cursor: { x: 30, y: 40 } },
        },
        {
          clientId: 789,
          state: { actorId: 'actor-789', cursor: { x: 50, y: 60 } },
        },
      ],
    });
  });

  it('unsubscribes on cleanup', () => {
    const unsubscribeMock = vi.fn();
    mockStore.onAwarenessChange = vi.fn(() => unsubscribeMock);

    const { unmount } = renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
