/**
 * Detects if the device is a touch-capable device.
 *
 * This uses a multi-pronged approach for maximum reliability:
 * 1. navigator.maxTouchPoints: Most reliable modern API (Chrome, Firefox, Safari)
 * 2. 'ontouchstart' in window: Fallback for older browsers
 * 3. navigator.msMaxTouchPoints: Legacy IE/Edge support
 *
 * Note: This detects touch *capability*, not whether touch is currently being used.
 * Modern laptops with touchscreens will return true, which is correct behavior.
 *
 * Based on Mozilla's recommendation and widely used in production apps.
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
 */
export function isTouchDevice(): boolean {
  // Primary check: navigator.maxTouchPoints (most reliable, widely supported)
  if ('maxTouchPoints' in navigator) {
    return navigator.maxTouchPoints > 0;
  }

  // Fallback 1: Check for touch event support
  if ('ontouchstart' in window) {
    return true;
  }

  // Fallback 2: Legacy IE/Edge support
  if ('msMaxTouchPoints' in navigator) {
    return (navigator as { msMaxTouchPoints?: number }).msMaxTouchPoints! > 0;
  }

  // No touch support detected
  return false;
}
