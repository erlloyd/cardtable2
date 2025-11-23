import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ContextMenu } from './ContextMenu';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { Action, ActionContext } from '../actions/types';
import {
  CARD_ACTIONS,
  SELECTION_ACTIONS,
  VIEW_ACTIONS,
  MANAGEMENT_ACTIONS,
} from '../actions/types';
import type { YjsStore } from '../store/YjsStore';
import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';

describe('ContextMenu', () => {
  let registry: ActionRegistry;
  let mockStore: YjsStore;
  let mockOnClose: () => void;

  beforeEach(() => {
    // Get fresh registry instance and clear it
    registry = ActionRegistry.getInstance();
    registry.clear();

    // Mock store
    mockStore = {
      getActorId: () => 'test-actor',
      getAllObjects: () => new Map(),
    } as unknown as YjsStore;

    // Mock onClose callback
    mockOnClose = vi.fn() as () => void;

    // Mock window dimensions for position adjustment tests
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      const { container } = render(
        <ContextMenu
          isOpen={false}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true', () => {
      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should render backdrop
      expect(
        document.querySelector('[style*="position: fixed"]'),
      ).toBeInTheDocument();
    });

    it('should show "No actions available" when no actions are registered', () => {
      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      expect(screen.getByText('No actions available')).toBeInTheDocument();
    });
  });

  describe('Global Actions (Right-click on board)', () => {
    it('should only show global actions when selection is empty', () => {
      // Register a global action (always available)
      const globalAction: Action = {
        id: 'reset-board',
        label: 'Reset Board',
        icon: '🔄',
        category: MANAGEMENT_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      };

      // Register a card action (requires selection)
      const cardAction: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      registry.register(globalAction);
      registry.register(cardAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should show global action
      expect(screen.getByText('Reset Board')).toBeInTheDocument();

      // Should NOT show card action
      expect(screen.queryByText('Flip Cards')).not.toBeInTheDocument();
    });

    it('should show multiple global actions grouped by category', () => {
      registry.register({
        id: 'reset-board',
        label: 'Reset Board',
        icon: '🔄',
        category: MANAGEMENT_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      });

      registry.register({
        id: 'zoom-fit',
        label: 'Zoom to Fit',
        icon: '🔍',
        category: VIEW_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      });

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should show both actions
      expect(screen.getByText('Reset Board')).toBeInTheDocument();
      expect(screen.getByText('Zoom to Fit')).toBeInTheDocument();

      // Should show category headers
      expect(screen.getByText(MANAGEMENT_ACTIONS)).toBeInTheDocument();
      expect(screen.getByText(VIEW_ACTIONS)).toBeInTheDocument();
    });
  });

  describe('Single Object Selection (Right-click on unselected card)', () => {
    it('should show object-specific actions when one object is selected', () => {
      const stack: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      const flipAction: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: (ctx) =>
          ctx.selection.hasStacks && ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      registry.register(flipAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1'],
          objects: [stack],
          count: 1,
          hasStacks: true,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
        clickedObjectId: 'stack-1',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      expect(screen.getByText('Flip Cards')).toBeInTheDocument();
    });

    it('should not show actions unavailable for single selection', () => {
      const stack: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      // Action that requires multiple selection
      const multiAction: Action = {
        id: 'arrange-grid',
        label: 'Arrange in Grid',
        icon: '📐',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.count > 1,
        execute: vi.fn() as () => void,
      };

      registry.register(multiAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1'],
          objects: [stack],
          count: 1,
          hasStacks: true,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
        clickedObjectId: 'stack-1',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      expect(screen.queryByText('Arrange in Grid')).not.toBeInTheDocument();
    });
  });

  describe('Single Object Already Selected (Right-click on selected card)', () => {
    it('should show actions for already selected object', () => {
      const stack: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      const flipAction: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: (ctx) =>
          ctx.selection.hasStacks && ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      const rotateAction: Action = {
        id: 'rotate-90',
        label: 'Rotate 90°',
        icon: '↻',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      registry.register(flipAction);
      registry.register(rotateAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1'],
          objects: [stack],
          count: 1,
          hasStacks: true,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
        clickedObjectId: 'stack-1',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      expect(screen.getByText('Flip Cards')).toBeInTheDocument();
      expect(screen.getByText('Rotate 90°')).toBeInTheDocument();
    });
  });

  describe('Multiple Objects Selected (Right-click with multiple cards selected)', () => {
    it('should show actions for multiple selected objects', () => {
      const stack1: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      const stack2: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '2000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      const flipAction: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: (ctx) =>
          ctx.selection.hasStacks && ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      const arrangeAction: Action = {
        id: 'arrange-grid',
        label: 'Arrange in Grid',
        icon: '📐',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.count > 1,
        execute: vi.fn() as () => void,
      };

      registry.register(flipAction);
      registry.register(arrangeAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1', 'stack-2'],
          objects: [stack1, stack2],
          count: 2,
          hasStacks: true,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should show both single and multi-selection actions
      expect(screen.getByText('Flip Cards')).toBeInTheDocument();
      expect(screen.getByText('Arrange in Grid')).toBeInTheDocument();
    });

    it('should handle mixed object types in selection', () => {
      const stack: TableObject = {
        _kind: ObjectKind.Stack,
        _containerId: null,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      const token: TableObject = {
        _kind: ObjectKind.Token,
        _containerId: null,
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '2000',
        _locked: false,
        _selectedBy: 'test-actor',
        _meta: {},
      };

      // Action only for stacks
      const flipAction: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: (ctx) =>
          ctx.selection.hasStacks && !ctx.selection.hasMixed,
        execute: vi.fn() as () => void,
      };

      // Action for any object
      const deleteAction: Action = {
        id: 'delete-objects',
        label: 'Delete',
        icon: '🗑️',
        category: SELECTION_ACTIONS,
        isAvailable: (ctx) => ctx.selection.count > 0,
        execute: vi.fn() as () => void,
      };

      registry.register(flipAction);
      registry.register(deleteAction);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1', 'token-1'],
          objects: [stack, token],
          count: 2,
          hasStacks: true,
          hasTokens: true,
          hasMixed: true,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should show delete (works on any object)
      expect(screen.getByText('Delete')).toBeInTheDocument();

      // Should NOT show flip (only for stacks, not mixed)
      expect(screen.queryByText('Flip Cards')).not.toBeInTheDocument();
    });
  });

  describe('Action Execution', () => {
    it('should execute action and close menu when clicked', async () => {
      const user = userEvent.setup();
      const executeMock = vi.fn();

      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '✨',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeMock,
      };

      registry.register(action);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      const button = screen.getByText('Test Action');
      await user.click(button);

      // Should execute action
      await waitFor(() => {
        expect(executeMock).toHaveBeenCalledWith(context);
      });

      // Should close menu
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should handle async action execution', async () => {
      const user = userEvent.setup();
      const executeMock = vi.fn().mockResolvedValue(undefined);

      const action: Action = {
        id: 'async-action',
        label: 'Async Action',
        icon: '⏳',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeMock,
      };

      registry.register(action);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      const button = screen.getByText('Async Action');
      await user.click(button);

      await waitFor(() => {
        expect(executeMock).toHaveBeenCalledWith(context);
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should display keyboard shortcuts for actions', () => {
      const action: Action = {
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        shortcut: 'F',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      };

      registry.register(action);

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should display the shortcut
      expect(screen.getByText('F')).toBeInTheDocument();
    });
  });

  describe('Backdrop Interaction', () => {
    it('should close menu when clicking backdrop', async () => {
      const user = userEvent.setup();

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      const backdrop = document.querySelector('[style*="position: fixed"]');
      expect(backdrop).toBeInTheDocument();

      await user.click(backdrop as Element);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close menu and prevent default on right-click backdrop', async () => {
      const user = userEvent.setup();

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      const backdrop = document.querySelector('[style*="position: fixed"]');
      expect(backdrop).toBeInTheDocument();

      // Simulate right-click (context menu event)
      await user.pointer({
        keys: '[MouseRight]',
        target: backdrop as Element,
      });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Position Adjustment', () => {
    it('should adjust position to stay within viewport bounds', async () => {
      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      // Position near bottom-right edge
      const { container } = render(
        <ContextMenu
          isOpen={true}
          position={{ x: 1900, y: 1060 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Wait for position adjustment effect
      await waitFor(() => {
        const menu = container.querySelector('.context-menu');
        expect(menu).toBeInTheDocument();
      });

      // Menu should be positioned, but exact position depends on menu size
      // We just verify it rendered without errors
      expect(container.querySelector('.context-menu')).toBeInTheDocument();
    });
  });

  describe('Category Grouping', () => {
    it('should group actions by category with dividers', () => {
      registry.register({
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      });

      registry.register({
        id: 'clear-selection',
        label: 'Clear Selection',
        icon: '✖️',
        category: SELECTION_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      });

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Should show category headers
      expect(screen.getByText(CARD_ACTIONS)).toBeInTheDocument();
      expect(screen.getByText(SELECTION_ACTIONS)).toBeInTheDocument();

      // Should have divider between categories
      const divider = document.querySelector('.context-menu-divider');
      expect(divider).toBeInTheDocument();
    });

    it('should not show divider before first category', () => {
      registry.register({
        id: 'flip-cards',
        label: 'Flip Cards',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn() as () => void,
      });

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: [],
          objects: [],
          count: 0,
          hasStacks: false,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
          context={context}
        />,
      );

      // Single category should have no divider
      const dividers = document.querySelectorAll('.context-menu-divider');
      expect(dividers.length).toBe(0);
    });
  });
});
