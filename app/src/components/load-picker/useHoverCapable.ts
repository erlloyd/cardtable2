import { useSyncExternalStore } from 'react';

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Reactive `(hover: hover) and (pointer: fine)` media-query check.
 *
 * Returns `true` on devices where the primary pointer can hover with fine
 * precision (typical desktop mouse / trackpad). Returns `false` on
 * touch-primary devices (most phones / tablets) where hover is unreliable
 * and tap is the right interaction.
 *
 * Used by the load picker to choose between a hover popover (desktop) and
 * a full-screen modal (touch) for the card-image preview affordance
 * (ct-87o). Picker rows are visible on both — only the activation
 * mechanism switches.
 *
 * Defensive against `matchMedia` being absent (older jsdom in unit tests
 * without an explicit polyfill, server-side render): returns `false`,
 * which gives the touch-style modal — safer default than a phantom
 * popover with no way to dismiss.
 */
export function useHoverCapable(): boolean {
  return useSyncExternalStore(
    subscribeHoverCapable,
    readHoverCapable,
    () => false,
  );
}

function subscribeHoverCapable(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(HOVER_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function readHoverCapable(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(HOVER_QUERY).matches;
}
