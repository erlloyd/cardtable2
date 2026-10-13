import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';

function makeContext(actorId: string): ActionContext {
  return { actorId } as unknown as ActionContext;
}

function pressKey(key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

describe('useKeyboardShortcuts', () => {
  const execute = vi.fn();

  beforeEach(() => {
    ActionRegistry.getInstance().register({
      id: 'test-shortcut-action',
      label: 'Test',
      icon: 'T',
      shortcut: 'Q',
      category: 'test',
      isAvailable: () => true,
      execute: (context) => {
        execute(context.actorId);
      },
    });
  });

  afterEach(() => {
    ActionRegistry.getInstance().unregister('test-shortcut-action');
    execute.mockReset();
    vi.restoreAllMocks();
  });

  it('fires the shortcut with the latest context without re-registering the listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { rerender } = renderHook(
      ({ context }) => {
        useKeyboardShortcuts(context);
      },
      { initialProps: { context: makeContext('actor-1') } },
    );

    const keydownAdds = () =>
      addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    expect(keydownAdds()).toBe(1);

    pressKey('q');
    expect(execute).toHaveBeenLastCalledWith('actor-1');

    rerender({ context: makeContext('actor-2') });

    expect(keydownAdds()).toBe(1);
    expect(removeSpy.mock.calls.filter(([t]) => t === 'keydown')).toHaveLength(
      0,
    );

    pressKey('q');
    expect(execute).toHaveBeenLastCalledWith('actor-2');
  });

  it('calls the latest onActionExecuted callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const context = makeContext('actor-1');

    const { rerender } = renderHook(
      ({ cb }) => {
        useKeyboardShortcuts(context, true, cb);
      },
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });
    pressKey('q');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('returns the pending number prefix and clears it after the action key', () => {
    const { result } = renderHook(() => useKeyboardShortcuts(makeContext('a')));
    expect(result.current).toBe('');

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '3',
          code: 'Digit3',
          bubbles: true,
        }),
      );
    });
    expect(result.current).toBe('3');

    act(() => {
      pressKey('q');
    });
    expect(result.current).toBe('');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('cancels the prefix timer on unmount', () => {
    vi.useFakeTimers();
    try {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts(makeContext('a')),
      );
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '3',
            code: 'Digit3',
            bubbles: true,
          }),
        );
      });
      clearSpy.mockClear();
      unmount();
      expect(clearSpy).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not register a listener without a context', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => {
      useKeyboardShortcuts(null);
    });
    expect(addSpy.mock.calls.filter(([t]) => t === 'keydown')).toHaveLength(0);
  });
});
