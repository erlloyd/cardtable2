import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExternalResource } from './useExternalResource';

describe('useExternalResource', () => {
  it('exposes the created resource and disposes it on unmount', () => {
    const dispose = vi.fn();
    const resource = { id: 1 };
    const create = vi.fn(() => ({ value: resource, dispose }));

    const { result, unmount } = renderHook(() => useExternalResource(create));

    expect(result.current).toBe(resource);
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('replaces the resource when create changes', () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const createA = () => ({ value: 'a', dispose: disposeA });
    const createB = () => ({ value: 'b', dispose: disposeB });

    const { result, rerender } = renderHook(
      ({ create }) => useExternalResource(create),
      { initialProps: { create: createA } },
    );
    expect(result.current).toBe('a');

    rerender({ create: createB });
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('b');
  });
});
