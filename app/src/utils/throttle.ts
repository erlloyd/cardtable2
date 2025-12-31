/**
 * Throttle utility for awareness updates (M3-T4)
 *
 * Ensures a function is called at most once per interval (e.g., 30Hz = 33ms).
 * Uses trailing edge execution to ensure the latest value is always sent.
 */

/**
 * Type for throttled functions with cancel method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function signature requires any for proper type inference
export type ThrottledFunction<T extends (...args: any[]) => void> = T & {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function signature requires any for proper type inference
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
): ThrottledFunction<T> {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserving original function's this context
  const throttled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    // Store the latest arguments
    pendingArgs = args;

    if (timeSinceLastCall >= intervalMs) {
      // Enough time has passed, execute immediately
      lastCallTime = now;
      pendingArgs = null;
      fn.apply(this, args);
    } else {
      // Schedule execution with latest args at the end of the interval
      if (timeoutId === null) {
        const remainingTime = intervalMs - timeSinceLastCall;
        timeoutId = setTimeout(() => {
          lastCallTime = Date.now();
          const argsToUse = pendingArgs;
          pendingArgs = null;
          timeoutId = null;

          // Only execute if we have args (cancel() may have cleared them)
          if (argsToUse) {
            fn.apply(this, argsToUse);
          }
        }, remainingTime);
      }
      // If timeout already scheduled, pendingArgs will be used (trailing edge)
    }
  } as T & { cancel: () => void };

  // Add cancel method to clear pending timeouts
  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      pendingArgs = null;
    }
  };

  return throttled;
}

/**
 * 30Hz throttle interval (33ms)
 * Used for awareness updates (cursor, drag)
 * Provides smooth remote drag/cursor updates with minimal network overhead
 */
export const AWARENESS_UPDATE_INTERVAL_MS = 33;
