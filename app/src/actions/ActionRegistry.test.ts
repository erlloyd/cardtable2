import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS, SELECTION_ACTIONS } from './types';
import type { Action, ActionContext } from './types';
import type { YjsStore } from '../store/YjsStore';

describe('ActionRegistry', () => {
  let registry: ActionRegistry;
  let mockContext: ActionContext;

  beforeEach(() => {
    registry = ActionRegistry.getInstance();
    registry.clear(); // Clear between tests

    // Mock YjsStore for testing
    const getAllObjects = vi.fn(() => new Map<string, unknown>());

    const getObject = vi.fn((_id: string) => undefined);

    const mockStore = {
      getAllObjects,
      getObject,
    } as unknown as YjsStore;

    // Mock action context
    mockContext = {
      store: mockStore,
      selection: {
        ids: ['obj1'],
        objects: [],
        count: 1,
        hasStacks: true,
        hasTokens: false,
        hasMixed: false,
        allLocked: false,
        allUnlocked: true,
        canAct: true,
      },
      actorId: 'test-actor',
    };
  });

  describe('register', () => {
    it('should register an action', () => {
      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '🔄',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action);

      expect(registry.getAction('test-action')).toBe(action);
      expect(registry.size).toBe(1);
    });

    it('should warn when registering duplicate action', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const action1: Action = {
        id: 'duplicate',
        label: 'First',
        icon: '1',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      const action2: Action = {
        id: 'duplicate',
        label: 'Second',
        icon: '2',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action1);
      registry.register(action2);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered'),
      );
      expect(registry.getAction('duplicate')).toBe(action2); // Second one overwrites

      consoleSpy.mockRestore();
    });
  });

  describe('unregister', () => {
    it('should unregister an action', () => {
      const action: Action = {
        id: 'to-remove',
        label: 'Remove Me',
        icon: '❌',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action);
      expect(registry.size).toBe(1);

      registry.unregister('to-remove');
      expect(registry.size).toBe(0);
      expect(registry.getAction('to-remove')).toBeUndefined();
    });

    it('should handle unregistering non-existent action', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('getAction', () => {
    it('should return action by id', () => {
      const action: Action = {
        id: 'find-me',
        label: 'Find Me',
        icon: '🔍',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action);

      expect(registry.getAction('find-me')).toBe(action);
    });

    it('should return undefined for non-existent action', () => {
      expect(registry.getAction('non-existent')).toBeUndefined();
    });
  });

  describe('getAvailableActions', () => {
    it('should return only available actions', () => {
      const availableAction: Action = {
        id: 'available',
        label: 'Available',
        icon: '✅',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.hasStacks,
        execute: vi.fn(),
      };

      const unavailableAction: Action = {
        id: 'unavailable',
        label: 'Unavailable',
        icon: '❌',
        category: CARD_ACTIONS,
        isAvailable: (ctx) => ctx.selection.hasTokens,
        execute: vi.fn(),
      };

      registry.register(availableAction);
      registry.register(unavailableAction);

      const available = registry.getAvailableActions(mockContext);

      expect(available).toHaveLength(1);
      expect(available[0]).toBe(availableAction);
    });

    it('should return empty array when no actions available', () => {
      const action: Action = {
        id: 'never-available',
        label: 'Never Available',
        icon: '🚫',
        category: CARD_ACTIONS,
        isAvailable: () => false,
        execute: vi.fn(),
      };

      registry.register(action);

      expect(registry.getAvailableActions(mockContext)).toHaveLength(0);
    });
  });

  describe('getActionsByCategory', () => {
    it('should return actions filtered by category', () => {
      const cardAction: Action = {
        id: 'card-action',
        label: 'Card Action',
        icon: '🃏',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      const selectionAction: Action = {
        id: 'selection-action',
        label: 'Selection Action',
        icon: '🎯',
        category: SELECTION_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(cardAction);
      registry.register(selectionAction);

      const cardActions = registry.getActionsByCategory(CARD_ACTIONS);
      const selectionActions = registry.getActionsByCategory(SELECTION_ACTIONS);

      expect(cardActions).toHaveLength(1);
      expect(cardActions[0]).toBe(cardAction);
      expect(selectionActions).toHaveLength(1);
      expect(selectionActions[0]).toBe(selectionAction);
    });

    it('should return empty array for category with no actions', () => {
      expect(registry.getActionsByCategory('non-existent')).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should execute an available action', async () => {
      const executeFn = vi.fn();
      const action: Action = {
        id: 'executable',
        label: 'Executable',
        icon: '▶️',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeFn,
      };

      registry.register(action);
      await registry.execute('executable', mockContext);

      expect(executeFn).toHaveBeenCalledWith(mockContext);
    });

    it('should throw error when action not found', async () => {
      await expect(
        registry.execute('non-existent', mockContext),
      ).rejects.toThrow('not found');
    });

    it('should throw error when action not available', async () => {
      const action: Action = {
        id: 'unavailable',
        label: 'Unavailable',
        icon: '🚫',
        category: CARD_ACTIONS,
        isAvailable: () => false,
        execute: vi.fn(),
      };

      registry.register(action);

      await expect(
        registry.execute('unavailable', mockContext),
      ).rejects.toThrow('not available');
    });

    it('should handle async action executors', async () => {
      const executeFn = vi.fn().mockResolvedValue(undefined);
      const action: Action = {
        id: 'async-action',
        label: 'Async Action',
        icon: '⏳',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeFn,
      };

      registry.register(action);
      await registry.execute('async-action', mockContext);

      expect(executeFn).toHaveBeenCalledWith(mockContext);
    });
  });

  describe('getAllActions', () => {
    it('should return all registered actions', () => {
      const action1: Action = {
        id: 'action1',
        label: 'Action 1',
        icon: '1',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      const action2: Action = {
        id: 'action2',
        label: 'Action 2',
        icon: '2',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action1);
      registry.register(action2);

      const all = registry.getAllActions();
      expect(all).toHaveLength(2);
      expect(all).toContain(action1);
      expect(all).toContain(action2);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = ActionRegistry.getInstance();
      const instance2 = ActionRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('clear', () => {
    it('should clear all actions', () => {
      const action: Action = {
        id: 'test',
        label: 'Test',
        icon: '🧪',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: vi.fn(),
      };

      registry.register(action);
      expect(registry.size).toBe(1);

      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getAction('test')).toBeUndefined();
    });
  });
});
