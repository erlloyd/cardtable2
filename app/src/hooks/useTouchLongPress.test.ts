import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LONG_PRESS_MS, useTouchLongPress } from './useTouchLongPress';
import type { PointerEventHandlers } from './usePointerEvents';

function touch(
  pointerId: number,
  clientX: number,
  clientY: number,
  isPrimary = true,
): React.PointerEvent {
  return {
    pointerId,
    pointerType: 'touch',
    clientX,
    clientY,
    isPrimary,
  } as unknown as React.PointerEvent;
}

describe('useTouchLongPress', () => {
  const base: PointerEventHandlers = {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onPointerLeave: vi.fn(),
  };
  const onLongPress = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function setup() {
    return renderHook(() => useTouchLongPress(base, onLongPress)).result;
  }

  it('fires after the hold, cancelling the renderer pointer and swallowing the rest of the touch', () => {
    const result = setup();
    const down = touch(1, 100, 200);

    act(() => result.current.handlers.onPointerDown(down));
    expect(base.onPointerDown).toHaveBeenCalledWith(down);

    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });

    expect(base.onPointerCancel).toHaveBeenCalledWith(down);
    expect(onLongPress).toHaveBeenCalledWith(100, 200);

    act(() => result.current.handlers.onPointerMove(touch(1, 101, 200)));
    act(() => result.current.handlers.onPointerUp(touch(1, 101, 200)));
    expect(base.onPointerMove).not.toHaveBeenCalled();
    expect(base.onPointerUp).not.toHaveBeenCalled();
  });

  it('swallows the click synthesized when the long-press finger lifts, but not later clicks', () => {
    const result = setup();
    const onClick = vi.fn();
    document.addEventListener('click', onClick);

    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    act(() => result.current.handlers.onPointerUp(touch(1, 10, 10)));

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    document.removeEventListener('click', onClick);
  });

  it('does not fire on a short tap', () => {
    const result = setup();
    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 100);
    });
    act(() => result.current.handlers.onPointerUp(touch(1, 10, 10)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(base.onPointerUp).toHaveBeenCalled();
  });

  it('does not fire when the pointer moves past the slop', () => {
    const result = setup();
    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));
    act(() => result.current.handlers.onPointerMove(touch(1, 60, 10)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(base.onPointerMove).toHaveBeenCalled();
  });

  it('does not fire when a second touch starts', () => {
    const result = setup();
    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));
    act(() => result.current.handlers.onPointerDown(touch(2, 80, 80, false)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores mouse pointers', () => {
    const result = setup();
    const mouseDown = {
      ...touch(1, 10, 10),
      pointerType: 'mouse',
    } as unknown as React.PointerEvent;
    act(() => result.current.handlers.onPointerDown(mouseDown));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses the native contextmenu that follows a fired long-press', () => {
    const result = setup();
    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });

    expect(result.current.consumeNativeContextMenu()).toBe(true);
  });

  it('lets a native contextmenu win when it arrives first, cancelling the timer', () => {
    const result = setup();
    act(() => result.current.handlers.onPointerDown(touch(1, 10, 10)));

    expect(result.current.consumeNativeContextMenu()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
