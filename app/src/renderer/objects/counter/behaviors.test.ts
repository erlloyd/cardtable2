import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CounterBehaviors } from './behaviors';
import { ObjectKind, type TableObject } from '@cardtable2/shared';
import type { RenderContext } from '../types';
import { Text, Container, type TextOptions } from 'pixi.js';
import {
  COUNTER_PILL_BORDER_RADIUS,
  COUNTER_PILL_HEIGHT,
  COUNTER_PILL_WIDTH,
} from './constants';
import { getCounterDimensions } from './utils';

// Helper to create test counter objects with all required CounterMeta fields.
function createTestCounter(
  overrides?: Partial<TableObject> & {
    meta?: Record<string, unknown>;
  },
): TableObject {
  const { meta, ...rest } = overrides ?? {};
  return {
    _kind: ObjectKind.Counter,
    _pos: { x: 0, y: 0, r: 0 },
    _containerId: null,
    _sortKey: '0',
    _locked: false,
    _selectedBy: null,
    _meta: {
      type: 'generic',
      typeId: 'generic',
      color: 0xf39c12,
      min: 0,
      max: 99,
      startingValue: 0,
      currentValue: 0,
      ...(meta ?? {}),
    },
    ...rest,
  };
}

describe('Counter Behaviors - Pill Geometry', () => {
  describe('getBounds', () => {
    it('returns a rectangle matching pill width/height centered on _pos', () => {
      const counter = createTestCounter({
        _pos: { x: 100, y: 50, r: 0 },
      });

      const bounds = CounterBehaviors.getBounds(counter);

      expect(bounds.minX).toBe(100 - COUNTER_PILL_WIDTH / 2);
      expect(bounds.maxX).toBe(100 + COUNTER_PILL_WIDTH / 2);
      expect(bounds.minY).toBe(50 - COUNTER_PILL_HEIGHT / 2);
      expect(bounds.maxY).toBe(50 + COUNTER_PILL_HEIGHT / 2);
    });

    it('returns bounds wider than tall (horizontal pill)', () => {
      const counter = createTestCounter();
      const bounds = CounterBehaviors.getBounds(counter);

      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      expect(width).toBeGreaterThan(height);
    });
  });

  describe('getShadowConfig', () => {
    it('returns rect shape with the pill dimensions and matching border radius', () => {
      const counter = createTestCounter();

      const shadow = CounterBehaviors.getShadowConfig(counter);

      expect(shadow.shape).toBe('rect');
      expect(shadow.width).toBe(COUNTER_PILL_WIDTH);
      expect(shadow.height).toBe(COUNTER_PILL_HEIGHT);
      expect(shadow.borderRadius).toBe(COUNTER_PILL_BORDER_RADIUS);
    });
  });

  describe('capabilities', () => {
    it('disallows flip/rotate/stack but allows lock', () => {
      expect(CounterBehaviors.capabilities).toEqual({
        canFlip: false,
        canRotate: false,
        canStack: false,
        canUnstack: false,
        canLock: true,
      });
    });
  });
});

describe('getCounterDimensions', () => {
  it('returns the pill width/height constants', () => {
    const counter = createTestCounter();
    expect(getCounterDimensions(counter)).toEqual({
      width: COUNTER_PILL_WIDTH,
      height: COUNTER_PILL_HEIGHT,
    });
  });
});

