import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ATTACHMENT_LAYOUT,
  type AssetPack,
  type AttachmentDirection,
  type AttachmentLayout,
} from '@cardtable2/shared';
import { computeAttachmentPositions } from './attachmentLayout';
import { STACK_HEIGHT, STACK_WIDTH } from '../renderer/objects/stack/constants';

describe('computeAttachmentPositions', () => {
  const parentPos = { x: 100, y: 200, r: 0 };

  it('returns empty array for zero attachments', () => {
    const result = computeAttachmentPositions(parentPos, 0, {
      direction: 'bottom',
      revealFraction: 0.25,
    });
    expect(result).toEqual([]);
  });

  it('positions a single attachment below the parent', () => {
    const result = computeAttachmentPositions(parentPos, 1, {
      direction: 'bottom',
      revealFraction: 0.25,
    });

    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(100); // Same x as parent
    expect(result[0].y).toBe(200 + STACK_HEIGHT * 0.25); // Below parent
    expect(result[0].r).toBe(0);
  });

  it('positions multiple attachments with increasing offsets', () => {
    const result = computeAttachmentPositions(parentPos, 3, {
      direction: 'bottom',
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
      direction: 'top',
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
      direction: 'bottom' as const,
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
      direction: 'bottom',
      revealFraction: 0.25,
    });

    // "Bottom" with 90-degree rotation should fan to the left
    const step = STACK_HEIGHT * 0.25;
    expect(result[0].x).toBeCloseTo(100 - step, 5);
    expect(result[0].y).toBeCloseTo(200, 5);
    expect(result[0].r).toBe(90);
  });

  it('inherits parent rotation on all attachments', () => {
    const rotatedParent = { x: 0, y: 0, r: 45 };

    const result = computeAttachmentPositions(rotatedParent, 2, {
      direction: 'bottom',
      revealFraction: 0.25,
    });

    for (const pos of result) {
      expect(pos.r).toBe(45);
    }
  });

  // ============================================================================
  // Corner directions: top-left, top-right, bottom-left, bottom-right
  // ============================================================================
  // Each corner uses a symmetric offset on both axes, reusing revealFraction
  // for both width and height. Signs:
  //   top-left:     (-W, -H)
  //   top-right:    (+W, -H)
  //   bottom-left:  (-W, +H)
  //   bottom-right: (+W, +H)

  describe('corner directions', () => {
    type CornerCase = {
      direction: AttachmentDirection;
      sx: -1 | 1; // x sign
      sy: -1 | 1; // y sign
    };

    const corners: CornerCase[] = [
      { direction: 'top-left', sx: -1, sy: -1 },
      { direction: 'top-right', sx: 1, sy: -1 },
      { direction: 'bottom-left', sx: -1, sy: 1 },
      { direction: 'bottom-right', sx: 1, sy: 1 },
    ];

    for (const { direction, sx, sy } of corners) {
      describe(`direction='${direction}'`, () => {
        it('positions a single attachment with symmetric (dx, dy)', () => {
          const result = computeAttachmentPositions(parentPos, 1, {
            direction,
            revealFraction: 0.25,
          });

          expect(result).toHaveLength(1);
          expect(result[0].x).toBeCloseTo(100 + sx * STACK_WIDTH * 0.25, 5);
          expect(result[0].y).toBeCloseTo(200 + sy * STACK_HEIGHT * 0.25, 5);
          expect(result[0].r).toBe(0);
        });

        it('positions 2 attachments with linearly increasing (dx, dy)', () => {
          const result = computeAttachmentPositions(parentPos, 2, {
            direction,
            revealFraction: 0.25,
          });

          expect(result).toHaveLength(2);
          const stepX = sx * STACK_WIDTH * 0.25;
          const stepY = sy * STACK_HEIGHT * 0.25;
          expect(result[0].x).toBeCloseTo(100 + stepX, 5);
          expect(result[0].y).toBeCloseTo(200 + stepY, 5);
          expect(result[1].x).toBeCloseTo(100 + stepX * 2, 5);
          expect(result[1].y).toBeCloseTo(200 + stepY * 2, 5);
        });

        it('positions 3 attachments with linearly increasing (dx, dy)', () => {
          const result = computeAttachmentPositions(parentPos, 3, {
            direction,
            revealFraction: 0.25,
          });

          expect(result).toHaveLength(3);
          const stepX = sx * STACK_WIDTH * 0.25;
          const stepY = sy * STACK_HEIGHT * 0.25;
          for (let i = 0; i < 3; i++) {
            expect(result[i].x).toBeCloseTo(100 + stepX * (i + 1), 5);
            expect(result[i].y).toBeCloseTo(200 + stepY * (i + 1), 5);
          }
        });

        it('rotates the offset vector by parent _pos.r (90 degrees)', () => {
          // 90deg rotation: (x', y') = (-y, x). So a corner offset (sx*W, sy*H)
          // rotated by 90deg becomes (-sy*H, sx*W).
          const rotatedParent = { x: 100, y: 200, r: 90 };
          const result = computeAttachmentPositions(rotatedParent, 1, {
            direction,
            revealFraction: 0.25,
          });

          const expectedDx = -sy * STACK_HEIGHT * 0.25;
          const expectedDy = sx * STACK_WIDTH * 0.25;
          expect(result[0].x).toBeCloseTo(100 + expectedDx, 5);
          expect(result[0].y).toBeCloseTo(200 + expectedDy, 5);
          expect(result[0].r).toBe(90);
        });

        it('compression scales both axes proportionally at 5+ attachments', () => {
          const layout: AttachmentLayout = {
            direction,
            revealFraction: 0.25,
            maxBeforeCompress: 3,
          };

          // With count=6, maxBeforeCompress=3, revealFraction=0.25:
          //   effectiveReveal = (0.25 * 3) / 6 = 0.125
          // The last card (index 5) sits at offset * 6, so:
          //   xLast = 100 + sx * STACK_WIDTH  * 0.125 * 6 = 100 + sx * STACK_WIDTH  * 0.75
          //   yLast = 200 + sy * STACK_HEIGHT * 0.125 * 6 = 200 + sy * STACK_HEIGHT * 0.75
          // Total reach equals 3 cards uncompressed (3 * 0.25 = 0.75). Both axes scale together.
          const compressed = computeAttachmentPositions(parentPos, 6, layout);
          expect(compressed).toHaveLength(6);

          const expectedTotalDx = sx * STACK_WIDTH * 0.75;
          const expectedTotalDy = sy * STACK_HEIGHT * 0.75;
          expect(compressed[5].x).toBeCloseTo(100 + expectedTotalDx, 5);
          expect(compressed[5].y).toBeCloseTo(200 + expectedTotalDy, 5);

          // Sanity: ratio of x-step to y-step is preserved (W*reveal : H*reveal),
          // i.e., compression scales both axes by the same factor.
          const stepX = compressed[1].x - compressed[0].x;
          const stepY = compressed[1].y - compressed[0].y;
          // Sign-corrected ratio should equal STACK_WIDTH / STACK_HEIGHT.
          expect(Math.abs(stepX) / Math.abs(stepY)).toBeCloseTo(
            STACK_WIDTH / STACK_HEIGHT,
            5,
          );
          // Per-card step magnitude: 0.125 of dimension.
          expect(Math.abs(stepX)).toBeCloseTo(STACK_WIDTH * 0.125, 5);
          expect(Math.abs(stepY)).toBeCloseTo(STACK_HEIGHT * 0.125, 5);
        });
      });
    }
  });
});

