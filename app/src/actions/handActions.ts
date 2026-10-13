import { ObjectKind } from '@cardtable2/shared';
import type { ActionRegistry } from './ActionRegistry';
import { HAND_ACTIONS, type ActionContext } from './types';
import { drawCardsToHand, drawCardsToTable } from '../store/YjsDrawActions';

function handLabel(base: string, ctx: ActionContext): string {
  if (!ctx.activeHandId) return base;
  const name = ctx.store.getHandName(ctx.activeHandId);
  return name ? `${base} (${name})` : base;
}

function resolveHandId(ctx: ActionContext): string {
  if (ctx.activeHandId) return ctx.activeHandId;
  const existingIds = ctx.store.getHandIds();
  return existingIds.length > 0
    ? existingIds[0]
    : ctx.store.createHand('Hand 1');
}

/**
 * Run `draw` once per selected stack inside a single transaction. `draw`
 * receives the stack id and the stack's own card count.
 */
function drawFromSelectedStacks(
  ctx: ActionContext,
  draw: (stackId: string, stackSize: number) => void,
): void {
  ctx.store.getDoc().transact(() => {
    for (const stackId of ctx.selection.ids) {
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap || yMap.get('_kind') !== ObjectKind.Stack) continue;
      draw(stackId, yMap.get('_cards')?.length ?? 0);
    }
  });
}

const hasSelectedStacks = (ctx: ActionContext): boolean =>
  ctx.selection.count > 0 && ctx.selection.hasStacks;

/**
 * Register hand-related actions with the ActionRegistry.
 *
 * Called when the table route mounts or when hand state changes.
 *
 * @returns Cleanup that unregisters the hand actions, for use as an effect
 * cleanup.
 */
export function registerHandActions(registry: ActionRegistry): () => void {
  registry.register({
    id: 'draw-to-hand',
    label: (ctx) => handLabel('Draw to Hand', ctx),
    shortLabel: 'To Hand',
    icon: '✋',
    shortcut: 'D',
    category: HAND_ACTIONS,
    description:
      'Move the top card (or N cards, if a number was typed first) of selected stack(s) to your hand',
    isAvailable: hasSelectedStacks,
    execute: (ctx) => {
      const handId = resolveHandId(ctx);
      const count = ctx.numericPrefix ?? 1;
      drawFromSelectedStacks(ctx, (stackId) =>
        drawCardsToHand(ctx.store, stackId, count, handId),
      );
    },
  });

  registry.register({
    id: 'draw-to-table',
    label: 'Draw to Table',
    shortLabel: 'To Table',
    icon: '🃏',
    shortcut: 'T',
    category: HAND_ACTIONS,
    description:
      'Place the top card (or N cards, if a number was typed first) of selected stack(s) on the table below the stack',
    isAvailable: hasSelectedStacks,
    execute: (ctx) => {
      const count = ctx.numericPrefix ?? 1;
      drawFromSelectedStacks(ctx, (stackId) =>
        drawCardsToTable(ctx.store, stackId, count),
      );
    },
  });

  registry.register({
    id: 'draw-all-to-hand',
    label: (ctx) => handLabel('Draw All to Hand', ctx),
    shortLabel: 'All to Hand',
    icon: '✋',
    shortcut: 'Shift+D',
    category: HAND_ACTIONS,
    description: 'Move every card of selected stack(s) to your hand',
    isAvailable: hasSelectedStacks,
    execute: (ctx) => {
      const handId = resolveHandId(ctx);
      drawFromSelectedStacks(ctx, (stackId, size) =>
        drawCardsToHand(ctx.store, stackId, size, handId),
      );
    },
  });

  registry.register({
    id: 'draw-all-to-table',
    label: 'Draw All to Table',
    shortLabel: 'All to Table',
    icon: '🃏',
    shortcut: 'Shift+T',
    category: HAND_ACTIONS,
    description:
      'Place every card of selected stack(s) on the table below the stack',
    isAvailable: hasSelectedStacks,
    execute: (ctx) => {
      drawFromSelectedStacks(ctx, (stackId, size) =>
        drawCardsToTable(ctx.store, stackId, size),
      );
    },
  });

  return () => {
    registry.unregister('draw-to-hand');
    registry.unregister('draw-to-table');
    registry.unregister('draw-all-to-hand');
    registry.unregister('draw-all-to-table');
  };
}
