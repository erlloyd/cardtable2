import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionHandle } from './ActionHandle';
import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';
import type { YjsStore } from '../store/YjsStore';

// Mock isTouchDevice
vi.mock('../utils/detectTouch', () => ({
  isTouchDevice: () => false, // Default to desktop
}));

describe('ActionHandle', () => {
  let mockStore: YjsStore;
  let mockActionContext: ActionContext;
  let testStack: TableObject;
  let registry: ActionRegistry;

  // Default props for tests
  const defaultProps = {
    viewportWidth: 1920,
    viewportHeight: 1080,
    cameraX: 0,
    cameraY: 0,
    cameraScale: 1,
  };

  beforeEach(() => {
    // Reset registry before each test
    registry = ActionRegistry.getInstance();
    registry['actions'].clear();

    // Create mock store
    mockStore = {
      getActorId: () => 'actor1',
      getAllObjects: vi.fn(),
      onObjectsChange: vi.fn(),
    } as unknown as YjsStore;

    // Create test object
    testStack = {
      _kind: ObjectKind.Stack,
      _id: 'stack1',
      _pos: { x: 100, y: 200, r: 0 },
      _sortKey: 'a0',
      _selectedBy: 'actor1',
    };

    // Create mock action context
    mockActionContext = {
      store: mockStore,
      selection: {
        ids: ['stack1'],
        objects: [testStack],
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

    // Register test action
    registry.register({
      id: 'test-action',
      label: 'Test Action',
      icon: '✅',
      category: 'Test',
      description: 'A test action',
      isAvailable: () => true,
      execute: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should be hidden when no objects selected', () => {
      const { container } = render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[]}
          actionContext={null}
          isDragging={false}
          {...defaultProps}
          {...defaultProps}
        />,
      );

      expect(container.querySelector('.action-handle')).not.toBeInTheDocument();
    });

    it('should be visible when objects are selected', () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
          {...defaultProps}
        />,
      );

      expect(screen.getByTestId('action-handle')).toBeInTheDocument();
    });

    it('should be hidden while dragging', () => {
      const { container } = render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={true}
          {...defaultProps}
          {...defaultProps}
        />,
      );

      expect(container.querySelector('.action-handle')).not.toBeInTheDocument();
    });
  });

  describe('Collapsed State', () => {
    it('should start in collapsed state', () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      expect(handle).toHaveClass('collapsed');
      expect(handle).not.toHaveClass('expanded');
      expect(screen.getByTestId('action-handle-icon')).toBeInTheDocument();
    });

    it('should show stack icon for single stack', () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const icon = screen.getByTestId('action-handle-icon');
      expect(icon.textContent).toBe('🎴');
    });

    it('should show token icon for single token', () => {
      const token: TableObject = {
        _kind: ObjectKind.Token,
        _id: 'token1',
        _pos: { x: 100, y: 200 },
        _sortKey: 'a0',
        _selectedBy: 'actor1',
      };

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[token]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const icon = screen.getByTestId('action-handle-icon');
      expect(icon.textContent).toBe('⚫');
    });

    it('should show zone icon for single zone', () => {
      const zone: TableObject = {
        _kind: ObjectKind.Zone,
        _id: 'zone1',
        _pos: { x: 100, y: 200 },
        _sortKey: 'a0',
        _selectedBy: 'actor1',
      };

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[zone]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const icon = screen.getByTestId('action-handle-icon');
      expect(icon.textContent).toBe('▭');
    });

    it('should show count for multiple objects', () => {
      const stack2: TableObject = {
        _kind: ObjectKind.Stack,
        _id: 'stack2',
        _pos: { x: 200, y: 300 },
        _sortKey: 'a1',
        _selectedBy: 'actor1',
      };

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack, stack2]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const icon = screen.getByTestId('action-handle-icon');
      expect(icon.textContent).toBe('2');
    });
  });

  describe('Expanded State', () => {
    it('should expand when clicked', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        expect(handle).toHaveClass('expanded');
        expect(screen.getByTestId('action-handle-bar')).toBeInTheDocument();
      });
    });

    it('should collapse when clicked again', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');

      // Expand
      fireEvent.click(handle);
      await waitFor(() => expect(handle).toHaveClass('expanded'));

      // Collapse
      fireEvent.click(handle);
      await waitFor(() => expect(handle).toHaveClass('collapsed'));
    });

    it('should show action buttons when expanded', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        expect(
          screen.getByTestId('action-button-test-action'),
        ).toBeInTheDocument();
      });
    });

    it('should show up to 3 main actions', async () => {
      // Clear existing test-action first
      registry['actions'].clear();

      // Register 5 actions
      for (let i = 1; i <= 5; i++) {
        registry.register({
          id: `action-${i}`,
          label: `Action ${i}`,
          icon: '✅',
          category: 'Test',
          description: 'Test',
          isAvailable: () => true,
          execute: vi.fn(),
        });
      }

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        // Should show 3 main actions + more button
        expect(
          screen.getByTestId('action-button-action-1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('action-button-action-2'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('action-button-action-3'),
        ).toBeInTheDocument();
        expect(screen.getByTestId('action-button-more')).toBeInTheDocument();
      });
    });

    it('should not show more button when 3 or fewer actions', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        expect(
          screen.queryByTestId('action-button-more'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Action Execution', () => {
    it('should execute action when button clicked', async () => {
      const executeFunc = vi.fn();
      registry['actions'].get('test-action')!.execute = executeFunc;

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      // Expand handle
      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      // Click action button
      await waitFor(() => {
        const actionButton = screen.getByTestId('action-button-test-action');
        fireEvent.click(actionButton);
      });

      expect(executeFunc).toHaveBeenCalledWith(mockActionContext);
    });

    it('should collapse after executing action', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        const actionButton = screen.getByTestId('action-button-test-action');
        fireEvent.click(actionButton);
      });

      await waitFor(() => {
        expect(handle).toHaveClass('collapsed');
      });
    });

    it('should call onActionExecuted callback', async () => {
      const onActionExecuted = vi.fn();

      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
          onActionExecuted={onActionExecuted}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        const actionButton = screen.getByTestId('action-button-test-action');
        fireEvent.click(actionButton);
      });

      expect(onActionExecuted).toHaveBeenCalledWith('test-action');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should toggle expand on E key', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');

      // Press E to expand
      fireEvent.keyDown(window, { key: 'e' });
      await waitFor(() => expect(handle).toHaveClass('expanded'));

      // Press E to collapse
      fireEvent.keyDown(window, { key: 'e' });
      await waitFor(() => expect(handle).toHaveClass('collapsed'));
    });

    it('should collapse on Escape key', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');

      // Expand first
      fireEvent.keyDown(window, { key: 'E' });
      await waitFor(() => expect(handle).toHaveClass('expanded'));

      // Press Escape to collapse
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(handle).toHaveClass('collapsed'));
    });

    it('should not toggle when typing in input', () => {
      render(
        <>
          <input data-testid="test-input" />
          <ActionHandle
            {...defaultProps}
            selectedObjects={[testStack]}
            actionContext={mockActionContext}
            isDragging={false}
            {...defaultProps}
          />
        </>,
      );

      const input = screen.getByTestId('test-input');
      const handle = screen.getByTestId('action-handle');

      // Focus input and press E
      input.focus();
      fireEvent.keyDown(input, { key: 'e' });

      // Should not expand
      expect(handle).toHaveClass('collapsed');
    });

    it('should not toggle when no objects selected', () => {
      const { rerender } = render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      // Clear selection
      rerender(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[]}
          actionContext={null}
          isDragging={false}
          {...defaultProps}
        />,
      );

      // Press E
      fireEvent.keyDown(window, { key: 'e' });

      // Handle should be hidden
      expect(screen.queryByTestId('action-handle')).not.toBeInTheDocument();
    });

    it('should not toggle when dragging', () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={true}
          {...defaultProps}
        />,
      );

      // Press E
      fireEvent.keyDown(window, { key: 'e' });

      // Handle should be hidden
      expect(screen.queryByTestId('action-handle')).not.toBeInTheDocument();
    });
  });

  describe('Touch Device Support', () => {
    it('should have desktop class by default', () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      expect(handle).toHaveClass('desktop');
      expect(handle).not.toHaveClass('touch');
    });

    it('should show action labels on desktop devices', async () => {
      render(
        <ActionHandle
          {...defaultProps}
          selectedObjects={[testStack]}
          actionContext={mockActionContext}
          isDragging={false}
          {...defaultProps}
        />,
      );

      const handle = screen.getByTestId('action-handle');
      fireEvent.click(handle);

      await waitFor(() => {
        const button = screen.getByTestId('action-button-test-action');
        // Desktop shows both icon and label
        expect(button.querySelector('.action-button-icon')).toBeInTheDocument();
        expect(
          button.querySelector('.action-button-label'),
        ).toBeInTheDocument();
      });
    });
  });
});
