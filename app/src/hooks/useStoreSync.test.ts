import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStoreSync } from './useStoreSync';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';
import * as Y from 'yjs';
import type { TableObjectYMap } from '../store/types';

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

    expect(mockStore.onObjectsChange).not.toHaveBeenCalled();
  });

  it('does nothing when not synced', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, false),
    );

    expect(mockStore.onObjectsChange).not.toHaveBeenCalled();
  });

  it('subscribes to store changes when synced', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    expect(mockStore.onObjectsChange).toHaveBeenCalled();
  });

  it('forwards added objects to renderer', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    // Create Y.Map for test (M3.6-T5)
    // Y.Map must be in a Y.Doc for .toJSON() to work
    const doc = new Y.Doc();
    const yMap = new Y.Map() as TableObjectYMap;
    doc.getMap('test').set('obj1', yMap);
    yMap.set('_kind', 'stack' as never);

    const changes: ObjectChanges = {
      added: [
        {
          id: 'obj1',
          yMap,
        },
      ],
      updated: [],
      removed: [],
    };

    changeCallback(changes);

    // useStoreSync converts Y.Map to plain object via .toJSON()
    expect(
      mockRenderer.sendMessage as unknown as MockInstance,
    ).toHaveBeenCalledWith({
      type: 'objects-added',
      objects: [{ id: 'obj1', obj: { _kind: 'stack' } }],
    });
  });

  it('forwards updated objects to renderer', () => {
    renderHook(() =>
      useStoreSync(mockRenderer, mockStore as unknown as YjsStore, true),
    );

    // Create Y.Map for test (M3.6-T5)
    // Y.Map must be in a Y.Doc for .toJSON() to work
    const doc = new Y.Doc();
    const yMap = new Y.Map() as TableObjectYMap;
    doc.getMap('test').set('obj1', yMap);
    yMap.set('_kind', 'stack' as never);

    const changes: ObjectChanges = {
      added: [],
      updated: [
        {
          id: 'obj1',
          yMap,
        },
      ],
      removed: [],
    };

    changeCallback(changes);

    // useStoreSync converts Y.Map to plain object via .toJSON()
    expect(
      mockRenderer.sendMessage as unknown as MockInstance,
    ).toHaveBeenCalledWith({
      type: 'objects-updated',
      objects: [{ id: 'obj1', obj: { _kind: 'stack' } }],
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

    expect(
      mockRenderer.sendMessage as unknown as MockInstance,
    ).toHaveBeenCalledWith({
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
