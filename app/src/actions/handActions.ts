import { ObjectKind } from '@cardtable2/shared';
import type { ActionRegistry } from './ActionRegistry';
import { HAND_ACTIONS } from './types';
import { moveCardToHand } from '../store/YjsHandActions';

/**
 * Register hand-related actions with the ActionRegistry.
 *
 * Called when the table route mounts or when hand state changes.
 */
export function registerHandActions(registry: ActionRegistry): void {
  // Clear any previously registered hand actions
  registry.unregister('add-to-hand');

  registry.register({
    id: 'add-to-hand',
    label: (ctx) => {
      if (!ctx.activeHandId) return 'Add to Hand';
      const name = ctx.store.getHandName(ctx.activeHandId);
      return name ? `Add to Hand (${name})` : 'Add to Hand';
    },
    shortLabel: 'To Hand',
    icon: '✋',
    shortcut: 'A',
    category: HAND_ACTIONS,
    description: 'Move the top card of selected stack(s) to your hand',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: (ctx) => {
      let handId = ctx.activeHandId;

      // Auto-create a hand if none exists
      if (!handId) {
        const existingIds = ctx.store.getHandIds();
        if (existingIds.length > 0) {
          handId = existingIds[0];
        } else {
          handId = ctx.store.createHand('Hand 1');
        }
      }

      // Move top card from each selected stack to hand
      for (const stackId of ctx.selection.ids) {
        const yMap = ctx.store.getObjectYMap(stackId);
        if (!yMap) continue;
        const kind = yMap.get('_kind');
        if (kind !== ObjectKind.Stack) continue;

        moveCardToHand(ctx.store, stackId, 0, handId);
      }
    },
  });
}
