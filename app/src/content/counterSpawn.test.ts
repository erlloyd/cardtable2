/**
 * Unit tests for the generic-counter spawn primitive (ct-73z).
 *
 * Scope: pure spawn-routing logic. `createObject` is spied so we can assert
 * the kind / typeId / position parameters without booting a real YjsStore.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectKind } from '@cardtable2/shared';
import { spawnGenericCounter } from './counterSpawn';
import * as YjsActions from '../store/YjsActions';
import type { YjsStore } from '../store/YjsStore';
import type { ViewportState } from '../utils/viewportPlacement';
import { COUNTER_TYPE_GENERIC } from '../renderer/objects/counter/constants';

function makeStore(): YjsStore {
  return {} as unknown as YjsStore;
}

const NEUTRAL_VIEWPORT: ViewportState = {
  cameraX: 0,
  cameraY: 0,
  cameraScale: 1,
  viewportWidth: 1000,
  viewportHeight: 800,
  devicePixelRatio: 1,
};

beforeEach(() => {
  vi.spyOn(YjsActions, 'createObject').mockReturnValue('counter-id');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spawnGenericCounter', () => {
  it('creates a Counter object with generic typeId', async () => {
    const store = makeStore();
    const id = await spawnGenericCounter({
      store,
      getViewportState: () => Promise.resolve(NEUTRAL_VIEWPORT),
    });

    expect(id).toBe('counter-id');
    expect(YjsActions.createObject).toHaveBeenCalledTimes(1);
    const call = vi.mocked(YjsActions.createObject).mock.calls[0];
    const options = call[1];
    expect(options.kind).toBe(ObjectKind.Counter);
    expect(options.meta).toEqual({
      type: COUNTER_TYPE_GENERIC,
      typeId: COUNTER_TYPE_GENERIC,
    });
  });

  it('positions the counter at viewport center (no jitter)', async () => {
    const store = makeStore();
    await spawnGenericCounter({
      store,
      getViewportState: () => Promise.resolve(NEUTRAL_VIEWPORT),
    });

    const call = vi.mocked(YjsActions.createObject).mock.calls[0];
    const options = call[1];
    // Viewport center for the neutral viewport: (1000/2, 800/2) = (500, 400)
    // No jitter, dpr=1, so canvas-pixel placement is identical.
    expect(options.pos).toEqual({ x: 500, y: 400, r: 0 });
  });

  it('scales placement by devicePixelRatio for canvas-pixel world space', async () => {
    const store = makeStore();
    await spawnGenericCounter({
      store,
      getViewportState: () =>
        Promise.resolve({
          ...NEUTRAL_VIEWPORT,
          devicePixelRatio: 2,
        }),
    });

    const call = vi.mocked(YjsActions.createObject).mock.calls[0];
    const options = call[1];
    // CSS center (500, 400) * dpr=2 -> (1000, 800) in canvas-pixel space.
    expect(options.pos).toEqual({ x: 1000, y: 800, r: 0 });
  });

  it('honors camera offset/zoom when computing viewport center', async () => {
    const store = makeStore();
    // Camera shifted (100,50), zoom 2x. Viewport-center world coord is:
    //   x = (viewportWidth/2 - cameraX) / cameraScale = (500 - 100) / 2 = 200
    //   y = (viewportHeight/2 - cameraY) / cameraScale = (400 - 50) / 2 = 175
    await spawnGenericCounter({
      store,
      getViewportState: () =>
        Promise.resolve({
          cameraX: 100,
          cameraY: 50,
          cameraScale: 2,
          viewportWidth: 1000,
          viewportHeight: 800,
          devicePixelRatio: 1,
        }),
    });

    const call = vi.mocked(YjsActions.createObject).mock.calls[0];
    const options = call[1];
    expect(options.pos).toEqual({ x: 200, y: 175, r: 0 });
  });

  it('returns null and logs when viewport-state read rejects', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const store = makeStore();
    const id = await spawnGenericCounter({
      store,
      getViewportState: () => Promise.reject(new Error('boom')),
    });

    expect(id).toBeNull();
    expect(YjsActions.createObject).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
