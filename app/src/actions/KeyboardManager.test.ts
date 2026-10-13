import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
        hasCounters: false,
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

    it('should execute when the keydown target is window (no tagName)', () => {
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

      let handled: boolean | undefined;
      const listener = (event: KeyboardEvent) => {
        handled = keyboardManager.handleKeyEvent(event, mockContext);
      };
      window.addEventListener('keydown', listener);
      try {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
      } finally {
        window.removeEventListener('keydown', listener);
      }

      expect(handled).toBe(true);
      expect(executeFn).toHaveBeenCalledWith(mockContext);
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

  describe('numeric prefix', () => {
    const executeD = vi.fn<(context: ActionContext) => void>();
    const executeF = vi.fn<(context: ActionContext) => void>();
    let fAvailable = true;
    let onPrefix: ReturnType<typeof vi.fn<(prefix: string) => void>>;

    function key(
      k: string,
      init: KeyboardEventInit = {},
      target?: HTMLElement,
    ): KeyboardEvent {
      const code = /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`;
      const event = new KeyboardEvent('keydown', {
        key: k,
        code,
        cancelable: true,
        ...init,
      });
      if (target) {
        Object.defineProperty(event, 'target', { value: target });
      }
      return event;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      executeD.mockReset();
      executeF.mockReset();
      fAvailable = true;
      actionRegistry.register({
        id: 'draw-test',
        label: 'D',
        icon: 'D',
        shortcut: 'D',
        category: 'test',
        isAvailable: () => true,
        execute: executeD,
      });
      actionRegistry.register({
        id: 'flip-test',
        label: 'F',
        icon: 'F',
        shortcut: 'F',
        category: 'test',
        isAvailable: () => fAvailable,
        execute: executeF,
      });
      actionRegistry.register({
        id: 'shift-one-test',
        label: 'S1',
        icon: '1',
        shortcut: 'Shift+1',
        category: 'test',
        isAvailable: () => true,
        execute: vi.fn(),
      });
      onPrefix = vi.fn<(prefix: string) => void>();
      keyboardManager.setOnPrefixChange(onPrefix);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('passes the typed number to the executed action and clears the prefix', () => {
      expect(keyboardManager.handleKeyEvent(key('3'), mockContext)).toBe(true);
      expect(onPrefix).toHaveBeenLastCalledWith('3');

      expect(keyboardManager.handleKeyEvent(key('d'), mockContext)).toBe(true);

      expect(executeD).toHaveBeenCalledTimes(1);
      expect(executeD.mock.calls[0][0]).toMatchObject({ numericPrefix: 3 });
      expect(onPrefix).toHaveBeenLastCalledWith('');
    });

    it('accumulates multiple digits', () => {
      keyboardManager.handleKeyEvent(key('1'), mockContext);
      keyboardManager.handleKeyEvent(key('2'), mockContext);
      keyboardManager.handleKeyEvent(key('d'), mockContext);

      expect(executeD.mock.calls[0][0]).toMatchObject({ numericPrefix: 12 });
    });

    it('does not start a prefix with 0 but accepts it after another digit', () => {
      expect(keyboardManager.handleKeyEvent(key('0'), mockContext)).toBe(false);
      expect(onPrefix).not.toHaveBeenCalled();

      keyboardManager.handleKeyEvent(key('1'), mockContext);
      keyboardManager.handleKeyEvent(key('0'), mockContext);
      keyboardManager.handleKeyEvent(key('d'), mockContext);

      expect(executeD.mock.calls[0][0]).toMatchObject({ numericPrefix: 10 });
    });

    it('ignores digits with modifiers and still runs Shift+1', () => {
      const shiftOne = vi.fn();
      actionRegistry.unregister('shift-one-test');
      actionRegistry.register({
        id: 'shift-one-test',
        label: 'S1',
        icon: '1',
        shortcut: 'Shift+1',
        category: 'test',
        isAvailable: () => true,
        execute: shiftOne,
      });

      expect(
        keyboardManager.handleKeyEvent(
          key('1', { shiftKey: true }),
          mockContext,
        ),
      ).toBe(true);
      expect(shiftOne).toHaveBeenCalledTimes(1);

      for (const init of [
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true },
      ]) {
        keyboardManager.handleKeyEvent(key('2', init), mockContext);
      }
      expect(onPrefix).not.toHaveBeenCalled();
    });

    it('ignores digits typed into an input', () => {
      const input = document.createElement('input');

      expect(
        keyboardManager.handleKeyEvent(key('3', {}, input), mockContext),
      ).toBe(false);
      expect(onPrefix).not.toHaveBeenCalled();
    });

    it('keeps the prefix across a Shift-only keydown and passes it to a non-draw action', () => {
      keyboardManager.handleKeyEvent(key('3'), mockContext);
      expect(
        keyboardManager.handleKeyEvent(
          key('Shift', { shiftKey: true }),
          mockContext,
        ),
      ).toBe(false);
      expect(onPrefix).toHaveBeenLastCalledWith('3');

      keyboardManager.handleKeyEvent(key('f'), mockContext);

      expect(executeF).toHaveBeenCalledTimes(1);
      expect(executeF.mock.calls[0][0]).toMatchObject({ numericPrefix: 3 });
      expect(onPrefix).toHaveBeenLastCalledWith('');
    });

    it('clears the prefix on an unbound key', () => {
      keyboardManager.handleKeyEvent(key('3'), mockContext);

      expect(keyboardManager.handleKeyEvent(key('x'), mockContext)).toBe(false);
      expect(onPrefix).toHaveBeenLastCalledWith('');
    });

    it('clears the prefix without executing when the action is unavailable', () => {
      fAvailable = false;
      keyboardManager.handleKeyEvent(key('3'), mockContext);

      expect(keyboardManager.handleKeyEvent(key('f'), mockContext)).toBe(false);
      expect(executeF).not.toHaveBeenCalled();
      expect(onPrefix).toHaveBeenLastCalledWith('');
    });

    it('clears the prefix after 2 seconds', () => {
      keyboardManager.handleKeyEvent(key('3'), mockContext);

      vi.advanceTimersByTime(1999);
      expect(onPrefix).toHaveBeenLastCalledWith('3');
      vi.advanceTimersByTime(1);
      expect(onPrefix).toHaveBeenLastCalledWith('');
    });

    it('leaves numericPrefix undefined when no number was typed', () => {
      keyboardManager.handleKeyEvent(key('d'), mockContext);

      expect(executeD.mock.calls[0][0].numericPrefix).toBeUndefined();
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
