import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationManager, Easing } from './AnimationManager';
import { Application, Container } from 'pixi.js';

describe('AnimationManager', () => {
  let animationManager: AnimationManager;
  let mockApp: Application;
  let mockVisuals: Map<string, Container>;
  let mockVisual: Container;

  beforeEach(() => {
    animationManager = new AnimationManager();

    // Mock PixiJS Application with ticker
    mockApp = {
      ticker: {
        add: vi.fn(),
        remove: vi.fn(),
        start: vi.fn(),
        started: false,
      },
      renderer: {
        render: vi.fn(),
      },
      stage: {},
    } as unknown as Application;

    // Mock visual container
    mockVisual = {
      x: 0,
      y: 0,
      rotation: 0,
      alpha: 1,
      scale: { x: 1, y: 1, set: vi.fn() },
    } as unknown as Container;

    mockVisuals = new Map([['test-visual', mockVisual]]);

    animationManager.initialize(mockApp, mockVisuals);
  });

  describe('initialize', () => {
    it('initializes with app and visuals', () => {
      const newManager = new AnimationManager();
      const app = {} as Application;
      const visuals = new Map<string, Container>();

      // Should not throw
      expect(() => newManager.initialize(app, visuals)).not.toThrow();
    });
  });

  describe('animate', () => {
    it('starts an animation and ticker', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: Math.PI / 2,
        duration: 100,
      });

      expect(mockApp.ticker.add).toHaveBeenCalledTimes(1);
      expect(mockApp.ticker.start).toHaveBeenCalledTimes(1);
    });

    it('does not start ticker twice', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: Math.PI / 2,
        duration: 100,
      });

      animationManager.animate({
        visualId: 'test-visual',
        type: 'alpha',
        from: 1,
        to: 0,
        duration: 100,
      });

      // Ticker.add should only be called once
      expect(mockApp.ticker.add).toHaveBeenCalledTimes(1);
    });

    it('warns if visual not found', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      animationManager.animate({
        visualId: 'nonexistent',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Visual nonexistent not found'),
      );
      consoleSpy.mockRestore();
    });

    it('replaces existing animation for same visual+type', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: Math.PI / 2,
        duration: 100,
      });

      // Start a new animation for the same visual+type
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: Math.PI / 2,
        to: Math.PI,
        duration: 100,
      });

      // Should still be animating (replaced, not doubled)
      expect(animationManager.isAnimating('test-visual', 'rotation')).toBe(
        true,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a specific animation', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      expect(animationManager.isAnimating('test-visual', 'rotation')).toBe(
        true,
      );

      animationManager.cancel('test-visual', 'rotation');

      expect(animationManager.isAnimating('test-visual', 'rotation')).toBe(
        false,
      );
    });

    it('cancels staged animations', () => {
      // Simulate a flip animation with stages
      animationManager.animate({
        visualId: 'test-visual',
        type: 'scaleX',
        from: 1,
        to: 0,
        duration: 100,
        stage: 'flip-compress',
      });

      animationManager.animate({
        visualId: 'test-visual',
        type: 'scaleX',
        from: 0,
        to: 1,
        duration: 100,
        stage: 'flip-expand',
      });

      // Cancel should remove both staged animations
      animationManager.cancel('test-visual', 'scaleX');

      expect(animationManager.isAnimating('test-visual', 'scaleX')).toBe(false);
    });

    it('stops ticker when no animations remain', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      animationManager.cancel('test-visual', 'rotation');

      // Ticker should be stopped (remove called)
      expect(mockApp.ticker.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelAll', () => {
    it('cancels all animations for a visual', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      animationManager.animate({
        visualId: 'test-visual',
        type: 'alpha',
        from: 1,
        to: 0,
        duration: 100,
      });

      expect(animationManager.isAnimating('test-visual')).toBe(true);

      animationManager.cancelAll('test-visual');

      expect(animationManager.isAnimating('test-visual')).toBe(false);
    });
  });

  describe('isAnimating', () => {
    it('returns true if animation is running', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      expect(animationManager.isAnimating('test-visual', 'rotation')).toBe(
        true,
      );
    });

    it('returns false if no animation is running', () => {
      expect(animationManager.isAnimating('test-visual', 'rotation')).toBe(
        false,
      );
    });

    it('checks any animation type if not specified', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'alpha',
        from: 1,
        to: 0,
        duration: 100,
      });

      expect(animationManager.isAnimating('test-visual')).toBe(true);
    });
  });

  describe('animateFlip', () => {
    it('starts flip-compress animation', () => {
      const onMidpoint = vi.fn();
      const onComplete = vi.fn();

      animationManager.animateFlip('test-visual', onMidpoint, 100, onComplete);

      // Should be animating (isAnimating checks for any scaleX animation including staged)
      expect(animationManager.isAnimating('test-visual')).toBe(true);
    });
  });

  describe('destroy', () => {
    it('stops ticker and clears animations', () => {
      animationManager.animate({
        visualId: 'test-visual',
        type: 'rotation',
        from: 0,
        to: 1,
        duration: 100,
      });

      animationManager.destroy();

      expect(mockApp.ticker.remove).toHaveBeenCalled();
      expect(animationManager.isAnimating('test-visual')).toBe(false);
    });
  });
});

describe('Easing functions', () => {
  it('linear returns input unchanged', () => {
    expect(Easing.linear(0)).toBe(0);
    expect(Easing.linear(0.5)).toBe(0.5);
    expect(Easing.linear(1)).toBe(1);
  });

  it('easeOut returns 0 at start, 1 at end', () => {
    expect(Easing.easeOut(0)).toBe(0);
    expect(Easing.easeOut(1)).toBe(1);
  });

  it('easeIn returns 0 at start, 1 at end', () => {
    expect(Easing.easeIn(0)).toBe(0);
    expect(Easing.easeIn(1)).toBe(1);
  });

  it('easeInOut returns 0 at start, 1 at end', () => {
    expect(Easing.easeInOut(0)).toBe(0);
    expect(Easing.easeInOut(1)).toBe(1);
  });

  it('elastic returns 0 at start, 1 at end', () => {
    expect(Easing.elastic(0)).toBe(0);
    expect(Easing.elastic(1)).toBe(1);
  });
});
