import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { GridSnapManager } from './GridSnapManager';
import type { SceneManager } from '../SceneManager';
import { ObjectKind } from '@cardtable2/shared';
import type { VisualManager } from './VisualManager';

// Mock getBehaviors
vi.mock('../objects', () => ({
  getBehaviors: vi.fn((kind: ObjectKind) => {
    if (kind === ObjectKind.Stack) {
      return {
        render: vi.fn(() => {
          const graphic = new Container();
          return graphic;
        }),
      };
    }
    return undefined;
  }),
}));

describe('GridSnapManager', () => {
  let manager: GridSnapManager;
  let parentContainer: Container;
  let worldContainer: Container;
  let mockSceneManager: SceneManager;
  let mockVisualManager: VisualManager;

  beforeEach(() => {
    manager = new GridSnapManager();
    parentContainer = new Container();
    worldContainer = new Container();

    // Mock scene manager
    mockSceneManager = {
      getObject: vi.fn((id: string) => {
        if (id === 'valid-id') {
          return {
            _kind: ObjectKind.Stack,
            _pos: { x: 100, y: 100, r: 0 },
            _containerId: 'container-1',
            _sortKey: '0',
            _locked: false,
            _selectedBy: null,
            _meta: {},
          };
        }
        return undefined;
      }),
    } as unknown as SceneManager;

    // Mock visual manager
    mockVisualManager = {
      createText: vi.fn(
        (options: import('pixi.js').TextOptions) => new Text(options),
      ),
      createKindLabel: vi.fn((text: string) => {
        const label = new Text({ text });
        label.anchor.set(0.5);
        return label;
      }),
    } as unknown as VisualManager;
  });

  describe('Initialization', () => {
    it('initializes ghost container and attaches to parent', () => {
      manager.initialize(parentContainer);

      expect(parentContainer.children.length).toBe(1);
      expect(parentContainer.children[0]).toBeInstanceOf(Container);
    });

    it('logs initialization success', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      manager.initialize(parentContainer);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GridSnapManager] ✓ Ghost container initialized',
      );
    });
  });

  describe('renderSnapGhosts', () => {
    beforeEach(() => {
      manager.initialize(parentContainer);
    });

    it('warns if ghost container not initialized', () => {
      const uninitializedManager = new GridSnapManager();
      const consoleSpy = vi.spyOn(console, 'warn');

      uninitializedManager.renderSnapGhosts(
        [],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ghost container not initialized'),
      );
    });

    it('creates ghost for valid object', () => {
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      // Ghost container should have one child (the ghost)
      const ghostContainer = parentContainer.children[0] as Container;
      expect(ghostContainer.children.length).toBe(1);
    });

    it('warns when object not found in scene', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      manager.renderSnapGhosts(
        [{ id: 'invalid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Object not found in scene'),
      );
    });

    it('errors when behaviors not found for object kind', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      // Mock getObject to return object with unknown kind
      mockSceneManager.getObject = vi.fn(() => ({
        _kind: 'unknown-kind' as ObjectKind,
        _pos: { x: 0, y: 0, r: 0 },
        _containerId: 'container-1',
        _sortKey: '0',
        _locked: false,
        _selectedBy: null,
        _meta: {},
      }));

      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No behaviors registered for kind'),
      );
    });

    it('reuses existing ghosts instead of creating new ones', () => {
      // First render - creates ghost
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const initialChildCount = ghostContainer.children.length;

      // Second render - should reuse ghost
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 100, y: 100, r: 45 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(ghostContainer.children.length).toBe(initialChildCount);
    });

    it('updates ghost position on subsequent renders', () => {
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const ghost = ghostContainer.children[0] as Container;
      const initialX = ghost.x;

      // Move world container and update ghost
      worldContainer.position.set(50, 50);
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 100, y: 100, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(ghost.x).not.toBe(initialX);
    });

    it('converts rotation from degrees to radians', () => {
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 90 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const ghost = ghostContainer.children[0] as Container;

      // 90 degrees = PI/2 radians
      expect(ghost.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('applies camera scale to ghost position and scale', () => {
      const cameraScale = 2.0;
      const snappedPos = { x: 100, y: 100, r: 0 };

      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos }],
        mockSceneManager,
        cameraScale,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const ghost = ghostContainer.children[0] as Container;

      expect(ghost.scale.x).toBe(cameraScale);
      expect(ghost.scale.y).toBe(cameraScale);
    });

    it('removes ghosts for objects no longer being dragged', () => {
      // First render with two objects
      manager.renderSnapGhosts(
        [
          { id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } },
          { id: 'valid-id-2', snappedPos: { x: 100, y: 100, r: 0 } },
        ],
        {
          ...mockSceneManager,
          getObject: vi.fn((id: string) => {
            if (id === 'valid-id' || id === 'valid-id-2') {
              return {
                _kind: ObjectKind.Stack,
                _pos: { x: 100, y: 100, r: 0 },
                _containerId: 'container-1',
                _sortKey: '0',
                _locked: false,
                _selectedBy: null,
                _meta: {},
              };
            }
            return undefined;
          }),
        } as unknown as SceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      expect(ghostContainer.children.length).toBe(2);

      // Second render with only one object
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(ghostContainer.children.length).toBe(1);
    });

    it('handles multiple objects with different kinds', () => {
      mockSceneManager.getObject = vi.fn((id: string) => {
        if (id === 'stack-id') {
          return {
            _kind: ObjectKind.Stack,
            _pos: { x: 0, y: 0, r: 0 },
            _containerId: 'container-1',
            _sortKey: '0',
            _locked: false,
            _selectedBy: null,
            _meta: {},
          };
        }
        if (id === 'token-id') {
          return {
            _kind: ObjectKind.Token,
            _pos: { x: 100, y: 100, r: 0 },
            _containerId: 'container-1',
            _sortKey: '0',
            _locked: false,
            _selectedBy: null,
            _meta: {},
          };
        }
        return undefined;
      });

      manager.renderSnapGhosts(
        [
          { id: 'stack-id', snappedPos: { x: 0, y: 0, r: 0 } },
          { id: 'token-id', snappedPos: { x: 100, y: 100, r: 0 } },
        ],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      // Stack should render, token should error (no behaviors in mock)
      expect(ghostContainer.children.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clearGhosts', () => {
    beforeEach(() => {
      manager.initialize(parentContainer);
    });

    it('removes all ghosts from container', () => {
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      expect(ghostContainer.children.length).toBeGreaterThan(0);

      manager.clearGhosts();
      expect(ghostContainer.children.length).toBe(0);
    });

    it('is safe to call multiple times', () => {
      manager.clearGhosts();
      manager.clearGhosts();
      manager.clearGhosts();

      const ghostContainer = parentContainer.children[0] as Container;
      expect(ghostContainer.children.length).toBe(0);
    });

    it('is safe to call before initialization', () => {
      const uninitializedManager = new GridSnapManager();
      expect(() => uninitializedManager.clearGhosts()).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    beforeEach(() => {
      manager.initialize(parentContainer);
    });

    it('destroys ghost graphics when cleared', () => {
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const ghost = ghostContainer.children[0] as Container;
      const destroySpy = vi.spyOn(ghost, 'destroy');

      manager.clearGhosts();
      expect(destroySpy).toHaveBeenCalledWith({ children: true });
    });

    it('destroys removed ghosts when object set changes', () => {
      // Create two ghosts
      manager.renderSnapGhosts(
        [
          { id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } },
          { id: 'valid-id-2', snappedPos: { x: 100, y: 100, r: 0 } },
        ],
        {
          ...mockSceneManager,
          getObject: vi.fn((id: string) => {
            if (id === 'valid-id' || id === 'valid-id-2') {
              return {
                _kind: ObjectKind.Stack,
                _pos: { x: 100, y: 100, r: 0 },
                _containerId: 'container-1',
                _sortKey: '0',
                _locked: false,
                _selectedBy: null,
                _meta: {},
              };
            }
            return undefined;
          }),
        } as unknown as SceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      const ghostContainer = parentContainer.children[0] as Container;
      const removedGhost = ghostContainer.children[1] as Container;
      const destroySpy = vi.spyOn(removedGhost, 'destroy');

      // Render with only one object - should destroy the second ghost
      manager.renderSnapGhosts(
        [{ id: 'valid-id', snappedPos: { x: 0, y: 0, r: 0 } }],
        mockSceneManager,
        1.0,
        worldContainer,
        mockVisualManager,
      );

      expect(destroySpy).toHaveBeenCalledWith({ children: true });
    });
  });
});