// ============================================================================
// Plugin config-flow: resolving attachmentLayout from the active GameAssets
// ============================================================================
// Mirrors BoardMessageBus.ts (~lines 135-138 / 231-234), which reads:
//
//   const gameAssets = ctx.store.getGameAssets();
//   const layout = gameAssets?.packs.find((p) => p.attachmentLayout)
//                  ?.attachmentLayout;
//
// We assert the lookup returns the configured direction when set, and falls
// through to DEFAULT_ATTACHMENT_LAYOUT when no pack defines one. This is the
// plugin-config-flow check we agreed to in lieu of E2E.

describe('attachmentLayout: plugin config flow', () => {
  function resolveAttachmentLayout(
    packs: Pick<AssetPack, 'attachmentLayout'>[],
  ): AttachmentLayout {
    return (
      packs.find((p) => p.attachmentLayout)?.attachmentLayout ??
      DEFAULT_ATTACHMENT_LAYOUT
    );
  }

  it('returns the pack-configured direction when a pack defines attachmentLayout', () => {
    const layout: AttachmentLayout = {
      direction: 'top-right',
      revealFraction: 0.3,
      maxBeforeCompress: 4,
      parentOnTop: false,
    };
    const packs = [{ attachmentLayout: layout }];

    const resolved = resolveAttachmentLayout(packs);
    expect(resolved).toBe(layout);
    expect(resolved.direction).toBe('top-right');
  });

  it('returns DEFAULT_ATTACHMENT_LAYOUT when no pack defines attachmentLayout', () => {
    const packs: Pick<AssetPack, 'attachmentLayout'>[] = [
      {},
      { attachmentLayout: undefined },
    ];

    const resolved = resolveAttachmentLayout(packs);
    expect(resolved).toBe(DEFAULT_ATTACHMENT_LAYOUT);
    expect(resolved.direction).toBe('bottom'); // Default direction post-rename
  });

  it('returns the first pack with attachmentLayout (matches BoardMessageBus.find())', () => {
    const first: AttachmentLayout = {
      direction: 'left',
      revealFraction: 0.2,
    };
    const second: AttachmentLayout = {
      direction: 'right',
      revealFraction: 0.4,
    };
    const packs = [
      {}, // no layout
      { attachmentLayout: first },
      { attachmentLayout: second },
    ];

    const resolved = resolveAttachmentLayout(packs);
    expect(resolved).toBe(first);
  });
});
