/**
 * Debounce utility for delayed execution (M3.5.1-T6)
 *
 * Ensures a function is only called after a delay has passed with no new calls.
 * Used for zoom-ended messages to wait for wheel events to settle.
 */

/**
 * Debounce a function to be called only after a delay has passed with no new calls
 *
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds before executing
 * @returns Debounced function with cancel method
 *
 * @example
 * const debouncedSave = debounce(() => {
 *   saveData();
 * }, 300);
 *
 * // Call many times rapidly
 * debouncedSave(); // Cancels previous timer
 * debouncedSave(); // Cancels previous timer
 * debouncedSave(); // Executes after 300ms of inactivity
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function signature requires any for proper type inference
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserving original function's this context
  const debounced = function (this: any, ...args: Parameters<T>) {
    // Clear existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, delayMs);
  } as T & { cancel: () => void };

  // Add cancel method to clear pending timeout
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
