import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardState } from './useBoardState';

describe('useBoardState', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.messages).toEqual([]);
    expect(result.current.debugCoords).toBeNull();
    expect(result.current.isCameraActive).toBe(false);
    expect(result.current.isWaitingForCoords).toBe(false);
    expect(result.current.interactionMode).toBe('pan');
    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.awarenessHz).toBe(0);
    expect(result.current.isSynced).toBe(false);
  });

  it('manages messages array', () => {
    const { result } = renderHook(() => useBoardState());

    act(() => {
      result.current.addMessage('Test message 1');
    });

    expect(result.current.messages).toEqual(['Test message 1']);

    act(() => {
      result.current.addMessage('Test message 2');
    });

    expect(result.current.messages).toEqual([
      'Test message 1',
      'Test message 2',
    ]);
  });

  it('manages debug coords', () => {
    const { result } = renderHook(() => useBoardState());

    const coords = [
      { id: 'obj1', x: 10, y: 20, width: 100, height: 150 },
      { id: 'obj2', x: 30, y: 40, width: 120, height: 180 },
    ];

    act(() => {
      result.current.setDebugCoords(coords);
    });

    expect(result.current.debugCoords).toEqual(coords);

    act(() => {
      result.current.setDebugCoords(null);
    });

    expect(result.current.debugCoords).toBeNull();
  });

  it('manages camera active state', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.isCameraActive).toBe(false);

    act(() => {
      result.current.setIsCameraActive(true);
    });

    expect(result.current.isCameraActive).toBe(true);

    act(() => {
      result.current.setIsCameraActive(false);
    });

    expect(result.current.isCameraActive).toBe(false);
  });

  it('manages waiting for coords state', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.isWaitingForCoords).toBe(false);

    act(() => {
      result.current.setIsWaitingForCoords(true);
    });

    expect(result.current.isWaitingForCoords).toBe(true);

    act(() => {
      result.current.setIsWaitingForCoords(false);
    });

    expect(result.current.isWaitingForCoords).toBe(false);
  });

  it('uses external interaction mode when provided', () => {
    const { result } = renderHook(() => useBoardState('select'));

    expect(result.current.interactionMode).toBe('select');
  });

  it('uses internal interaction mode when external not provided', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.interactionMode).toBe('pan');

    act(() => {
      result.current.setInteractionMode('select');
    });

    expect(result.current.interactionMode).toBe('select');
  });

  it('calls external callback when interaction mode changes', () => {
    const onInteractionModeChange = vi.fn();
    const { result } = renderHook(() =>
      useBoardState('pan', onInteractionModeChange),
    );

    act(() => {
      result.current.setInteractionMode('select');
    });

    expect(onInteractionModeChange).toHaveBeenCalledWith('select');
  });

  it('uses external multi-select mode when provided', () => {
    const { result } = renderHook(() =>
      useBoardState(undefined, undefined, true),
    );

    expect(result.current.isMultiSelectMode).toBe(true);
  });

  it('uses internal multi-select mode when external not provided', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.isMultiSelectMode).toBe(false);

    act(() => {
      result.current.setIsMultiSelectMode(true);
    });

    expect(result.current.isMultiSelectMode).toBe(true);
  });

  it('calls external callback when multi-select mode changes', () => {
    const onMultiSelectModeChange = vi.fn();
    const { result } = renderHook(() =>
      useBoardState(undefined, undefined, false, onMultiSelectModeChange),
    );

    act(() => {
      result.current.setIsMultiSelectMode(true);
    });

    expect(onMultiSelectModeChange).toHaveBeenCalledWith(true);
  });

  it('manages awareness Hz', () => {
    const { result } = renderHook(() => useBoardState());

    expect(result.current.awarenessHz).toBe(0);

    act(() => {
      result.current.setAwarenessHz(30);
    });

    expect(result.current.awarenessHz).toBe(30);
  });
});
