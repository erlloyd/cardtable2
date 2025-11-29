import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAwarenessSync } from './useAwarenessSync';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore } from '../store/YjsStore';
import type { AwarenessState } from '@cardtable2/shared';

describe('useAwarenessSync', () => {
  let mockRenderer: IRendererAdapter;
  let mockStore: Partial<YjsStore>;
  let awarenessCallback: (states: Map<number, AwarenessState>) => void;
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let onMessageMock: ReturnType<typeof vi.fn>;
  let destroyMock: ReturnType<typeof vi.fn>;
  let onAwarenessChangeMock: ReturnType<typeof vi.fn>;
  let getDocMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    onMessageMock = vi.fn();
    destroyMock = vi.fn();

    awarenessCallback = vi.fn();

    onAwarenessChangeMock = vi.fn(
      (callback: (states: Map<number, AwarenessState>) => void) => {
        awarenessCallback = callback;
        return vi.fn(); // unsubscribe
      },
    );

    getDocMock = vi.fn(
      () =>
        ({
          clientID: 123,
        }) as unknown as ReturnType<YjsStore['getDoc']>,
    );

    mockRenderer = {
      sendMessage: sendMessageMock,
      onMessage: onMessageMock,
      destroy: destroyMock,
      mode: RenderMode.Worker,
    };

    mockStore = {
      onAwarenessChange: onAwarenessChangeMock,
      getDoc: getDocMock,
    };
  });

  it('does nothing when renderer is null', () => {
    renderHook(() =>
      useAwarenessSync(null, mockStore as unknown as YjsStore, true),
    );

    expect(mockStore.onAwarenessChange).not.toHaveBeenCalled();
  });

  it('does nothing when not synced', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, false),
    );

    expect(mockStore.onAwarenessChange).not.toHaveBeenCalled();
  });

  it('subscribes to awareness changes when synced', () => {
    renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    expect(mockStore.onAwarenessChange).toHaveBeenCalled();
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

    expect(sendMessageMock).toHaveBeenCalledWith({
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

    expect(sendMessageMock).toHaveBeenCalledWith({
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
    onAwarenessChangeMock = vi.fn(() => unsubscribeMock);
    mockStore.onAwarenessChange = onAwarenessChangeMock;

    const { unmount } = renderHook(() =>
      useAwarenessSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
