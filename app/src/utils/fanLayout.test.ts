import { describe, it, expect } from 'vitest';
import { computeFanLayout, CARD_WIDTH } from './fanLayout';

describe('computeFanLayout', () => {
  it('returns zero layout for zero cards', () => {
    const layout = computeFanLayout(0, 500);
    expect(layout.overlap).toBe(0);
    expect(layout.startOffset).toBe(0);
    expect(layout.cardWidth).toBe(CARD_WIDTH);
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
    // 10 cards at 72px each = 720px, container = 400px
    const layout = computeFanLayout(10, 400);
    expect(layout.overlap).toBeGreaterThan(0);
    // Total rendered width should be close to container
    const renderedWidth =
      10 * CARD_WIDTH - 9 * layout.overlap + 2 * layout.startOffset;
    // Should fit within container (with possible centering offset)
    expect(renderedWidth).toBeLessThanOrEqual(400 + 1); // +1 for rounding
  });

  it('caps overlap at 70% of card width (30% minimum visible)', () => {
    // Many cards in a tiny container
    const layout = computeFanLayout(50, 100);
    const maxOverlap = CARD_WIDTH * 0.7;
    expect(layout.overlap).toBeLessThanOrEqual(maxOverlap + 0.01);
  });

  it('handles exact fit (no overlap, no centering offset)', () => {
    const exactWidth = 5 * CARD_WIDTH;
    const layout = computeFanLayout(5, exactWidth);
    expect(layout.overlap).toBe(0);
    expect(layout.startOffset).toBe(0);
  });

  it('handles two cards needing slight overlap', () => {
    const layout = computeFanLayout(2, CARD_WIDTH + 10);
    // Two cards of 72px in 82px = need 62px overlap
    expect(layout.overlap).toBeGreaterThan(0);
    expect(layout.overlap).toBeLessThanOrEqual(CARD_WIDTH * 0.7);
  });

  describe('mobile mode', () => {
    it('caps overlap at 40% of card width (60% minimum visible)', () => {
      const layout = computeFanLayout(50, 100, true);
      const maxOverlap = CARD_WIDTH * 0.4;
      expect(layout.overlap).toBeLessThanOrEqual(maxOverlap + 0.01);
    });

    it('centers cards that fit without overlap', () => {
      const layout = computeFanLayout(3, 500, true);
      const totalWidth = 3 * CARD_WIDTH;
      expect(layout.overlap).toBe(0);
      expect(layout.startOffset).toBeCloseTo((500 - totalWidth) / 2);
    });

    it('reports totalContentWidth larger than container when scrolling needed', () => {
      // 20 cards, mobile max overlap = 40% of 72 = 28.8px, visible per card = 43.2px
      // content = 20 * 72 - 19 * 28.8 = 1440 - 547.2 = 892.8
      const layout = computeFanLayout(20, 300, true);
      expect(layout.totalContentWidth).toBeGreaterThan(300);
    });
  });
});