describe('Counter Behaviors - Rendering', () => {
  let mockContext: RenderContext;
  let mockCreateText: Mock<(options: TextOptions) => Text>;
  let mockCreateKindLabel: Mock<(text: string) => Text>;
  let mockScaleStrokeWidth: Mock<(baseWidth: number) => number>;

  beforeEach(() => {
    mockCreateText = vi.fn((options: TextOptions) => {
      const text = new Text(options);
      text.resolution = 6; // Simulated zoom-aware resolution
      return text;
    });

    mockCreateKindLabel = vi.fn((textString: string) => {
      const text = new Text({
        text: textString,
        style: {
          fontSize: 24,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 2 },
        },
      });
      text.anchor.set(0.5);
      return text;
    });

    mockScaleStrokeWidth = vi.fn((baseWidth: number) => baseWidth);

    mockContext = {
      isSelected: false,
      isHovered: false,
      isDragging: false,
      dragActionPreview: null,
      isStackTarget: false,
      isAttachTarget: false,
      cameraScale: 1.0,
      createText: mockCreateText,
      createKindLabel: mockCreateKindLabel,
      scaleStrokeWidth: mockScaleStrokeWidth,
    } as RenderContext;
  });

  it('returns a Container', () => {
    const counter = createTestCounter();
    const container = CounterBehaviors.render(counter, mockContext);
    expect(container).toBeInstanceOf(Container);
  });

  it('renders currentValue as text', () => {
    const counter = createTestCounter({
      meta: { currentValue: 7 },
    });

    CounterBehaviors.render(counter, mockContext);

    expect(mockCreateText).toHaveBeenCalledWith(
      expect.objectContaining({ text: '7' }),
    );
  });

  it('renders minus and plus glyphs as side-zone affordances', () => {
    const counter = createTestCounter();

    CounterBehaviors.render(counter, mockContext);

    // Unicode MINUS SIGN (U+2212) is used for visual balance vs ASCII '-'.
    const glyphCalls = mockCreateText.mock.calls.map((call) => call[0].text);
    expect(glyphCalls).toContain('−');
    expect(glyphCalls).toContain('+');
  });

  it('renders the optional label when meta.text is set', () => {
    const counter = createTestCounter({
      meta: { text: 'HP' },
    });

    CounterBehaviors.render(counter, mockContext);

    const labelCall = mockCreateText.mock.calls.find(
      (call) => call[0].text === 'HP',
    );
    expect(labelCall).toBeDefined();
  });

  it('does not render the label when meta.text is undefined', () => {
    const counter = createTestCounter(); // no `text`

    CounterBehaviors.render(counter, mockContext);

    const textsRendered = mockCreateText.mock.calls.map((call) => call[0].text);
    // Only +, −, currentValue ("0") should appear — no label.
    expect(textsRendered).not.toContain('HP');
    expect(textsRendered.filter((t) => t === '0').length).toBe(1);
  });

  it('does not render the label when meta.text is an empty string', () => {
    const counter = createTestCounter({
      meta: { text: '' },
    });

    CounterBehaviors.render(counter, mockContext);

    // We can't easily detect an empty-string call, but at minimum it
    // shouldn't add a fourth Text on top of value + minus + plus.
    expect(mockCreateText).toHaveBeenCalledTimes(3);
  });

  it('renders the value text in the bold/white/dark-stroke stack-badge style', () => {
    const counter = createTestCounter({ meta: { currentValue: 3 } });

    CounterBehaviors.render(counter, mockContext);

    const valueCall = mockCreateText.mock.calls.find(
      (call) => call[0].text === '3',
    );
    expect(valueCall).toBeDefined();
    // `style` on TextOptions is `Partial<TextStyleOptions>`; cast to a loose
    // record for property-level assertion (style-equality on the pixi style
    // record itself is brittle).
    const style = valueCall![0].style as Record<string, unknown>;
    expect(style.fontWeight).toBe('bold');
    expect(style.fill).toBe(0xffffff);
    // Stroke is an object — we just assert it's present.
    expect(style.stroke).toBeDefined();
  });

  it('skips +/-/value/label rendering in minimal mode', () => {
    const counter = createTestCounter({
      meta: { text: 'HP', currentValue: 5 },
    });

    const minimalCtx = { ...mockContext, minimal: true };
    const container = CounterBehaviors.render(counter, minimalCtx);

    expect(container).toBeInstanceOf(Container);
    // In minimal mode only the pill body is rendered — no text calls.
    expect(mockCreateText).not.toHaveBeenCalled();
  });
});
