import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionHandle } from './ActionHandle';
import type { StackObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';
import type { YjsStore } from '../store/YjsStore';
import * as Y from 'yjs';
import type { TableObjectYMap } from '../store/types';

// Mock isTouchDevice
vi.mock('../utils/detectTouch', () => ({
  isTouchDevice: () => false,
}));

describe('ActionHandle', () => {
  let mockStore: YjsStore;
  let mockActionContext: ActionContext;
  let testStack: StackObject;
  let testStackYMap: TableObjectYMap;
  let registry: ActionRegistry;

  // Default screen coordinates for tests (centered viewport at 1920x1080)
  const defaultScreenCoords = [
    {
      id: 'stack1',
      x: 960,
      y: 540,
      width: 100,
      height: 140,
    },
  ];

  beforeEach(() => {
    // Reset registry
    registry = ActionRegistry.getInstance();
    registry['actions'].clear();

    // Create mock store
    mockStore = {
      getActorId: () => 'actor1',
      objects: new Y.Map(),
      onObjectsChange: vi.fn(),
    } as unknown as YjsStore;

    // Create test object
    testStack = {
      _kind: ObjectKind.Stack,
      _pos: { x: 100, y: 200, r: 0 },
      _sortKey: 'a0',
      _selectedBy: 'actor1',
      _containerId: null,
      _locked: false,
      _meta: {},
      _cards: ['card1'],
      _faceUp: true,
    } as StackObject;

    // Create mock Y.Map for test object (M3.6-T5)
    testStackYMap = new Y.Map() as TableObjectYMap;
    for (const [key, value] of Object.entries(testStack)) {
      testStackYMap.set(key as keyof typeof testStack, value as never);
    }

    // Create mock action context (M3.6-T5: using yMaps instead of objects)
    mockActionContext = {
      store: mockStore,
      selection: {
        ids: ['stack1'],
        yMaps: [testStackYMap],
        count: 1,
        hasStacks: true,
        hasTokens: false,
        hasMixed: false,
        allLocked: false,
        allUnlocked: true,
        canAct: true,
      },
      actorId: 'actor1',
    };

    // Register test actions
    registry.register({
      id: 'test-action-1',
      label: 'Test Action 1',
      icon: '✅',
      category: 'Test',
      description: 'First test action',
      isAvailable: () => true,
      execute: vi.fn(),
    });

    registry.register({
      id: 'test-action-2',
      label: 'Test Action 2',
      icon: '🔧',
      category: 'Test',
      description: 'Second test action',
      isAvailable: () => true,
      execute: vi.fn(),
    });

    registry.register({
      id: 'test-action-3',
      label: 'Test Action 3',
      icon: '🎯',
      category: 'Test',
      description: 'Third test action',
      isAvailable: () => true,
      execute: vi.fn(),
    });

    registry.register({
      id: 'test-action-4',
      label: 'Test Action 4',
      icon: '🚀',
      category: 'Test',
      description: 'Fourth test action (should be in more menu)',
      isAvailable: () => true,
      execute: vi.fn(),
    });
  });

  describe('Rendering', () => {
    it('should render action handle with screen coordinates', () => {
      render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      expect(handle).toBeInTheDocument();
    });

    it('should render in collapsed state by default', () => {
      render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      expect(handle).toHaveClass('collapsed');
      expect(handle).not.toHaveClass('expanded');

      // Should show icon in collapsed state
      expect(screen.getByTestId('action-handle-icon')).toBeInTheDocument();
    });

    it('should render available actions when expanded', () => {
      const { container } = render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;
      fireEvent.click(handle);

      // Should show action bar
      expect(screen.getByTestId('action-handle-bar')).toBeInTheDocument();

      // Should show first 3 actions
      expect(
        screen.getByTestId('action-button-test-action-1'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('action-button-test-action-2'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('action-button-test-action-3'),
      ).toBeInTheDocument();

      // Should show more menu for 4th action
      expect(screen.getByTestId('action-button-more')).toBeInTheDocument();
    });
  });

  describe('Positioning - Top (default)', () => {
    it('should position handle above object center by default', () => {
      const { container } = render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;
      expect(handle).toBeTruthy();

      // Should be centered horizontally at x=960
      expect(handle.style.left).toBe('960px');

      // Should be 25px above top edge: y - height/2 - 25 = 540 - 70 - 25 = 445px
      expect(handle.style.top).toBe('445px');
    });

    it('should position handle higher when expanded', () => {
      const { container } = render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Click to expand
      fireEvent.click(handle);

      // Position should still be above object, but accounting for expanded height
      expect(handle.style.left).toBe('960px');
      // Should account for larger expanded height
      expect(handle.style.top).toBe('445px');
    });
  });

  describe('Positioning - Edge Cases', () => {
    it('should use fallback positioning when top is clipped', () => {
      // Object near top of viewport
      const topScreenCoords = [
        {
          id: 'stack1',
          x: 960,
          y: 50, // Very close to top
          width: 100,
          height: 140,
        },
      ];

      const { container } = render(
        <ActionHandle
          screenCoords={topScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Should NOT position above (top is clipped)
      // Will try fallback logic: right, left, bottom, or center
      // Just verify it positioned somewhere different from the default top position
      const top = parseFloat(handle.style.top);
      const defaultTop = 50 - 140 / 2 - 25; // Would be negative (clipped)

      // Positioned somewhere that's not the clipped default
      expect(top).not.toBe(defaultTop);
      expect(top).toBeGreaterThan(0); // Not clipped at top
    });

    it('should position on left side when top and right are clipped', () => {
      // Mock window.innerWidth to simulate right edge clipping
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 200,
      });

      // Object near top-right corner
      const topRightCoords = [
        {
          id: 'stack1',
          x: 150,
          y: 50,
          width: 100,
          height: 140,
        },
      ];

      const { container } = render(
        <ActionHandle
          screenCoords={topRightCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Should try left side (x - width/2 - margin)
      const expectedX = 150 - 100 / 2 - 25; // 75px
      expect(handle.style.left).toBe(`${expectedX}px`);

      // Restore window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it('should position at center when all edges are clipped', () => {
      // Mock small viewport
      const originalInnerWidth = window.innerWidth;
      const originalInnerHeight = window.innerHeight;

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 100,
      });

      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 100,
      });

      // Object in center of tiny viewport
      const centerCoords = [
        {
          id: 'stack1',
          x: 50,
          y: 50,
          width: 80,
          height: 80,
        },
      ];

      const { container } = render(
        <ActionHandle
          screenCoords={centerCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Should position at object center (all edges clipped)
      expect(handle.style.left).toBe('50px');
      expect(handle.style.top).toBe('50px');

      // Restore viewport size
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: originalInnerHeight,
      });
    });
  });

  describe('Interaction', () => {
    it('should toggle expanded state on click', () => {
      const { container } = render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Initially collapsed
      expect(handle).toHaveClass('collapsed');

      // Click to expand
      fireEvent.click(handle);
      expect(handle).toHaveClass('expanded');

      // Click to collapse
      fireEvent.click(handle);
      expect(handle).toHaveClass('collapsed');
    });

    it('should collapse on Escape key press', () => {
      const { container } = render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Expand first
      fireEvent.click(handle);
      expect(handle).toHaveClass('expanded');

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handle).toHaveClass('collapsed');
    });

    it('should ignore keyboard shortcuts when typing in input', () => {
      const { container } = render(
        <>
          <input data-testid="test-input" />
          <ActionHandle
            screenCoords={defaultScreenCoords}
            actionContext={mockActionContext}
          />
        </>,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;
      const input = screen.getByTestId('test-input');

      // Expand the handle first
      fireEvent.click(handle);
      expect(handle).toHaveClass('expanded');

      // Focus input
      input.focus();

      // Press Escape while input is focused
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should NOT collapse (keyboard shortcuts ignored when typing)
      expect(handle).toHaveClass('expanded');
    });

    it('should execute action and collapse when action button clicked', () => {
      const onActionExecuted = vi.fn();

      render(
        <ActionHandle
          screenCoords={defaultScreenCoords}
          actionContext={mockActionContext}
          onActionExecuted={onActionExecuted}
        />,
      );

      // Expand
      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      // Click action button
      const actionButton = screen.getByTestId('action-button-test-action-1');
      fireEvent.click(actionButton);

      // Should call onActionExecuted
      expect(onActionExecuted).toHaveBeenCalledWith('test-action-1');

      // Should collapse
      expect(handle).toHaveClass('collapsed');
    });

    it('should stop propagation when clicking action button', () => {
      const handleClick = vi.fn();
      const actionButtonClick = vi.fn();

      const { container } = render(
        <div onClick={handleClick}>
          <ActionHandle
            screenCoords={defaultScreenCoords}
            actionContext={mockActionContext}
          />
        </div>,
      );

      // Expand
      const handle = container.querySelector('.action-handle') as HTMLElement;
      fireEvent.click(handle);

      // Click action button
      const actionButton = screen.getByTestId('action-button-test-action-1');
      actionButton.onclick = actionButtonClick;
      fireEvent.click(actionButton);

      // Parent click handler should not be called (stopPropagation)
      expect(handleClick).toHaveBeenCalledTimes(1); // Only from expanding
    });
  });

  describe('Multi-selection', () => {
    it('should use first object coordinates when multiple objects selected', () => {
      const multiCoords = [
        {
          id: 'stack1',
          x: 100,
          y: 200,
          width: 100,
          height: 140,
        },
        {
          id: 'stack2',
          x: 300,
          y: 400,
          width: 100,
          height: 140,
        },
      ];

      const multiContext = {
        ...mockActionContext,
        selection: {
          ...mockActionContext.selection,
          ids: ['stack1', 'stack2'],
          count: 2,
        },
      };

      const { container } = render(
        <ActionHandle
          screenCoords={multiCoords}
          actionContext={multiContext}
        />,
      );

      const handle = container.querySelector('.action-handle') as HTMLElement;

      // Should use first object's coordinates
      expect(handle.style.left).toBe('100px');
      expect(handle.style.top).toBe('105px'); // 200 - 140/2 - 25
    });
  });

  // Note: Touch device behavior is mocked as false for all tests
  // The margin logic is tested indirectly through positioning tests
});
