import { describe, it, expect } from 'vitest';
import {
  snapToGrid,
  snapMultipleToGrid,
  GRID_SIZE,
  GRID_ORIGIN,
} from './gridSnap';

describe('snapToGrid', () => {
  describe('when grid snapping is disabled', () => {
    it('returns the original position unchanged', () => {
      const pos = { x: 123.456, y: 789.012 };
      const result = snapToGrid(pos, false);
      expect(result).toEqual(pos);
    });

    it('does not modify the original position object', () => {
      const pos = { x: 50, y: 75 };
      const result = snapToGrid(pos, false);
      expect(result).toBe(pos);
    });
  });

  describe('when grid snapping is enabled', () => {
    it('snaps to origin when position is at origin', () => {
      const pos = { x: 0, y: 0 };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_ORIGIN.x, y: GRID_ORIGIN.y });
    });

    it('snaps to nearest grid point for positive coordinates', () => {
      const pos = { x: 70, y: 70 };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_SIZE, y: GRID_SIZE });
    });

    it('snaps to nearest grid point for negative coordinates', () => {
      const pos = { x: -70, y: -70 };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: -GRID_SIZE, y: -GRID_SIZE });
    });

    it('snaps to nearest grid point when exactly halfway between grid points', () => {
      const halfGrid = GRID_SIZE / 2;
      const pos = { x: halfGrid, y: halfGrid };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_SIZE, y: GRID_SIZE });
    });

    it('snaps to grid point below when closer', () => {
      const justBelow = GRID_SIZE / 2 - 1;
      const pos = { x: justBelow, y: justBelow };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('snaps to grid point above when closer', () => {
      const justAbove = GRID_SIZE / 2 + 1;
      const pos = { x: justAbove, y: justAbove };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_SIZE, y: GRID_SIZE });
    });

    it('handles large positive coordinates', () => {
      const pos = { x: 1000, y: 2000 };
      const result = snapToGrid(pos, true);
      const expectedX = Math.round(1000 / GRID_SIZE) * GRID_SIZE;
      const expectedY = Math.round(2000 / GRID_SIZE) * GRID_SIZE;
      expect(result).toEqual({ x: expectedX, y: expectedY });
    });

    it('handles large negative coordinates', () => {
      const pos = { x: -1000, y: -2000 };
      const result = snapToGrid(pos, true);
      const expectedX = Math.round(-1000 / GRID_SIZE) * GRID_SIZE;
      const expectedY = Math.round(-2000 / GRID_SIZE) * GRID_SIZE;
      expect(result).toEqual({ x: expectedX, y: expectedY });
    });

    it('handles mixed positive and negative coordinates', () => {
      const pos = { x: 200, y: -200 };
      const result = snapToGrid(pos, true);
      const expectedX = Math.round(200 / GRID_SIZE) * GRID_SIZE;
      const expectedY = Math.round(-200 / GRID_SIZE) * GRID_SIZE;
      expect(result).toEqual({ x: expectedX, y: expectedY });
    });

    it('snaps independently in x and y directions', () => {
      const pos = { x: GRID_SIZE, y: GRID_SIZE * 2 };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_SIZE, y: GRID_SIZE * 2 });
    });

    it('returns exact grid points unchanged', () => {
      const pos = { x: GRID_SIZE * 2, y: GRID_SIZE * 3 };
      const result = snapToGrid(pos, true);
      expect(result).toEqual({ x: GRID_SIZE * 2, y: GRID_SIZE * 3 });
    });
  });

  describe('grid constants', () => {
    it('GRID_SIZE is defined', () => {
      expect(GRID_SIZE).toBeDefined();
      expect(typeof GRID_SIZE).toBe('number');
      expect(GRID_SIZE).toBeGreaterThan(0);
    });

    it('GRID_ORIGIN is at origin', () => {
      expect(GRID_ORIGIN).toEqual({ x: 0, y: 0 });
    });
  });

  describe('exhausted card clearance', () => {
    it('provides spacing for exhausted cards', () => {
      const CARD_HEIGHT = 88;

      const card1Pos = { x: 0, y: 0 };
      const card2Pos = { x: GRID_SIZE, y: 0 };

      const gap = GRID_SIZE - CARD_HEIGHT;
      expect(gap).toBeGreaterThanOrEqual(0);

      const card1RightEdge = card1Pos.x + CARD_HEIGHT / 2;
      const card2LeftEdge = card2Pos.x - CARD_HEIGHT / 2;
      expect(card2LeftEdge).toBeGreaterThanOrEqual(card1RightEdge);
    });
  });
});

