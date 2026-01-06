import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { StackBehaviors } from './behaviors';
import { ObjectKind, type StackObject } from '@cardtable2/shared';
import type { RenderContext } from '../types';
import { Text, Container, type TextOptions } from 'pixi.js';
import type { TextureLoader } from '../../services/TextureLoader';

// Helper to create test stack objects with all required properties
function createTestStack(overrides?: Partial<StackObject>): StackObject {
  return {
    _kind: ObjectKind.Stack,
    _pos: { x: 0, y: 0, r: 0 },
    _containerId: null,
    _sortKey: '0',
    _locked: false,
    _selectedBy: null,
    _meta: {},
    _cards: ['card1'],
    _faceUp: true,
    ...overrides,
  };
}

describe('Stack Behaviors - Visual Rendering', () => {
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

    mockScaleStrokeWidth = vi.fn((baseWidth: number) => {
      // Simulate sqrt counter-scaling at 4x zoom
      // baseWidth / sqrt(4) = baseWidth / 2
      return Math.max(0.5, baseWidth / 2);
    });

    mockContext = {
      isSelected: false,
      isHovered: false,
      isDragging: false,
      isStackTarget: false,
      cameraScale: 4.0,
      createText: mockCreateText,
      createKindLabel: mockCreateKindLabel,
      scaleStrokeWidth: mockScaleStrokeWidth,
    } as RenderContext;
  });

  describe('3D Effect Rendering', () => {
    it('renders 3D offset rectangle for stacks with 2+ cards', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      const container = StackBehaviors.render(stack, mockContext);

      expect(container).toBeInstanceOf(Container);
      // 3D effect uses counter-scaled stroke width
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(1);
    });

    it('does not render 3D effect for single-card stacks', () => {
      const singleStack = createTestStack();

      const container = StackBehaviors.render(singleStack, mockContext);

      expect(container).toBeInstanceOf(Container);
      // Single card should call scaleStrokeWidth only once (for main border)
      // Not twice (would include 3D effect)
      const strokeCalls = mockScaleStrokeWidth.mock.calls.length;
      expect(strokeCalls).toBe(1); // Only main card border
    });

    it('3D effect stroke width counter-scales with zoom', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      StackBehaviors.render(stack, mockContext);

      // 3D effect should use 1px base width, counter-scaled
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(1);
    });
  });

  describe('Count Badge Rendering', () => {
    it('renders count badge for stacks with 2+ cards', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      StackBehaviors.render(stack, mockContext);

      // Count badge should create text showing "2"
      expect(mockCreateText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '2',
        }),
      );
    });

    it('does not render count badge for single-card stacks', () => {
      const singleStack = createTestStack();

      StackBehaviors.render(singleStack, mockContext);

      // Count badge text should not be created for single cards
      // But card code text IS created for placeholders via createKindLabel
      expect(mockCreateKindLabel).toHaveBeenCalledOnce();
      expect(mockCreateKindLabel).toHaveBeenCalledWith('card1');
      expect(mockCreateText).not.toHaveBeenCalled();
    });

    it('count badge text uses zoom-aware resolution', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      StackBehaviors.render(stack, mockContext);

      // Verify createText was called (not new Text())
      expect(mockCreateText).toHaveBeenCalled();

      // Verify it was called with text options
      const call = mockCreateText.mock.calls[0];
      expect(call[0]).toHaveProperty('text');
      expect(call[0]).toHaveProperty('style');
    });

    it('count badge displays correct count for large stacks', () => {
      const largeStack = createTestStack({ _cards: Array(52).fill('card') });

      StackBehaviors.render(largeStack, mockContext);

      expect(mockCreateText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '52',
        }),
      );
    });

    it('count badge has counter-scaled stroke width', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      StackBehaviors.render(stack, mockContext);

      // Badge should use 1px base width for its border
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(1);
    });
  });

  describe('Unstack Handle Rendering', () => {
    it('renders unstack handle for stacks with 2+ cards', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      const container = StackBehaviors.render(stack, mockContext);

      // Unstack handle should be rendered as a Graphics child (icon graphics)
      // The container should have children (base graphic + badge text + icon graphics)
      expect(container.children.length).toBeGreaterThan(0);
    });

    it('does not render unstack handle for single-card stacks', () => {
      const singleStack = createTestStack();

      StackBehaviors.render(singleStack, mockContext);

      // Unstack handle text should not be created for single cards
      // But card code text IS created for placeholders via createKindLabel
      expect(mockCreateKindLabel).toHaveBeenCalledOnce();
      expect(mockCreateKindLabel).toHaveBeenCalledWith('card1');
      expect(mockCreateText).not.toHaveBeenCalled();
    });

    it('unstack handle uses zoom-aware stroke scaling', () => {
      const stack = createTestStack({ _cards: ['card1', 'card2'] });

      StackBehaviors.render(stack, mockContext);

      // Verify scaleStrokeWidth was called for the icon strokes
      // The icon has multiple stroke calls (box outline + arrow lines)
      expect(mockScaleStrokeWidth).toHaveBeenCalled();
    });
  });

  describe('Main Card Border', () => {
    it('uses counter-scaled stroke width for unselected cards', () => {
      const stack = createTestStack();

      StackBehaviors.render(stack, {
        ...mockContext,
        isSelected: false,
      });

      // Unselected: 2px base width
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(2);
    });

    it('uses thicker counter-scaled stroke width for selected cards', () => {
      const stack = createTestStack();

      StackBehaviors.render(stack, {
        ...mockContext,
        isSelected: true,
      });

      // Selected: 4px base width
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(4);
    });
  });

  describe('Face-Down State Rendering', () => {
    it('renders diagonal line pattern for face-down stacks', () => {
      const faceDownStack = createTestStack({ _faceUp: false });

      StackBehaviors.render(faceDownStack, mockContext);

      // Face-down pattern uses 2px base width for diagonal lines
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(2);
    });

    it('does not render diagonal pattern for face-up stacks', () => {
      const faceUpStack = createTestStack({ _faceUp: true });

      StackBehaviors.render(faceUpStack, mockContext);

      // Only one stroke call (main border), not two (would include face-down lines)
      const strokeCalls = mockScaleStrokeWidth.mock.calls.filter(
        (call: [number]) => call[0] === 2,
      );
      expect(strokeCalls.length).toBe(1); // Only main border
    });

    it('face-down pattern strokes counter-scale with zoom', () => {
      const faceDownStack = createTestStack({ _faceUp: false });

      StackBehaviors.render(faceDownStack, mockContext);

      // Pattern lines should use scaleStrokeWidth helper
      expect(mockScaleStrokeWidth).toHaveBeenCalledWith(2);
    });
  });

  describe('Complex Scenarios', () => {
    it('renders all visual elements for multi-card face-down stack', () => {
      const complexStack = createTestStack({
        _cards: ['card1', 'card2', 'card3'],
        _faceUp: false,
      });

      mockScaleStrokeWidth.mockClear();
      mockCreateText.mockClear();

      StackBehaviors.render(complexStack, mockContext);

      // Should call scaleStrokeWidth for:
      // 1. 3D effect border (1px)
      // 2. Main card border (2px)
      // 3. Face-down pattern (2px)
      // 4. Badge border (1px)
      // Note: Icon strokes use fixed width (1.5px), not scaled
      expect(mockScaleStrokeWidth).toHaveBeenCalledTimes(4);

      // Should call createKindLabel for:
      // 1. Card code text ("card1") on placeholder
      expect(mockCreateKindLabel).toHaveBeenCalledOnce();
      expect(mockCreateKindLabel).toHaveBeenCalledWith('card1');

      // Should call createText for:
      // 1. Count badge ("3")
      // Note: Unstack handle now uses Graphics instead of text
      expect(mockCreateText).toHaveBeenCalledOnce();
    });

    it('renders minimal visuals for single face-up card', () => {
      const minimalStack = createTestStack({ _faceUp: true });

      mockScaleStrokeWidth.mockClear();
      mockCreateText.mockClear();
      mockCreateKindLabel.mockClear();

      StackBehaviors.render(minimalStack, mockContext);

      // Should only call scaleStrokeWidth once (main border)
      expect(mockScaleStrokeWidth).toHaveBeenCalledTimes(1);

      // Card code text should be created for placeholder via createKindLabel
      expect(mockCreateKindLabel).toHaveBeenCalledOnce();
      expect(mockCreateKindLabel).toHaveBeenCalledWith('card1');
      expect(mockCreateText).not.toHaveBeenCalled();
    });
  });

  describe('getBounds', () => {
    it('returns correct bounds for stack', () => {
      const stack = createTestStack({ _pos: { x: 100, y: 200, r: 0 } });

      const bounds = StackBehaviors.getBounds(stack);

      // STACK_WIDTH = 63, STACK_HEIGHT = 88
      expect(bounds).toEqual({
        minX: 100 - 63 / 2,
        minY: 200 - 88 / 2,
        maxX: 100 + 63 / 2,
        maxY: 200 + 88 / 2,
      });
    });
  });

  describe('getShadowConfig', () => {
    it('returns correct shadow config for stack', () => {
      const stack = createTestStack();

      const shadowConfig = StackBehaviors.getShadowConfig(stack);

      expect(shadowConfig).toEqual({
        width: 63,
        height: 88,
        shape: 'rect',
        borderRadius: 12,
      });
    });
  });

  describe('Image Loading', () => {
    let mockTextureLoader: {
      load: Mock<(url: string) => Promise<{ width: number; height: number }>>;
      get: Mock<(url: string) => { width: number; height: number } | undefined>;
      has: Mock<(url: string) => boolean>;
    };
    let mockTexture: { width: number; height: number };
    let mockOnTextureLoaded: Mock<(url: string) => void>;

    beforeEach(() => {
      mockTexture = { width: 300, height: 420 };
      mockTextureLoader = {
        load: vi.fn().mockResolvedValue(mockTexture),
        get: vi.fn(),
        has: vi.fn(),
      };
      mockOnTextureLoaded = vi.fn();

      mockContext = {
        objectId: 'stack-1',
        isSelected: false,
        isHovered: false,
        isDragging: false,
        isStackTarget: false,
        cameraScale: 1,
        createText: mockCreateText,
        createKindLabel: mockCreateKindLabel,
        scaleStrokeWidth: mockScaleStrokeWidth,
        gameAssets: {
          packs: [],
          cards: {
            'card-1': {
              face: '/api/card-image/pack1/card-1-face.jpg',
              back: '/api/card-image/pack1/card-1-back.jpg',
              type: 'player',
            },
          },
          cardTypes: {
            player: {
              back: '/api/card-image/pack1/player-back.jpg',
            },
          },
          cardSets: {},
          tokens: {},
          counters: {},
          mats: {},
        },
        textureLoader: mockTextureLoader as unknown as TextureLoader,
        onTextureLoaded: mockOnTextureLoaded,
      } as RenderContext;
    });

    it('should render sprite when texture is cached (face-up)', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      mockTextureLoader.get.mockReturnValue(mockTexture);

      // Act
      const visual = StackBehaviors.render(stack, mockContext);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).toHaveBeenCalledWith(
        '/api/card-image/pack1/card-1-face.jpg',
      );
      expect(mockTextureLoader.load).not.toHaveBeenCalled(); // Should use cached texture
    });

    it('should render sprite when texture is cached (face-down with card back)', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: false });
      mockTextureLoader.get.mockReturnValue(mockTexture);

      // Act
      const visual = StackBehaviors.render(stack, mockContext);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).toHaveBeenCalledWith(
        '/api/card-image/pack1/card-1-back.jpg',
      );
    });

    it('should render sprite when texture is cached (face-down with type back)', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: false });
      // Create new context with card back removed to test type fallback
      const contextWithoutCardBack = {
        ...mockContext,
        gameAssets: {
          ...mockContext.gameAssets!,
          cards: {
            'card-1': {
              face: '/api/card-image/pack1/card-1-face.jpg',
              type: 'player',
            },
          },
        },
      } as RenderContext;
      mockTextureLoader.get.mockReturnValue(mockTexture);

      // Act
      const visual = StackBehaviors.render(stack, contextWithoutCardBack);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).toHaveBeenCalledWith(
        '/api/card-image/pack1/player-back.jpg',
      );
    });

    it('should render placeholder when texture not cached', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      mockTextureLoader.get.mockReturnValue(undefined); // Not cached

      // Act
      const visual = StackBehaviors.render(stack, mockContext);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).toHaveBeenCalledWith(
        '/api/card-image/pack1/card-1-face.jpg',
      );
      // Visual should still be created with placeholder graphics
      expect(visual.children.length).toBeGreaterThan(0);
    });

    it('should trigger async load when texture not cached', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      mockTextureLoader.get.mockReturnValue(undefined);

      // Act
      StackBehaviors.render(stack, mockContext);

      // Assert
      expect(mockTextureLoader.load).toHaveBeenCalledWith(
        '/api/card-image/pack1/card-1-face.jpg',
      );
    });

    it('should call onTextureLoaded callback when texture loads', async () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      mockTextureLoader.get.mockReturnValue(undefined);

      // Act
      StackBehaviors.render(stack, mockContext);

      // Wait for async texture load to complete
      await vi.waitFor(() => {
        expect(mockOnTextureLoaded).toHaveBeenCalledWith(
          '/api/card-image/pack1/card-1-face.jpg',
        );
      });
    });

    it('should handle missing gameAssets gracefully', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      const contextWithoutAssets = {
        ...mockContext,
        gameAssets: undefined,
      } as RenderContext;

      // Act
      const visual = StackBehaviors.render(stack, contextWithoutAssets);

      // Assert - Should render placeholder without crashing
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).not.toHaveBeenCalled();
      expect(mockTextureLoader.load).not.toHaveBeenCalled();
    });

    it('should handle missing card definition gracefully', () => {
      // Arrange
      const stack = createTestStack({
        _cards: ['unknown-card'],
        _faceUp: true,
      });

      // Act
      const visual = StackBehaviors.render(stack, mockContext);

      // Assert - Should render placeholder without crashing
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).not.toHaveBeenCalled();
      expect(mockTextureLoader.load).not.toHaveBeenCalled();
    });

    it('should handle texture load failure gracefully', async () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      mockTextureLoader.get.mockReturnValue(undefined);
      mockTextureLoader.load.mockRejectedValue(new Error('Network error'));

      // Act
      StackBehaviors.render(stack, mockContext);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - Should not call onTextureLoaded on error
      expect(mockOnTextureLoaded).not.toHaveBeenCalled();
    });

    it('should not trigger load if no textureLoader provided', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      const contextWithoutLoader = {
        ...mockContext,
        textureLoader: undefined,
      } as RenderContext;

      // Act
      const visual = StackBehaviors.render(stack, contextWithoutLoader);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.load).not.toHaveBeenCalled();
    });

    it('should not trigger load if no onTextureLoaded callback provided', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: true });
      const contextWithoutCallback = {
        ...mockContext,
        onTextureLoaded: undefined,
      } as RenderContext;
      mockTextureLoader.get.mockReturnValue(undefined);

      // Act
      const visual = StackBehaviors.render(stack, contextWithoutCallback);

      // Assert
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.load).not.toHaveBeenCalled();
    });

    it('should handle empty cards array', () => {
      // Arrange
      const stack = createTestStack({ _cards: [], _faceUp: true });

      // Act
      const visual = StackBehaviors.render(stack, mockContext);

      // Assert - Should render placeholder without crashing
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).not.toHaveBeenCalled();
    });

    it('should handle missing back image gracefully', () => {
      // Arrange
      const stack = createTestStack({ _cards: ['card-1'], _faceUp: false });
      // Create context without back images
      const contextWithoutBacks = {
        ...mockContext,
        gameAssets: {
          ...mockContext.gameAssets!,
          cards: {
            'card-1': {
              face: '/api/card-image/pack1/card-1-face.jpg',
              type: 'player',
            },
          },
          cardTypes: {},
        },
      } as RenderContext;

      // Act
      const visual = StackBehaviors.render(stack, contextWithoutBacks);

      // Assert - Should render placeholder
      expect(visual).toBeInstanceOf(Container);
      expect(mockTextureLoader.get).not.toHaveBeenCalled();
      expect(mockTextureLoader.load).not.toHaveBeenCalled();
    });
  });

  describe('capabilities', () => {
    it('has correct capability flags', () => {
      expect(StackBehaviors.capabilities).toEqual({
        canFlip: true,
        canRotate: true,
        canStack: true,
        canUnstack: true,
        canLock: true,
      });
    });
  });
});
