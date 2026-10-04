/**
 * Debounce utility for delayed execution (M3.5.1-T6)
 *
 * Ensures a function is only called after a delay has passed with no new calls.
 * Used for zoom-ended messages to wait for wheel events to settle.
 */

export type DebouncedFunction<T extends (...args: never[]) => void> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
};

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
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  };

  return debounced;
}
