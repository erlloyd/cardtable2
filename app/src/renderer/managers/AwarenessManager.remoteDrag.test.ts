/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { AwarenessManager } from './AwarenessManager';
import type { AwarenessState } from '@cardtable2/shared';

describe('AwarenessManager - Remote Drag Detection', () => {
  let awarenessManager: AwarenessManager;
  let parentContainer: Container;

  beforeEach(() => {
    awarenessManager = new AwarenessManager();
    parentContainer = new Container();
    awarenessManager.initialize(parentContainer);
  });

  describe('isObjectRemotelyDragged', () => {
    it('should return false when no remote awareness states exist', () => {
      const objectId = 'stack-1';

      expect(awarenessManager.isObjectRemotelyDragged(objectId)).toBe(false);
    });

    it('should return false when object is not being dragged by any remote user', () => {
      const objectId = 'stack-1';

      // Manually add awareness data for remote user (not dragging target object)
      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        cursor: { x: 100, y: 100 },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(objectId)).toBe(false);
    });

    it('should return true when object is primary drag target for remote user', () => {
      const objectId = 'stack-1';

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId: objectId,
          pos: { x: 100, y: 200, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(objectId)).toBe(true);
    });

    it('should return true when object is in secondary offsets for remote user', () => {
      const primaryId = 'stack-1';
      const secondaryId = 'stack-2';

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId,
          pos: { x: 100, y: 200, r: 0 },
          secondaryOffsets: {
            [secondaryId]: { dx: 50, dy: 50, dr: 0 },
          },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(secondaryId)).toBe(true);
    });

    it('should return false for primary when checking secondary ID', () => {
      const primaryId = 'stack-1';
      const secondaryId = 'stack-2';

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId,
          pos: { x: 100, y: 200, r: 0 },
          secondaryOffsets: {
            [secondaryId]: { dx: 50, dy: 50, dr: 0 },
          },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      // Primary should be detected
      expect(awarenessManager.isObjectRemotelyDragged(primaryId)).toBe(true);
      // Secondary should be detected
      expect(awarenessManager.isObjectRemotelyDragged(secondaryId)).toBe(true);
      // Unrelated object should not be detected
      expect(awarenessManager.isObjectRemotelyDragged('stack-3')).toBe(false);
    });

    it('should handle multiple remote users dragging different objects', () => {
      const obj1 = 'stack-1';
      const obj2 = 'stack-2';
      const obj3 = 'stack-3';

      // Remote user 1 dragging obj1
      const remoteState1: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-1',
          primaryId: obj1,
          pos: { x: 100, y: 200, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState1,
        lastUpdate: Date.now(),
      });

      // Remote user 2 dragging obj2
      const remoteState2: AwarenessState = {
        actorId: 'remote-actor-2',
        drag: {
          gid: 'gesture-2',
          primaryId: obj2,
          pos: { x: 300, y: 400, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(67890, {
        state: remoteState2,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(obj1)).toBe(true);
      expect(awarenessManager.isObjectRemotelyDragged(obj2)).toBe(true);
      expect(awarenessManager.isObjectRemotelyDragged(obj3)).toBe(false);
    });

    it('should handle multi-object drag with multiple secondaries', () => {
      const primaryId = 'stack-1';
      const secondaries = ['stack-2', 'stack-3', 'stack-4'];

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId,
          pos: { x: 100, y: 200, r: 0 },
          secondaryOffsets: {
            [secondaries[0]]: { dx: 50, dy: 50, dr: 0 },
            [secondaries[1]]: { dx: 100, dy: 100, dr: 0 },
            [secondaries[2]]: { dx: 150, dy: 150, dr: 0 },
          },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(primaryId)).toBe(true);
      secondaries.forEach((id) => {
        expect(awarenessManager.isObjectRemotelyDragged(id)).toBe(true);
      });
    });

    it('should return false when drag state exists but object is not in it', () => {
      const draggedId = 'stack-1';
      const otherIds = ['stack-2', 'stack-3'];

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId: draggedId,
          pos: { x: 100, y: 200, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      otherIds.forEach((id) => {
        expect(awarenessManager.isObjectRemotelyDragged(id)).toBe(false);
      });
    });

    it('should handle drag state without secondaryOffsets', () => {
      const objectId = 'stack-1';

      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId: objectId,
          pos: { x: 100, y: 200, r: 0 },
          // No secondaryOffsets
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(objectId)).toBe(true);
    });

    it('should handle incomplete drag state gracefully', () => {
      const objectId = 'stack-1';

      // Edge case: drag state missing primaryId (should be filtered out earlier, but test defensive code)
      const remoteState: AwarenessState = {
        actorId: 'remote-actor-1',
        drag: {
          gid: 'gesture-123',
          primaryId: undefined as any, // Invalid state
          pos: { x: 100, y: 200, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(12345, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      expect(awarenessManager.isObjectRemotelyDragged(objectId)).toBe(false);
    });
  });

  describe('Integration scenario: Unstack operation', () => {
    it('should detect newly created stack being dragged immediately', () => {
      const newStackId = 'stack-new-123';
      const sourceStackId = 'stack-source';

      // Simulate: Host unstacks and starts dragging new stack
      // Remote client receives awareness update first, then object-added
      const remoteState: AwarenessState = {
        actorId: 'host-actor',
        drag: {
          gid: 'unstack-gesture',
          primaryId: newStackId,
          pos: { x: 500, y: 600, r: 0 },
          ts: Date.now(),
        },
      };
      (awarenessManager as any).remoteAwareness.set(99999, {
        state: remoteState,
        lastUpdate: Date.now(),
      });

      // Check: Should detect new stack is being dragged before it's rendered
      expect(awarenessManager.isObjectRemotelyDragged(newStackId)).toBe(true);

      // Source stack should not be detected as dragged
      expect(awarenessManager.isObjectRemotelyDragged(sourceStackId)).toBe(
        false,
      );
    });
  });
});
