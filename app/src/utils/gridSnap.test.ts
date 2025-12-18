import { describe, it, expect } from 'vitest';
import { snapToGrid, GRID_SIZE, GRID_ORIGIN } from './gridSnap';

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
