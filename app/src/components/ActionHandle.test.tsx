import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionHandle } from './ActionHandle';
import type { StackObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';
import type { YjsStore } from '../store/YjsStore';

// Mock isTouchDevice
vi.mock('../utils/detectTouch', () => ({
  isTouchDevice: () => false,
}));

describe('ActionHandle', () => {
  let mockStore: YjsStore;
  let mockActionContext: ActionContext;
  let testStack: StackObject;
  let registry: ActionRegistry;

  // Default screen coordinates for tests
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
      getAllObjects: vi.fn(),
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

  it('should position handle above the object center', () => {
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

    // Should be 20px above top edge: y - height/2 - 20 = 540 - 70 - 20 = 450px
    expect(handle.style.top).toBe('450px');
  });

  // NOTE: Most ActionHandle tests need to be rewritten for the new API.
  // The old tests assumed ActionHandle controlled its own visibility and used
  // selectedObjects + viewport calculations. Now it receives screenCoords from
  // the renderer and visibility is controlled by the parent (Board component).
  //
  // Tests to add:
  // - Keyboard shortcuts (E to expand, Escape to collapse)
  // - Action execution
  // - Expanded/collapsed states
  // - Touch vs desktop behavior
});