describe('snapMultipleToGrid', () => {
  describe('when grid snapping is disabled', () => {
    it('returns original positions for all objects', () => {
      const objects = [
        { id: 'obj1', pos: { x: 25, y: 35, r: 0 } },
        { id: 'obj2', pos: { x: 75, y: 85, r: 90 } },
      ];

      const result = snapMultipleToGrid(objects, false);

      expect(result.size).toBe(2);
      expect(result.get('obj1')).toEqual({ x: 25, y: 35, r: 0 });
      expect(result.get('obj2')).toEqual({ x: 75, y: 85, r: 90 });
    });
  });

  describe('when grid snapping is enabled', () => {
    it('handles empty object array', () => {
      const result = snapMultipleToGrid([], true);
      expect(result.size).toBe(0);
    });

    it('snaps single object to nearest grid point', () => {
      const objects = [{ id: 'obj1', pos: { x: 70, y: 70, r: 0 } }];

      const result = snapMultipleToGrid(objects, true);

      expect(result.size).toBe(1);
      expect(result.get('obj1')).toEqual({ x: 100, y: 100, r: 0 });
    });

    it('preserves rotation values', () => {
      const objects = [
        { id: 'obj1', pos: { x: 70, y: 70, r: 45 } },
        { id: 'obj2', pos: { x: 170, y: 170, r: 90 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      expect(result.get('obj1')?.r).toBe(45);
      expect(result.get('obj2')?.r).toBe(90);
    });

    it('assigns unique grid points when objects would collide', () => {
      // Two objects both close to (100, 100)
      const objects = [
        { id: 'obj1', pos: { x: 90, y: 90, r: 0 } },
        { id: 'obj2', pos: { x: 110, y: 110, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      expect(result.size).toBe(2);

      const pos1 = result.get('obj1')!;
      const pos2 = result.get('obj2')!;

      // Both should snap to grid points
      expect(pos1.x % GRID_SIZE).toBe(0);
      expect(pos1.y % GRID_SIZE).toBe(0);
      expect(pos2.x % GRID_SIZE).toBe(0);
      expect(pos2.y % GRID_SIZE).toBe(0);

      // But they should be at different points
      expect(pos1.x !== pos2.x || pos1.y !== pos2.y).toBe(true);
    });

    it('handles three objects all snapping to same point', () => {
      // Three objects all close to (0, 0)
      const objects = [
        { id: 'obj1', pos: { x: 10, y: 10, r: 0 } },
        { id: 'obj2', pos: { x: -10, y: 10, r: 0 } },
        { id: 'obj3', pos: { x: 10, y: -10, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      expect(result.size).toBe(3);

      const positions = [
        result.get('obj1')!,
        result.get('obj2')!,
        result.get('obj3')!,
      ];

      // All should be on grid points (handle both +0 and -0)
      positions.forEach((pos) => {
        expect(Math.abs(pos.x % GRID_SIZE)).toBe(0);
        expect(Math.abs(pos.y % GRID_SIZE)).toBe(0);
      });

      // All should be at unique positions
      const posKeys = positions.map((p) => `${p.x},${p.y}`);
      const uniqueKeys = new Set(posKeys);
      expect(uniqueKeys.size).toBe(3);
    });

    it('keeps objects at unique grid points even when very close', () => {
      // Two objects 20px apart, both will snap to same grid point without collision detection
      const objects = [
        { id: 'obj1', pos: { x: 90, y: 0, r: 0 } },
        { id: 'obj2', pos: { x: 110, y: 0, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      const pos1 = result.get('obj1')!;
      const pos2 = result.get('obj2')!;

      // First object gets ideal snap point
      expect(pos1).toEqual({ x: 100, y: 0, r: 0 });

      // Second object gets moved to nearby free point
      expect(pos2.x !== pos1.x || pos2.y !== pos1.y).toBe(true);
    });

    it('processes objects in order - first gets ideal position', () => {
      // Both snap to (100, 100) without collision detection
      const objects = [
        { id: 'first', pos: { x: 95, y: 95, r: 0 } },
        { id: 'second', pos: { x: 105, y: 105, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      // First object should get the ideal position (100, 100)
      expect(result.get('first')).toEqual({ x: 100, y: 100, r: 0 });

      // Second object should be moved to nearby point
      const pos2 = result.get('second')!;
      expect(pos2.x !== 100 || pos2.y !== 100).toBe(true);
    });

    it('handles objects already on grid with no collision', () => {
      const objects = [
        { id: 'obj1', pos: { x: 0, y: 0, r: 0 } },
        { id: 'obj2', pos: { x: 100, y: 0, r: 0 } },
        { id: 'obj3', pos: { x: 0, y: 100, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      // All should stay at their original positions
      expect(result.get('obj1')).toEqual({ x: 0, y: 0, r: 0 });
      expect(result.get('obj2')).toEqual({ x: 100, y: 0, r: 0 });
      expect(result.get('obj3')).toEqual({ x: 0, y: 100, r: 0 });
    });

    it('finds nearest free point using spiral search', () => {
      // Place first object at (100, 100), second very close
      const objects = [
        { id: 'obj1', pos: { x: 100, y: 100, r: 0 } },
        { id: 'obj2', pos: { x: 101, y: 101, r: 0 } },
      ];

      const result = snapMultipleToGrid(objects, true);

      const pos1 = result.get('obj1')!;
      const pos2 = result.get('obj2')!;

      // First gets (100, 100)
      expect(pos1).toEqual({ x: 100, y: 100, r: 0 });

      // Second should be at an adjacent grid point
      const dx = Math.abs(pos2.x - pos1.x);
      const dy = Math.abs(pos2.y - pos1.y);
      const manhattanDistance = dx / GRID_SIZE + dy / GRID_SIZE;

      // Should be 1 grid cell away (Manhattan distance = 1)
      expect(manhattanDistance).toBe(1);
    });
  });
});
