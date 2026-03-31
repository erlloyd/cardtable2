import { describe, it, expect } from 'vitest';
import { computeAttachmentPositions } from './attachmentLayout';
import { STACK_HEIGHT, STACK_WIDTH } from '../renderer/objects/stack/constants';

describe('computeAttachmentPositions', () => {
  const parentPos = { x: 100, y: 200, r: 0 };

  it('returns empty array for zero attachments', () => {
    const result = computeAttachmentPositions(parentPos, 0, {
      direction: 'below',
      revealFraction: 0.25,
    });
    expect(result).toEqual([]);
  });

  it('positions a single attachment below the parent', () => {
    const result = computeAttachmentPositions(parentPos, 1, {
      direction: 'below',
      revealFraction: 0.25,
    });

    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(100); // Same x as parent
    expect(result[0].y).toBe(200 + STACK_HEIGHT * 0.25); // Below parent
    expect(result[0].r).toBe(0);
  });

  it('positions multiple attachments with increasing offsets', () => {
    const result = computeAttachmentPositions(parentPos, 3, {
      direction: 'below',
      revealFraction: 0.25,
    });

    expect(result).toHaveLength(3);
    const step = STACK_HEIGHT * 0.25;
    expect(result[0].y).toBeCloseTo(200 + step);
    expect(result[1].y).toBeCloseTo(200 + step * 2);
    expect(result[2].y).toBeCloseTo(200 + step * 3);
  });

  it('fans above the parent', () => {
    const result = computeAttachmentPositions(parentPos, 1, {
      direction: 'above',
      revealFraction: 0.25,
    });

    expect(result[0].x).toBe(100);
    expect(result[0].y).toBe(200 - STACK_HEIGHT * 0.25);
  });

  it('fans to the left', () => {
    const result = computeAttachmentPositions(parentPos, 1, {
      direction: 'left',
      revealFraction: 0.25,
    });

    expect(result[0].x).toBe(100 - STACK_WIDTH * 0.25);
    expect(result[0].y).toBe(200);
  });

  it('fans to the right', () => {
    const result = computeAttachmentPositions(parentPos, 1, {
      direction: 'right',
      revealFraction: 0.25,
    });

    expect(result[0].x).toBe(100 + STACK_WIDTH * 0.25);
    expect(result[0].y).toBe(200);
  });

  it('compresses spacing when exceeding maxBeforeCompress', () => {
    const layoutNormal = {
      direction: 'below' as const,
      revealFraction: 0.25,
      maxBeforeCompress: 3,
    };

    // 3 cards: no compression
    const normal = computeAttachmentPositions(parentPos, 3, layoutNormal);
    const normalStep = normal[1].y - normal[0].y;

    // 6 cards: should compress (maxBeforeCompress = 3)
    const compressed = computeAttachmentPositions(parentPos, 6, layoutNormal);
    const compressedStep = compressed[1].y - compressed[0].y;

    // Compressed step should be smaller than normal step
    expect(compressedStep).toBeLessThan(normalStep);

    // Total fan length: compressed 6 cards should be exactly 2x the 3-card fan
    // because effectiveReveal = (0.25 * 3) / 6 = 0.125, and 6 * 0.125 = 0.75 vs 3 * 0.25 = 0.75
    // But we compare last card positions: card[5] at index 5 means offset*(5+1)=6*compressed
    // vs card[2] at index 2 means offset*(2+1)=3*normal. So 6*compressed = 6*(0.125*H) = 0.75*H
    // and 3*normal = 3*(0.25*H) = 0.75*H → they should be equal!
    const totalNormal = normal[2].y - parentPos.y; // 3 * step
    const totalCompressed = compressed[5].y - parentPos.y; // 6 * compressedStep
    // With maxBeforeCompress=3, total reach for 6 cards equals total reach for 6 normal cards
    // scaled down: (6 * revealFraction * maxBeforeCompress / count) = (6 * 0.25 * 3 / 6) = 0.75
    // which equals 3 * 0.25 = 0.75. So they should be equal.
    expect(totalCompressed).toBeCloseTo(totalNormal, 0);
  });

  it('respects parent rotation', () => {
    const rotatedParent = { x: 100, y: 200, r: 90 }; // 90 degrees

    const result = computeAttachmentPositions(rotatedParent, 1, {
      direction: 'below',
      revealFraction: 0.25,
    });

    // "Below" with 90-degree rotation should fan to the left
    const step = STACK_HEIGHT * 0.25;
    expect(result[0].x).toBeCloseTo(100 - step, 5);
    expect(result[0].y).toBeCloseTo(200, 5);
    expect(result[0].r).toBe(90);
  });

  it('inherits parent rotation on all attachments', () => {
    const rotatedParent = { x: 0, y: 0, r: 45 };

    const result = computeAttachmentPositions(rotatedParent, 2, {
      direction: 'below',
      revealFraction: 0.25,
    });

    for (const pos of result) {
      expect(pos.r).toBe(45);
    }
  });
});
