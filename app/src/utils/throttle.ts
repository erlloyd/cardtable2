/**
 * Throttle utility for awareness updates (M3-T4)
 *
 * Leading + trailing edge semantics: the first call runs immediately, calls
 * inside the interval collapse into one trailing call with the latest args.
 */

export type ThrottledFunction<T extends (...args: never[]) => void> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
};

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
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  intervalMs: number,
): ThrottledFunction<T> {
  let lastInvokeTime = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Parameters<T> | undefined;

  const invoke = (args: Parameters<T>) => {
    lastInvokeTime = Date.now();
    fn(...args);
  };

  const throttled = (...args: Parameters<T>) => {
    const remaining = intervalMs - (Date.now() - lastInvokeTime);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = undefined;
      pendingArgs = undefined;
      invoke(args);
      return;
    }
    pendingArgs = args;
    timer ??= setTimeout(() => {
      timer = undefined;
      const args = pendingArgs;
      pendingArgs = undefined;
      if (args) invoke(args);
    }, remaining);
  };

  throttled.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
    lastInvokeTime = Number.NEGATIVE_INFINITY;
  };

  return throttled;
}

/**
 * 30Hz throttle interval (33ms)
 * Used for awareness updates (cursor, drag)
 * Provides smooth remote drag/cursor updates with minimal network overhead
 */
export const AWARENESS_UPDATE_INTERVAL_MS = 33;
