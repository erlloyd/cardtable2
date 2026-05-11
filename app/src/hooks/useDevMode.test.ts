import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDevMode, DEV_MODE_STORAGE_KEY } from './useDevMode';

describe('useDevMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts disabled when no persisted value exists', () => {
    const { result } = renderHook(() => useDevMode());
    expect(result.current.enabled).toBe(false);
  });

  it('starts enabled when localStorage has dev-mode persisted', () => {
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDevMode());
    expect(result.current.enabled).toBe(true);
  });

  it('treats non-"true" persisted values as disabled', () => {
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, 'yes');
    const { result } = renderHook(() => useDevMode());
    expect(result.current.enabled).toBe(false);
  });

  it('flips enabled to true and persists when enable() fires', () => {
    const { result } = renderHook(() => useDevMode());
    expect(result.current.enabled).toBe(false);

    act(() => {
      result.current.enable();
    });

    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(DEV_MODE_STORAGE_KEY)).toBe('true');
  });

  it('enable() is idempotent', () => {
    const { result } = renderHook(() => useDevMode());

    act(() => {
      result.current.enable();
      result.current.enable();
    });

    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(DEV_MODE_STORAGE_KEY)).toBe('true');
  });
});
