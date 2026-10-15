import type { ActionRegistry } from './ActionRegistry';

/**
 * Register peek actions with the ActionRegistry.
 *
 * @returns Cleanup that unregisters the peek actions, for use as an effect
 * cleanup.
 */
export function registerPeekActions(_registry: ActionRegistry): () => void {
  return () => {};
}
