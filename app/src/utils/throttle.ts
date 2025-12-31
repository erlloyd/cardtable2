/**
 * Throttle utility for awareness updates (M3-T4)
 *
 * Re-exports lodash-es throttle with trailing edge semantics.
 * Previously used a custom implementation that had a race condition
 * between cancel() and setTimeout callbacks.
 */

import { throttle as lodashThrottle, type DebouncedFunc } from 'lodash-es';

/**
 * Type for throttled functions with cancel method
 * (lodash's DebouncedFunc includes cancel and flush methods)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function signature requires any for proper type inference
export type ThrottledFunction<T extends (...args: any[]) => void> =
  DebouncedFunc<T>;

/**
 * Throttle a function to be called at most once per interval
 *
 * @param fn - Function to throttle
 * @param intervalMs - Minimum time between calls in milliseconds
 * @returns Throttled function
 *
 * @example
 * const throttledUpdate = throttle((x, y) => {
 *   store.setCursor(x, y);
 * }, 33); // 30Hz
 *
 * // Call many times rapidly
 * throttledUpdate(100, 200);
 * throttledUpdate(101, 201);
 * throttledUpdate(102, 202);
 * // Only executes once per 33ms with the latest values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function signature requires any for proper type inference
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
): ThrottledFunction<T> {
  // Use lodash throttle with trailing edge (default behavior)
  // This ensures the latest value is always sent
  return lodashThrottle(fn, intervalMs, {
    leading: true,
    trailing: true,
  });
}

/**
 * 30Hz throttle interval (33ms)
 * Used for awareness updates (cursor, drag)
 * Provides smooth remote drag/cursor updates with minimal network overhead
 */
export const AWARENESS_UPDATE_INTERVAL_MS = 33;
