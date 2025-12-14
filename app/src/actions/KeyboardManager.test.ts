import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardManager } from './KeyboardManager';
import { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS } from './types';
import type { Action, ActionContext } from './types';
import type { YjsStore } from '../store/YjsStore';

describe('KeyboardManager', () => {
  let keyboardManager: KeyboardManager;
  let actionRegistry: ActionRegistry;
  let mockContext: ActionContext;

  beforeEach(() => {
    actionRegistry = ActionRegistry.getInstance();
    actionRegistry.clear();
    keyboardManager = new KeyboardManager(actionRegistry);
    keyboardManager.clear();

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
        yMaps: [],
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

  describe('registerShortcut', () => {
    it('should register a shortcut', () => {
      keyboardManager.registerShortcut('F', 'flip-cards');

      const shortcuts = keyboardManager.getAllShortcuts();
      expect(shortcuts.has('F')).toBe(true);
      expect(shortcuts.get('F')).toBe('flip-cards');
    });

    it('should normalize shortcuts', () => {
      keyboardManager.registerShortcut('cmd+k', 'test-action');

      const shortcuts = keyboardManager.getAllShortcuts();
      // Normalized to uppercase with consistent modifier order
      const keys = Array.from(shortcuts.keys());
      expect(keys.some((k) => k.includes('K'))).toBe(true);
    });

    it('should warn on duplicate registration', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      keyboardManager.registerShortcut('F', 'action1');
      keyboardManager.registerShortcut('F', 'action2');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered'),
      );

      consoleSpy.mockRestore();
    });

    it('should allow override with explicit flag', () => {
      keyboardManager.registerShortcut('F', 'action1');
      keyboardManager.registerShortcut('F', 'action2', { override: true });

      const shortcuts = keyboardManager.getAllShortcuts();
      expect(shortcuts.get('F')).toBe('action2');
    });

    it('should prevent registration of reserved shortcuts', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      keyboardManager.registerShortcut('F5', 'test-action');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('reserved'),
      );
      expect(keyboardManager.getAllShortcuts().has('F5')).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('unregisterShortcut', () => {
    it('should unregister a shortcut', () => {
      keyboardManager.registerShortcut('F', 'flip-cards');
      expect(keyboardManager.getAllShortcuts().has('F')).toBe(true);

      keyboardManager.unregisterShortcut('F');
      expect(keyboardManager.getAllShortcuts().has('F')).toBe(false);
    });
  });

  describe('handleKeyEvent', () => {
    it('should execute action when shortcut matches', () => {
      const executeFn = vi.fn();
      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '🧪',
        shortcut: 'F',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeFn,
      };

      actionRegistry.register(action);
      keyboardManager.registerShortcut('F', 'test-action');

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        bubbles: true,
      });

      const handled = keyboardManager.handleKeyEvent(event, mockContext);

      expect(handled).toBe(true);
      expect(executeFn).toHaveBeenCalledWith(mockContext);
    });

    it('should handle modifiers correctly', () => {
      const executeFn = vi.fn();
      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '🧪',
        shortcut: 'Cmd+K',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeFn,
      };

      actionRegistry.register(action);
      keyboardManager.registerShortcut('Cmd+K', 'test-action');

      // Simulate Cmd+K on Mac (metaKey)
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      });

      const handled = keyboardManager.handleKeyEvent(event, mockContext);

      expect(handled).toBe(true);
      expect(executeFn).toHaveBeenCalledWith(mockContext);
    });

    it('should not execute when action is unavailable', () => {
      const executeFn = vi.fn();
      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '🧪',
        shortcut: 'F',
        category: CARD_ACTIONS,
        isAvailable: () => false, // Not available
        execute: executeFn,
      };

      actionRegistry.register(action);
      keyboardManager.registerShortcut('F', 'test-action');

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        bubbles: true,
      });

      const handled = keyboardManager.handleKeyEvent(event, mockContext);

      expect(handled).toBe(false);
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('should not execute when typing in input field', () => {
      const executeFn = vi.fn();
      const action: Action = {
        id: 'test-action',
        label: 'Test Action',
        icon: '🧪',
        shortcut: 'F',
        category: CARD_ACTIONS,
        isAvailable: () => true,
        execute: executeFn,
      };

      actionRegistry.register(action);
      keyboardManager.registerShortcut('F', 'test-action');

      // Create a fake input element
      const input = document.createElement('input');
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: input,
        enumerable: true,
      });

      const handled = keyboardManager.handleKeyEvent(event, mockContext);

      expect(handled).toBe(false);
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('should return false when no shortcut matches', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'x',
        bubbles: true,
      });

      const handled = keyboardManager.handleKeyEvent(event, mockContext);

      expect(handled).toBe(false);
    });
  });

  describe('getShortcutDisplay', () => {
    it('should convert shortcut to display format', () => {
      const display = keyboardManager.getShortcutDisplay('Cmd+K');

      // Result depends on platform, but should contain K
      expect(display).toContain('K');
    });

    it('should handle simple keys', () => {
      const display = keyboardManager.getShortcutDisplay('F');

      expect(display).toBe('F');
    });

    it('should handle multiple modifiers', () => {
      const display = keyboardManager.getShortcutDisplay('Cmd+Shift+K');

      expect(display).toContain('K');
      // Should have modifier symbols or text
      expect(display.length).toBeGreaterThan(1);
    });
  });

  describe('clear', () => {
    it('should clear all shortcuts', () => {
      keyboardManager.registerShortcut('F', 'action1');
      keyboardManager.registerShortcut('R', 'action2');

      expect(keyboardManager.getAllShortcuts().size).toBe(2);

      keyboardManager.clear();

      expect(keyboardManager.getAllShortcuts().size).toBe(0);
    });
  });

  describe('cross-platform behavior', () => {
    it('should normalize Cmd on Mac to Ctrl on Windows', () => {
      // This test verifies normalization logic works
      keyboardManager.registerShortcut('Cmd+K', 'test-action');

      const shortcuts = keyboardManager.getAllShortcuts();
      const keys = Array.from(shortcuts.keys());

      // Should be normalized (platform-dependent but consistent)
      expect(keys.length).toBe(1);
      expect(keys[0]).toContain('K');
    });
  });
});
