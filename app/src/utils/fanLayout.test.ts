import { describe, it, expect } from 'vitest';
import { computeFanLayout, CARD_WIDTH } from './fanLayout';

describe('computeFanLayout', () => {
  it('returns zero-width layout for zero cards', () => {
    const layout = computeFanLayout(0, 500);
    expect(layout.overlap).toBe(0);
    expect(layout.totalContentWidth).toBe(0);
  });

  it('centers a single card', () => {
    const layout = computeFanLayout(1, 500);
    expect(layout.overlap).toBe(0);
    expect(layout.startOffset).toBe((500 - CARD_WIDTH) / 2);
  });

  it('centers cards when they fit without overlap', () => {
    const layout = computeFanLayout(3, 500);
    const totalWidth = 3 * CARD_WIDTH;
    expect(layout.overlap).toBe(0);
    expect(layout.startOffset).toBeCloseTo((500 - totalWidth) / 2);
    expect(layout.totalContentWidth).toBe(totalWidth);
  });

  it('applies overlap when cards exceed container width', () => {
    const layout = computeFanLayout(10, 400);
    expect(layout.overlap).toBeGreaterThan(0);
    // Content should fit within container
    expect(layout.totalContentWidth).toBeLessThanOrEqual(400 + 1);
  });

  it('caps overlap at 50% of card width (50% minimum visible)', () => {
    const layout = computeFanLayout(50, 100);
    const maxOverlap = CARD_WIDTH * 0.5;
    expect(layout.overlap).toBeLessThanOrEqual(maxOverlap + 0.01);
  });

  it('handles exact fit (no overlap, no centering offset)', () => {
    const exactWidth = 5 * CARD_WIDTH;
    const layout = computeFanLayout(5, exactWidth);
    expect(layout.overlap).toBe(0);
    expect(layout.startOffset).toBe(0);
  });

  it('content exceeds container when overlap is maxed out', () => {
    // Many cards in tiny container — overlap caps, content overflows
    const layout = computeFanLayout(50, 100);
    expect(layout.totalContentWidth).toBeGreaterThan(100);
  });

  it('overlap scales smoothly with card count', () => {
    const few = computeFanLayout(8, 400);
    const many = computeFanLayout(12, 400);
    // More cards in same space → more overlap
    expect(many.overlap).toBeGreaterThan(few.overlap);
  });
});
