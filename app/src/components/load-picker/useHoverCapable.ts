import { useEffect, useState } from 'react';

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
  // Initialize from the media query if available; otherwise assume not
  // hover-capable. The state is updated lazily — most consumers only need
  // the first render's value, but a user dragging a window between a
  // touch screen and a mouse-driven monitor will see the value flip.
  const [hoverCapable, setHoverCapable] = useState<boolean>(() =>
    readHoverCapable(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    const handler = (e: MediaQueryListEvent) => {
      setHoverCapable(e.matches);
    };
    // Sync once on mount in case the value changed between SSR and hydrate.
    setHoverCapable(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return hoverCapable;
}

function readHoverCapable(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
