import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnimationManager } from '../../managers/AnimationManager';
import { Application, Container } from 'pixi.js';
import { animateShuffleBurstBackgroundWobble } from './burst-background-wobble';
import { animateShuffleWobble } from './wobble';

describe('Shuffle Animation Lifecycle', () => {
  let animationManager: AnimationManager;
  let mockApp: Application;
  let mockVisuals: Map<string, Container>;
  let mockVisual: Container;
  let addedChildren: Container[];
  let removedChildren: Container[];

  beforeEach(() => {
    animationManager = new AnimationManager();
    addedChildren = [];
    removedChildren = [];

    // Mock PixiJS Application with ticker
    mockApp = {
      ticker: {
        add: vi.fn(),
        remove: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        started: false,
      },
      renderer: {
        render: vi.fn(),
      },
      stage: {},
    } as unknown as Application;

    // Mock visual container with child management tracking
    mockVisual = {
      x: 0,
      y: 0,
      rotation: 0,
      alpha: 1,
      scale: { x: 1, y: 1, set: vi.fn() },
      addChild: vi.fn((child: Container) => {
        addedChildren.push(child);
        return child;
      }),
      addChildAt: vi.fn((child: Container, _index: number) => {
        addedChildren.push(child);
        return child;
      }),
      removeChild: vi.fn((child: Container) => {
        removedChildren.push(child);
        return child;
      }),
      getChildByLabel: vi.fn((label: string) => {
        // Mock background-3d for burst animations
        if (label === 'background-3d') {
          return { x: 0, y: 0 } as Container;
        }
        // Mock ghost verification
        if (label === 'shuffle-ghost-1' || label === 'shuffle-ghost-2') {
          return addedChildren.find(
            (child) => (child as { label?: string }).label === label,
          );
        }
        return undefined;
      }),
    } as unknown as Container;

    mockVisuals = new Map([['test-visual', mockVisual]]);

    animationManager.initialize(mockApp, mockVisuals);
  });

  afterEach(() => {
    vi.clearAllMocks();
    addedChildren = [];
    removedChildren = [];
  });

  describe('Burst Background Wobble Animation', () => {
    it('should create ghost rectangles when background exists', () => {
      animateShuffleBurstBackgroundWobble(
        animationManager,
        'test-visual',
        mockVisuals,
        400,
      );

      // Should have attempted to create 2 ghost rectangles
      expect(mockVisual.addChildAt).toHaveBeenCalledTimes(2);
      expect(addedChildren.length).toBe(2);
    });

    it('should start animations for rotation and scale', () => {
      animateShuffleBurstBackgroundWobble(
        animationManager,
        'test-visual',
        mockVisuals,
        400,
      );

      // Should be animating the visual
      expect(animationManager.isAnimating('test-visual')).toBe(true);
    });

    it('should handle missing visual gracefully', () => {
      const completeSpy = vi.fn();

      animateShuffleBurstBackgroundWobble(
        animationManager,
        'nonexistent-visual',
        mockVisuals,
        400,
        completeSpy,
      );

      // Should call onComplete even when visual doesn't exist
      expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    it('should not create ghosts when background-3d is missing', () => {
      // Mock visual without background-3d
      (mockVisual.getChildByLabel as ReturnType<typeof vi.fn>).mockReturnValue(
        undefined,
      );

      animateShuffleBurstBackgroundWobble(
        animationManager,
        'test-visual',
        mockVisuals,
        400,
      );

      // Should not attempt to create ghost rectangles
      expect(addedChildren.length).toBe(0);

      // But should still animate the wobble
      expect(animationManager.isAnimating('test-visual')).toBe(true);
    });

    it('should handle ghost creation failure gracefully', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Make addChildAt throw
      (mockVisual.addChildAt as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('addChildAt failed');
        },
      );

      const completeSpy = vi.fn();

      // Should not throw and should continue with wobble animation
      expect(() => {
        animateShuffleBurstBackgroundWobble(
          animationManager,
          'test-visual',
          mockVisuals,
          400,
          completeSpy,
        );
      }).not.toThrow();

      // Should log error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create ghost rectangles'),
        expect.any(Object),
      );

      // Should still be animating (wobble continues without ghosts)
      expect(animationManager.isAnimating('test-visual')).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Wobble Animation', () => {
    it('should start animations for rotation and scale', () => {
      animateShuffleWobble(animationManager, 'test-visual', mockVisuals, 360);

      // Should be animating the visual
      expect(animationManager.isAnimating('test-visual')).toBe(true);
    });

    it('should handle missing visual gracefully', () => {
      const completeSpy = vi.fn();

      animateShuffleWobble(
        animationManager,
        'nonexistent-visual',
        mockVisuals,
        360,
        completeSpy,
      );

      // Should call onComplete even when visual doesn't exist
      expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    it('should start ticker', () => {
      animateShuffleWobble(animationManager, 'test-visual', mockVisuals, 360);

      expect(mockApp.ticker.add).toHaveBeenCalled();
      expect(mockApp.ticker.start).toHaveBeenCalled();
    });
  });

  describe('Animation Lifecycle', () => {
    it('should stop ticker when no animations remain (tested via AnimationManager.cancel)', () => {
      animateShuffleBurstBackgroundWobble(
        animationManager,
        'test-visual',
        mockVisuals,
        400,
      );

      // Cancel all animations
      animationManager.cancelAll('test-visual');

      // Ticker should be removed (see AnimationManager.test.ts for comprehensive ticker tests)
      expect(mockApp.ticker.remove).toHaveBeenCalled();
    });

    it('should track animation state correctly', () => {
      animateShuffleBurstBackgroundWobble(
        animationManager,
        'test-visual',
        mockVisuals,
        400,
      );

      // Should be animating
      expect(animationManager.isAnimating('test-visual')).toBe(true);

      // Cancel and verify state cleared
      animationManager.cancelAll('test-visual');
      expect(animationManager.isAnimating('test-visual')).toBe(false);
    });
  });
});
