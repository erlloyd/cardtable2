import { describe, it, expect } from 'vitest';
import { calculateRowLayout, type LayoutItem } from './componentSetLayout';

describe('calculateRowLayout', () => {
  const PADDING = 20; // horizontal padding between items
  const ROW_GAP = 30; // vertical gap between rows

  it('should position a single item at the origin', () => {
    const items: LayoutItem[] = [{ width: 100, height: 140 }];

    const positions = calculateRowLayout(items);

    expect(positions).toHaveLength(1);
    expect(positions[0].x).toBe(0);
    expect(positions[0].y).toBe(0);
  });

  it('should place items without row in row 0 (default)', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140 },
      { width: 100, height: 140 },
    ];

    const positions = calculateRowLayout(items);

    expect(positions).toHaveLength(2);
    // Both in row 0, side by side
    expect(positions[0].y).toBe(positions[1].y);
    expect(positions[1].x).toBeGreaterThan(positions[0].x);
  });

  it('should space items horizontally with padding', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140 },
      { width: 100, height: 140 },
    ];

    const positions = calculateRowLayout(items);

    // Second item starts after first item width + padding
    expect(positions[1].x - positions[0].x).toBe(100 + PADDING);
  });

  it('should place items in different rows vertically', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140, row: 0 },
      { width: 100, height: 140, row: 1 },
    ];

    const positions = calculateRowLayout(items);

    expect(positions[0].y).toBe(0);
    // Row 1 starts after row 0's tallest item + row gap
    expect(positions[1].y).toBe(140 + ROW_GAP);
  });

  it('should use tallest item in row for row height', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 100, row: 0 },
      { width: 100, height: 200, row: 0 }, // taller
      { width: 100, height: 100, row: 1 },
    ];

    const positions = calculateRowLayout(items);

    // Row 1 offset uses height of tallest item in row 0 (200) + gap
    expect(positions[2].y).toBe(200 + ROW_GAP);
  });

  it('should handle multiple items in multiple rows', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140, row: 0 },
      { width: 80, height: 140, row: 0 },
      { width: 100, height: 140, row: 1 },
      { width: 100, height: 140, row: 1 },
      { width: 100, height: 140, row: 1 },
    ];

    const positions = calculateRowLayout(items);

    // Row 0: 2 items
    expect(positions[0].y).toBe(0);
    expect(positions[1].y).toBe(0);
    expect(positions[1].x).toBe(100 + PADDING);

    // Row 1: 3 items
    const row1Y = 140 + ROW_GAP;
    expect(positions[2].y).toBe(row1Y);
    expect(positions[3].y).toBe(row1Y);
    expect(positions[4].y).toBe(row1Y);
  });

  it('should handle non-contiguous row numbers', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 100, row: 0 },
      { width: 100, height: 100, row: 5 }, // skip rows 1-4
    ];

    const positions = calculateRowLayout(items);

    // Row 5 should still be directly after row 0 (empty rows don't add space)
    expect(positions[1].y).toBe(100 + ROW_GAP);
  });

  it('should handle mixed items with and without row', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140 }, // no row → default 0
      { width: 100, height: 140, row: 1 },
    ];

    const positions = calculateRowLayout(items);

    expect(positions[0].y).toBe(0);
    expect(positions[1].y).toBe(140 + ROW_GAP);
  });

  it('should handle empty items list', () => {
    const positions = calculateRowLayout([]);

    expect(positions).toEqual([]);
  });

  it('should handle items with different widths', () => {
    const items: LayoutItem[] = [
      { width: 50, height: 140 },
      { width: 200, height: 140 },
      { width: 80, height: 140 },
    ];

    const positions = calculateRowLayout(items);

    expect(positions[0].x).toBe(0);
    expect(positions[1].x).toBe(50 + PADDING);
    expect(positions[2].x).toBe(50 + PADDING + 200 + PADDING);
  });

  it('should apply origin offset', () => {
    const items: LayoutItem[] = [{ width: 100, height: 140 }];

    const positions = calculateRowLayout(items, { x: 500, y: 300 });

    expect(positions[0].x).toBe(500);
    expect(positions[0].y).toBe(300);
  });

  it('should preserve item order in output', () => {
    const items: LayoutItem[] = [
      { width: 100, height: 140, row: 1 },
      { width: 100, height: 140, row: 0 },
      { width: 80, height: 140, row: 1 },
    ];

    const positions = calculateRowLayout(items);

    // positions[0] is for items[0] (row 1)
    // positions[1] is for items[1] (row 0)
    // positions[2] is for items[2] (row 1)
    expect(positions[1].y).toBe(0); // row 0
    expect(positions[0].y).toBe(140 + ROW_GAP); // row 1
    expect(positions[2].y).toBe(140 + ROW_GAP); // row 1
    expect(positions[2].x).toBeGreaterThan(positions[0].x); // second item in row 1
  });
});
