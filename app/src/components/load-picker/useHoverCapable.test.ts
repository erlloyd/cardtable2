import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHoverCapable } from './useHoverCapable';

interface MqlMock {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

/**
 * Build a controllable matchMedia mock. Returns the MQL stub so tests
 * can fire its 'change' listener and toggle `matches` mid-flight to
 * verify the hook reacts to capability changes.
 */
function setupMatchMedia(initialMatches: boolean): MqlMock {
  const mql: MqlMock = {
    matches: initialMatches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockImplementation((q: string) => {
    mql.media = q;
    return mql;
  });
  return mql;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useHoverCapable', () => {
  it('returns true when the media query matches', () => {
    setupMatchMedia(true);
    const { result } = renderHook(() => useHoverCapable());
    expect(result.current).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    setupMatchMedia(false);
    const { result } = renderHook(() => useHoverCapable());
    expect(result.current).toBe(false);
  });

  it('reactively updates when the media query changes', () => {
    const mql = setupMatchMedia(false);
    const { result } = renderHook(() => useHoverCapable());
    expect(result.current).toBe(false);

    // Find the change handler the hook subscribed with.
    expect(mql.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    const changeHandler = mql.addEventListener.mock.calls[0][1] as (
      e: MediaQueryListEvent,
    ) => void;

    act(() => {
      changeHandler({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);

    act(() => {
      changeHandler({ matches: false } as MediaQueryListEvent);
    });
    expect(result.current).toBe(false);
  });

  it('returns false defensively when matchMedia is unavailable', () => {
    // Some non-browser environments (older jsdom without polyfill, SSR)
    // lack matchMedia. The hook should not throw, and defaulting to
    // touch (false) gives a usable modal instead of an orphan popover.
    const original = window.matchMedia;
    // Casting to never lets us delete on the typed window without
    // disabling no-explicit-any; we restore in afterEach.
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia =
      undefined;
    const { result } = renderHook(() => useHoverCapable());
    expect(result.current).toBe(false);
    window.matchMedia = original;
  });

  it('cleans up the change listener on unmount', () => {
    const mql = setupMatchMedia(true);
    const { unmount } = renderHook(() => useHoverCapable());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });
});
