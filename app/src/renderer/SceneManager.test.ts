import { describe, it, expect, beforeEach } from 'vitest';
import { SceneManager } from './SceneManager';
import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';

describe('SceneManager', () => {
  let sceneManager: SceneManager;

  beforeEach(() => {
    sceneManager = new SceneManager();
  });

  describe('addObject', () => {
    it('adds an object to the scene', () => {
      const obj: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 200, r: 0 },
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('test-1', obj);

      expect(sceneManager.getObject('test-1')).toBe(obj);
      expect(sceneManager.getAllObjects().size).toBe(1);
    });
  });

  describe('removeObject', () => {
    it('removes an object from the scene', () => {
      const obj: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 200, r: 0 },
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('test-1', obj);
      sceneManager.removeObject('test-1');

      expect(sceneManager.getObject('test-1')).toBeUndefined();
      expect(sceneManager.getAllObjects().size).toBe(0);
    });
  });

  describe('updateObject', () => {
    it('updates an object position', () => {
      const obj: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 200, r: 0 },
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('test-1', obj);

      const updatedObj: TableObject = {
        ...obj,
        _pos: { x: 300, y: 400, r: 0 },
      };

      sceneManager.updateObject('test-1', updatedObj);

      const result = sceneManager.getObject('test-1');
      expect(result?._pos.x).toBe(300);
      expect(result?._pos.y).toBe(400);
    });
  });

  describe('hitTest', () => {
    beforeEach(() => {
      // Add test objects at different positions
      // Card size is 63x88 (portrait)
      const obj1: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 }, // Centered at origin
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      const obj2: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '0|b',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('card-1', obj1);
      sceneManager.addObject('card-2', obj2);
    });

    it('returns object when point is inside bounds', () => {
      // Test center of first card (0, 0)
      const result = sceneManager.hitTest(0, 0);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('card-1');
    });

    it('returns null when point is outside all objects', () => {
      const result = sceneManager.hitTest(500, 500);

      expect(result).toBeNull();
    });

    it('returns topmost object when objects overlap', () => {
      // Add overlapping object with higher sortKey
      const obj3: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 5, y: 5, r: 0 }, // Overlaps with card-1
        _sortKey: '0|c', // Higher than '0|a'
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('card-3', obj3);

      // Test point that overlaps both card-1 and card-3
      const result = sceneManager.hitTest(5, 5);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('card-3'); // Should return topmost (higher sortKey)
    });

    it('handles edge of bounding box correctly', () => {
      // Card is 63x88, so at position (0,0), bounds are:
      // minX: -31.5, maxX: 31.5, minY: -44, maxY: 44

      // Test just inside left edge
      const insideLeft = sceneManager.hitTest(-31, 0);
      expect(insideLeft?.id).toBe('card-1');

      // Test just outside left edge
      const outsideLeft = sceneManager.hitTest(-32, 0);
      expect(outsideLeft).toBeNull();
    });
  });

  describe('hitTestRect', () => {
    beforeEach(() => {
      const obj1: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      const obj2: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '0|b',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('card-1', obj1);
      sceneManager.addObject('card-2', obj2);
    });

    it('returns objects intersecting with rectangle', () => {
      // Rectangle that includes both objects
      const result = sceneManager.hitTestRect({
        minX: -50,
        minY: -50,
        maxX: 150,
        maxY: 150,
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id).sort()).toEqual(['card-1', 'card-2']);
    });

    it('returns only objects within rectangle', () => {
      // Rectangle that only includes first object
      const result = sceneManager.hitTestRect({
        minX: -50,
        minY: -50,
        maxX: 50,
        maxY: 50,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('card-1');
    });

    it('returns empty array when no objects intersect', () => {
      const result = sceneManager.hitTestRect({
        minX: 500,
        minY: 500,
        maxX: 600,
        maxY: 600,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all objects from the scene', () => {
      const obj1: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '0|a',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      const obj2: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '0|b',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      };

      sceneManager.addObject('card-1', obj1);
      sceneManager.addObject('card-2', obj2);

      sceneManager.clear();

      expect(sceneManager.getAllObjects().size).toBe(0);
      expect(sceneManager.hitTest(0, 0)).toBeNull();
    });
  });
});
