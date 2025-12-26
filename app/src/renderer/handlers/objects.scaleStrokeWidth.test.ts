import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScaleStrokeWidth } from './objects';

describe('createScaleStrokeWidth - Counter-Scaled Stroke Widths', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn<Console, 'error'>>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('sqrt scaling behavior', () => {
    it('scales stroke width inversely with zoom using sqrt', () => {
      // At 1x zoom: stroke = 2px / sqrt(1) = 2px
      const scaleAt1x = createScaleStrokeWidth(1.0);
      expect(scaleAt1x(2)).toBe(2);

      // At 4x zoom: stroke = 2px / sqrt(4) = 1px
      const scaleAt4x = createScaleStrokeWidth(4.0);
      expect(scaleAt4x(2)).toBe(1);

      // At 16x zoom: stroke = 2px / sqrt(16) = 0.5px
      const scaleAt16x = createScaleStrokeWidth(16.0);
      expect(scaleAt16x(2)).toBe(0.5);
    });

    it('respects minimum stroke width of 0.5px at extreme zoom', () => {
      // At 100x zoom: stroke = 2px / sqrt(100) = 0.2px, but clamped to 0.5px
      const scaleAt100x = createScaleStrokeWidth(100.0);
      expect(scaleAt100x(2)).toBe(0.5);

      // At 1000x zoom: stroke = 2px / sqrt(1000) ≈ 0.063px, but clamped to 0.5px
      const scaleAt1000x = createScaleStrokeWidth(1000.0);
      expect(scaleAt1000x(2)).toBe(0.5);
    });

    it('selected objects have thicker strokes that also counter-scale', () => {
      const cameraScale = 4.0; // 4x zoom
      const scaleStroke = createScaleStrokeWidth(cameraScale);

      // Unselected: 2px base width
      const unselectedWidth = scaleStroke(2);
      expect(unselectedWidth).toBe(1); // 2 / sqrt(4) = 1

      // Selected: 4px base width
      const selectedWidth = scaleStroke(4);
      expect(selectedWidth).toBe(2); // 4 / sqrt(4) = 2

      // Selected strokes remain thicker at all zoom levels
      expect(selectedWidth).toBeGreaterThan(unselectedWidth);
    });

    it('does not apply counter-scaling at zoom < 1x', () => {
      // At 0.5x zoom: zoomFactor = max(1, sqrt(0.5)) = 1
      // So stroke = 2 / 1 = 2 (no counter-scaling)
      const scaleAt0_5x = createScaleStrokeWidth(0.5);
      expect(scaleAt0_5x(2)).toBe(2);

      // At 0.25x zoom: same behavior
      const scaleAt0_25x = createScaleStrokeWidth(0.25);
      expect(scaleAt0_25x(2)).toBe(2);
    });
  });

  describe('input validation', () => {
    it('handles invalid baseWidth (negative)', () => {
      const scaleStroke = createScaleStrokeWidth(2.0);
      const result = scaleStroke(-5);

      expect(result).toBe(0.5); // Falls back to minimum
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid baseWidth in scaleStrokeWidth:',
        { baseWidth: -5, cameraScale: 2.0 },
      );
    });

    it('handles invalid baseWidth (NaN)', () => {
      const scaleStroke = createScaleStrokeWidth(2.0);
      const result = scaleStroke(NaN);

      expect(result).toBe(0.5);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid baseWidth in scaleStrokeWidth:',
        { baseWidth: NaN, cameraScale: 2.0 },
      );
    });

    it('handles invalid baseWidth (Infinity)', () => {
      const scaleStroke = createScaleStrokeWidth(2.0);
      const result = scaleStroke(Infinity);

      expect(result).toBe(0.5);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid baseWidth in scaleStrokeWidth:',
        { baseWidth: Infinity, cameraScale: 2.0 },
      );
    });

    it('handles invalid cameraScale (zero)', () => {
      const scaleStroke = createScaleStrokeWidth(0);
      const result = scaleStroke(2);

      expect(result).toBe(2); // Falls back to unscaled
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: 0 },
      );
    });

    it('handles invalid cameraScale (negative)', () => {
      const scaleStroke = createScaleStrokeWidth(-5);
      const result = scaleStroke(2);

      expect(result).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: -5 },
      );
    });

    it('handles invalid cameraScale (NaN)', () => {
      const scaleStroke = createScaleStrokeWidth(NaN);
      const result = scaleStroke(2);

      expect(result).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: NaN },
      );
    });

    it('handles invalid cameraScale (Infinity)', () => {
      const scaleStroke = createScaleStrokeWidth(Infinity);
      const result = scaleStroke(2);

      expect(result).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: Infinity },
      );
    });
  });

  describe('custom context labeling', () => {
    it('uses custom context in error messages', () => {
      const scaleStroke = createScaleStrokeWidth(NaN, 'CustomManager');
      scaleStroke(2);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CustomManager] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: NaN },
      );
    });

    it('defaults to RenderContext when no context provided', () => {
      const scaleStroke = createScaleStrokeWidth(NaN);
      scaleStroke(2);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RenderContext] Invalid cameraScale in scaleStrokeWidth:',
        { baseWidth: 2, cameraScale: NaN },
      );
    });
  });

  describe('perceptual consistency', () => {
    it('provides better visual uniformity than linear scaling', () => {
      // Demonstrate sqrt scaling maintains better perceptual consistency
      const linearScale = (baseWidth: number, zoom: number) =>
        Math.max(0.5, baseWidth / zoom);
      const sqrtScale = (baseWidth: number, zoom: number) =>
        Math.max(0.5, baseWidth / Math.max(1, Math.sqrt(zoom)));

      // At 4x zoom:
      // Linear: 2/4 = 0.5px (at minimum, looks thin)
      // Sqrt: 2/sqrt(4) = 1px (more visible)
      expect(linearScale(2, 4)).toBe(0.5);
      expect(sqrtScale(2, 4)).toBe(1);

      // At 16x zoom:
      // Linear: 2/16 = 0.125 → 0.5px (clamped)
      // Sqrt: 2/sqrt(16) = 0.5px (naturally at minimum)
      expect(linearScale(2, 16)).toBe(0.5);
      expect(sqrtScale(2, 16)).toBe(0.5);

      // Sqrt scaling reaches minimum at higher zoom levels,
      // providing better visibility at moderate zoom levels (2x-8x)
    });
  });

  describe('edge cases', () => {
    it('handles fractional zoom levels correctly', () => {
      const scaleAt2_5x = createScaleStrokeWidth(2.5);
      // 2 / sqrt(2.5) = 2 / 1.58... ≈ 1.265
      const result = scaleAt2_5x(2);
      expect(result).toBeCloseTo(1.265, 2);
    });

    it('handles very small base widths', () => {
      const scaleStroke = createScaleStrokeWidth(4.0);
      // Even with tiny base width, minimum is enforced
      const result = scaleStroke(0.1);
      expect(result).toBe(0.5); // Clamped to minimum
    });

    it('handles very large base widths', () => {
      const scaleStroke = createScaleStrokeWidth(4.0);
      const result = scaleStroke(100);
      // 100 / sqrt(4) = 50
      expect(result).toBe(50);
    });

    it('maintains consistency across multiple calls', () => {
      const scaleStroke = createScaleStrokeWidth(4.0);

      const result1 = scaleStroke(2);
      const result2 = scaleStroke(2);
      const result3 = scaleStroke(2);

      // Should return same value each time (pure function)
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(1);
    });
  });
});
