import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStoreSync } from './useStoreSync';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';
import type { TableObject } from '@cardtable2/shared';

describe('useStoreSync', () => {
  let mockRenderer: IRendererAdapter;
  let mockStore: Partial<YjsStore> & {
    onObjectsChange: Mock;
  };
  let changeCallback: (changes: ObjectChanges) => void;

  beforeEach(() => {
    mockRenderer = {
      sendMessage: vi.fn(),
      onMessage: vi.fn(),
      destroy: vi.fn(),
      mode: RenderMode.Worker,
    };

    changeCallback = vi.fn();

    mockStore = {
      onObjectsChange: vi.fn((callback: (changes: ObjectChanges) => void) => {
        changeCallback = callback;
        return vi.fn(); // unsubscribe
      }),
    };
  });

  it('does nothing when renderer is null', () => {
    renderHook(() =>
      useStoreSync(null, mockStore as unknown as YjsStore, true),
    );

    const onObjectsChangeMock = mockStore.onObjectsChange;
    expect(onObjectsChangeMock).not.toHaveBeenCalled();
  });

  it('does nothing when not synced', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, false),
    );

    const onObjectsChangeMock = mockStore.onObjectsChange;
    expect(onObjectsChangeMock).not.toHaveBeenCalled();
  });

  it('subscribes to store changes when synced', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const onObjectsChangeMock = mockStore.onObjectsChange;
    expect(onObjectsChangeMock).toHaveBeenCalled();
  });

  it('forwards added objects to renderer', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const changes: ObjectChanges = {
      added: [
        {
          id: 'obj1',
          obj: { _kind: 'stack' } as Partial<TableObject> as TableObject,
        },
      ],
      updated: [],
      removed: [],
    };

    changeCallback(changes);

    expect(mockRenderer.sendMessage as MockInstance).toHaveBeenCalledWith({
      type: 'objects-added',
      objects: changes.added,
    });
  });

  it('forwards updated objects to renderer', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const changes: ObjectChanges = {
      added: [],
      updated: [
        {
          id: 'obj1',
          obj: { _kind: 'stack' } as Partial<TableObject> as TableObject,
        },
      ],
      removed: [],
    };

    changeCallback(changes);

    expect(mockRenderer.sendMessage as MockInstance).toHaveBeenCalledWith({
      type: 'objects-updated',
      objects: changes.updated,
    });
  });

  it('forwards removed objects to renderer', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    const changes: ObjectChanges = {
      added: [],
      updated: [],
      removed: ['obj1', 'obj2'],
    };

    changeCallback(changes);

    expect(mockRenderer.sendMessage as MockInstance).toHaveBeenCalledWith({
      type: 'objects-removed',
      ids: changes.removed,
    });
  });

  it('unsubscribes on cleanup', () => {
    const unsubscribeMock = vi.fn();
    mockStore.onObjectsChange = vi.fn(() => unsubscribeMock);

    const { unmount } = renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
