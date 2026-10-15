import { ObjectKind } from '@cardtable2/shared';
import type { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS, type ActionContext } from './types';

const DEFAULT_PEEK_COUNT = 3;
const PEEK_VARIANT_COUNTS = [1, 3, 5, 10] as const;

function isAvailable(ctx: ActionContext): boolean {
  if (
    ctx.selection.count !== 1 ||
    !ctx.selection.hasStacks ||
    !ctx.onOpenPeek
  ) {
    return false;
  }
  const yMap = ctx.store.getObjectYMap(ctx.selection.ids[0]);
  if (!yMap || yMap.get('_kind') !== ObjectKind.Stack) return false;
  return (yMap.get('_cards')?.length ?? 0) >= 1;
}

/**
 * Register peek actions with the ActionRegistry.
 *
 * @returns Cleanup that unregisters the peek actions, for use as an effect
 * cleanup.
 */
export function registerPeekActions(registry: ActionRegistry): () => void {
  registry.register({
    id: 'peek-stack',
    label: 'Peek',
    shortLabel: 'Peek',
    icon: '👀',
    shortcut: 'P',
    noRepeat: true,
    category: CARD_ACTIONS,
    description:
      'Look at the top cards of the stack and reorder them (type a number before P for N; default 3)',
    isAvailable,
    execute: (ctx) => {
      ctx.onOpenPeek?.(
        ctx.selection.ids[0],
        ctx.numericPrefix ?? DEFAULT_PEEK_COUNT,
      );
    },
    variants: [
      ...PEEK_VARIANT_COUNTS.map((n) => ({
        id: `top-${n}`,
        label: `Top ${n}`,
        execute: (ctx: ActionContext) => {
          ctx.onOpenPeek?.(ctx.selection.ids[0], n);
        },
      })),
      {
        id: 'custom',
        label: 'Custom…',
        execute: (ctx: ActionContext) => {
          ctx.onOpenPeek?.(ctx.selection.ids[0], DEFAULT_PEEK_COUNT, {
            focusCount: true,
          });
        },
      },
    ],
  });

  return () => {
    registry.unregister('peek-stack');
  };
}
