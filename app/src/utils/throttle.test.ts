import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle, AWARENESS_UPDATE_INTERVAL_MS } from './throttle';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call function immediately on first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should throttle multiple calls within interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    throttled('b');
    throttled('c');

    // Only first call executes immediately
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');

    // Advance time to trigger trailing edge
    vi.advanceTimersByTime(100);

    // Trailing edge executes with latest args
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('should use trailing edge with latest arguments', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);
    throttled(4);
    throttled(5);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(100);

    // Should call with the latest argument (5)
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(5);
  });

  it('should respect interval between calls', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50); // Not enough time
    throttled('b');
    expect(fn).toHaveBeenCalledTimes(1); // Still only first call

    vi.advanceTimersByTime(50); // Complete the interval
    expect(fn).toHaveBeenCalledTimes(2); // Trailing edge fires
    expect(fn).toHaveBeenCalledWith('b');

    vi.advanceTimersByTime(100); // Full interval passes
    throttled('c');
    expect(fn).toHaveBeenCalledTimes(3); // Immediate execution
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('should handle cancel method', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    throttled('b');
    throttled('c');

    expect(fn).toHaveBeenCalledTimes(1);

    // Cancel pending execution
    throttled.cancel();

    vi.advanceTimersByTime(200);

    // Should not execute trailing edge after cancel
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should work with multiple arguments', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1, 2, 3);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);

    throttled(4, 5, 6);
    throttled(7, 8, 9);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(7, 8, 9);
  });

  it('should maintain correct timing for awareness updates at 30Hz', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, AWARENESS_UPDATE_INTERVAL_MS);

    // Simulate rapid cursor movement
    for (let i = 0; i < 100; i++) {
      throttled(i, i * 2);
      vi.advanceTimersByTime(10); // 10ms between calls (faster than 30Hz)
    }

    // At 30Hz (33ms interval), 1000ms should have ~30 calls
    // 100 calls * 10ms = 1000ms total
    // Expected calls: ~30 (1000ms / 33ms)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(32);
  });
});
