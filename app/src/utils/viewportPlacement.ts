/**
 * Viewport-center placement primitive (ct-8gf.3).
 *
 * Pure utility for additive loadables (cards, decks, encounter sets) that
 * need to drop new content onto the table at the center of the
 * currently-viewable area, with small random jitter so multiple drops do
 * not perfectly stack.
 *
 * Returns a world-space coordinate. World vs screen relationship:
 *   screenX = cameraX + worldX * cameraScale
 *   worldX  = (screenX - cameraX) / cameraScale
 * (mirrors `CoordinateConverter.screenToWorld` — see
 *  `app/src/renderer/managers/CoordinateConverter.ts`).
 *
 * The renderer stores camera state on the PixiJS `worldContainer`:
 *   - `worldContainer.position.x/y` ↔ `cameraX/cameraY` (screen pixels)
 *   - `worldContainer.scale` ↔ `cameraScale`
 * This util accepts a plain `ViewportState` so callers outside the
 * renderer (action handlers, store) don't need a PixiJS dependency.
 */

import { CARD_HEIGHT } from '../renderer/constants';

/**
 * Plain shape describing the camera + viewport. Caller is responsible for
 * sourcing these from the renderer's CameraManager / CoordinateConverter
 * (or any equivalent test double).
 *
 * All screen-space values are in CSS pixels — see
 * `MainToRendererMessage.viewport-state` for the canonical wire shape and
 * `app/src/renderer/handlers/coordinates.ts::handleRequestViewportState` for
 * the conversion from the renderer's native canvas-pixel space.
 */
export interface ViewportState {
  /** Camera screen-space x offset (CSS pixels). */
  cameraX: number;
  /** Camera screen-space y offset (CSS pixels). */
  cameraY: number;
  /** Camera zoom level (1.0 = 100%). */
  cameraScale: number;
  /** Viewport width in CSS pixels. */
  viewportWidth: number;
  /** Viewport height in CSS pixels. */
  viewportHeight: number;
  /**
   * Device pixel ratio used to scale CSS-pixel world coords back into the
   * renderer's native canvas-pixel space when storing object positions.
   * Pure callers (e.g. unit tests) can default this to 1.
   */
  devicePixelRatio: number;
}

/**
 * Default jitter radius in world-space pixels.
 *
 * Sized to prevent perfect overlap when dropping multiple items quickly
 * but small enough that the result still reads as "near center". Card
 * widths in this codebase hover around 60-70px (see fanLayout's
 * CARD_WIDTH = 72), so a ~50px radius keeps subsequent drops visually
 * adjacent without scattering them off-screen.
 */
export const DEFAULT_JITTER_RADIUS = 50;

export interface PlacementOptions {
  /**
   * World-space radius of the random jitter disc. Set to 0 to get the
   * exact viewport center. Defaults to {@link DEFAULT_JITTER_RADIUS}.
   */
  jitterRadius?: number;
  /**
   * Optional deterministic random source — must return values in [0, 1).
   * When omitted, falls back to `Math.random`. Tests should always pass
   * a seeded RNG so results are reproducible.
   */
  rng?: () => number;
}

export interface Placement {
  x: number;
  y: number;
}

/**
 * Compute the world-space center of the current viewport.
 *
 * Pure: no jitter applied. Useful when the caller wants to add their own
 * offset logic, or for tests of the un-jittered baseline.
 */
export function getViewportCenter(state: ViewportState): Placement {
  const { cameraX, cameraY, cameraScale, viewportWidth, viewportHeight } =
    state;
  return {
    x: (viewportWidth / 2 - cameraX) / cameraScale,
    y: (viewportHeight / 2 - cameraY) / cameraScale,
  };
}

/**
 * Compute a placement coordinate at the center of the current viewport,
 * plus a uniformly-distributed random offset within `jitterRadius`.
 *
 * Sampling uses sqrt-of-uniform on the radial component so points are
 * uniformly distributed across the disc (rather than clumped at the
 * center). The maximum offset magnitude is bounded by `jitterRadius`.
 */
export function getViewportCenterPlacement(
  state: ViewportState,
  options: PlacementOptions = {},
): Placement {
  return applyJitter(getViewportCenter(state), options);
}

function applyJitter(anchor: Placement, options: PlacementOptions): Placement {
  const jitterRadius = options.jitterRadius ?? DEFAULT_JITTER_RADIUS;
  if (jitterRadius <= 0) {
    return anchor;
  }

  const rng = options.rng ?? Math.random;
  // Uniform-on-disc: sqrt(u) for radius gives uniform point density.
  const r = jitterRadius * Math.sqrt(rng());
  const theta = 2 * Math.PI * rng();
  return {
    x: anchor.x + r * Math.cos(theta),
    y: anchor.y + r * Math.sin(theta),
  };
}

const BOTTOM_EDGE_MARGIN_SCREEN_PX = 8;

/**
 * Compute a placement horizontally centred and as low in the viewport as
 * the whole card plus its jitter disc can sit above the bottom edge. On a
 * viewport too short for that, the anchor falls back to the vertical centre.
 */
export function getViewportBottomPlacement(
  state: ViewportState,
  options: PlacementOptions = {},
): Placement {
  const {
    cameraX,
    cameraY,
    cameraScale,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
  } = state;
  const radius = options.jitterRadius ?? DEFAULT_JITTER_RADIUS;
  const halfCard = CARD_HEIGHT / 2 / devicePixelRatio;
  const insetScreen =
    (halfCard + radius) * cameraScale + BOTTOM_EDGE_MARGIN_SCREEN_PX;
  const anchorScreenX = viewportWidth / 2;
  const anchorScreenY = Math.max(
    viewportHeight / 2,
    viewportHeight - insetScreen,
  );
  return applyJitter(
    {
      x: (anchorScreenX - cameraX) / cameraScale,
      y: (anchorScreenY - cameraY) / cameraScale,
    },
    options,
  );
}

/**
 * Translate a CSS-pixel world coordinate (as produced by
 * {@link getViewportCenterPlacement}) into the renderer's native canvas-pixel
 * world space. Required because the viewport-state response now carries CSS
 * pixels (matching its type doc — see ct-rde) while every object position
 * stored in the YJS doc is interpreted by the renderer in canvas-pixel world
 * space (set up by `CameraManager.initialize` from `app.renderer.width/height`,
 * both DPR-multiplied).
 */
export function toCanvasPxPlacement(
  placement: Placement,
  devicePixelRatio: number,
): Placement {
  return {
    x: placement.x * devicePixelRatio,
    y: placement.y * devicePixelRatio,
  };
}

/**
 * Tiny seedable PRNG (mulberry32). Pure — same seed always yields the
 * same sequence. Exported for tests; callers in production should pass a
 * real RNG or omit `options.rng` to use `Math.random`.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
