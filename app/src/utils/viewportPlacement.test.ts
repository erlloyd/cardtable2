import { describe, it, expect } from 'vitest';
import {
  getViewportCenter,
  getViewportCenterPlacement,
  createSeededRng,
  DEFAULT_JITTER_RADIUS,
  type ViewportState,
} from './viewportPlacement';

// A "neutral" viewport: camera at screen-center pointing at world origin,
// no zoom — viewport center should be (0, 0) in world space.
const NEUTRAL_VIEWPORT: ViewportState = {
  cameraX: 600,
  cameraY: 400,
  cameraScale: 1,
  viewportWidth: 1200,
  viewportHeight: 800,
};

describe('getViewportCenter', () => {
  it('returns world origin when camera is centered with no zoom', () => {
    const center = getViewportCenter(NEUTRAL_VIEWPORT);
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
  });

  it('translates with the camera (pan moves viewport center in world space)', () => {
    // Camera shifted left by 200 screen pixels — the viewport now looks
    // at a world point 200 px to the right of origin.
    const panned: ViewportState = {
      ...NEUTRAL_VIEWPORT,
      cameraX: NEUTRAL_VIEWPORT.cameraX - 200,
    };
    const center = getViewportCenter(panned);
    expect(center.x).toBe(200);
    expect(center.y).toBe(0);
  });

  it('accounts for camera scale (zoomed in -> smaller world span)', () => {
    // Same screen midpoint, but world coords scale by 1/cameraScale.
    const zoomed: ViewportState = {
      cameraX: 0,
      cameraY: 0,
      cameraScale: 2,
      viewportWidth: 1200,
      viewportHeight: 800,
    };
    const center = getViewportCenter(zoomed);
    expect(center.x).toBe(300); // (600 - 0) / 2
    expect(center.y).toBe(200); // (400 - 0) / 2
  });
});

describe('getViewportCenterPlacement', () => {
  it('returns viewport center exactly when jitterRadius is 0', () => {
    const placement = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
      jitterRadius: 0,
    });
    expect(placement.x).toBe(0);
    expect(placement.y).toBe(0);
  });

  it('returns viewport center for a non-neutral camera when jitter is 0', () => {
    const panned: ViewportState = {
      ...NEUTRAL_VIEWPORT,
      cameraX: NEUTRAL_VIEWPORT.cameraX - 100,
      cameraY: NEUTRAL_VIEWPORT.cameraY - 50,
    };
    const placement = getViewportCenterPlacement(panned, { jitterRadius: 0 });
    expect(placement.x).toBe(100);
    expect(placement.y).toBe(50);
  });

  it('produces deterministic offsets given a seeded RNG', () => {
    const rngA = createSeededRng(42);
    const rngB = createSeededRng(42);
    const a = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
      jitterRadius: 50,
      rng: rngA,
    });
    const b = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
      jitterRadius: 50,
      rng: rngB,
    });
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  it('produces different offsets across successive calls with the same RNG', () => {
    const rng = createSeededRng(7);
    const first = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
      jitterRadius: 50,
      rng,
    });
    const second = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
      jitterRadius: 50,
      rng,
    });
    // Cosmically tiny chance of collision; with mulberry32 they will differ.
    expect(first.x === second.x && first.y === second.y).toBe(false);
  });

  it('keeps offset magnitude within jitterRadius across many samples', () => {
    const rng = createSeededRng(123);
    const radius = 60;
    const samples = 1000;
    let maxOffset = 0;
    for (let i = 0; i < samples; i++) {
      const p = getViewportCenterPlacement(NEUTRAL_VIEWPORT, {
        jitterRadius: radius,
        rng,
      });
      const offset = Math.hypot(p.x, p.y); // center is (0,0) here
      maxOffset = Math.max(maxOffset, offset);
    }
    // Strict bound — uniform-on-disc sampling can't exceed the radius.
    expect(maxOffset).toBeLessThanOrEqual(radius + 1e-9);
    // Sanity: with 1000 samples we should explore most of the disc.
    expect(maxOffset).toBeGreaterThan(radius * 0.7);
  });

  it('uses DEFAULT_JITTER_RADIUS when jitterRadius is omitted', () => {
    const rng = createSeededRng(99);
    const p = getViewportCenterPlacement(NEUTRAL_VIEWPORT, { rng });
    const offset = Math.hypot(p.x, p.y);
    expect(offset).toBeLessThanOrEqual(DEFAULT_JITTER_RADIUS + 1e-9);
  });

  it('jitter is applied in world space, not screen space (zoom-invariant magnitude)', () => {
    // At 2x zoom, the same jitterRadius in world space still bounds the
    // result by jitterRadius — verifies we're not double-applying scale.
    const zoomed: ViewportState = {
      cameraX: 0,
      cameraY: 0,
      cameraScale: 2,
      viewportWidth: 1200,
      viewportHeight: 800,
    };
    const center = getViewportCenter(zoomed);
    const rng = createSeededRng(5);
    const radius = 40;
    let maxOffset = 0;
    for (let i = 0; i < 500; i++) {
      const p = getViewportCenterPlacement(zoomed, {
        jitterRadius: radius,
        rng,
      });
      maxOffset = Math.max(
        maxOffset,
        Math.hypot(p.x - center.x, p.y - center.y),
      );
    }
    expect(maxOffset).toBeLessThanOrEqual(radius + 1e-9);
  });
});

describe('createSeededRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const rngA = createSeededRng(2026);
    const rngB = createSeededRng(2026);
    for (let i = 0; i < 20; i++) {
      expect(rngA()).toBe(rngB());
    }
  });
});
