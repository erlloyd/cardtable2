import { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS, VIEW_ACTIONS, CONTENT_ACTIONS } from './types';
import { registerAttachmentActions } from './attachmentActions';
import type { LoadableEntry } from '@cardtable2/shared';
import {
  flipCards,
  exhaustCards,
  resetToTestScene,
  resetTable,
  shuffleStack,
  detachCard,
  detachAllCards,
} from '../store/YjsActions';
import {
  areAllSelectedStacksExhausted,
  areAllSelectedStacksReady,
} from '../store/YjsSelectors';
import { resolveEffectiveAttachmentLayout } from '../store/attachmentLayout';
/**
 * Register default actions that are available in both table and dev routes.
 * This ensures consistent functionality across all table views.
 *
 * Note: Attachment actions (tokens, status, modifiers) are registered dynamically
 * when content is loaded via registerAttachmentActions() in the content loading flow.
 */
export function registerDefaultActions(): void {
  const registry = ActionRegistry.getInstance();

  // Object action: Flip Cards/Tokens
  registry.register({
    id: 'flip-cards',
    label: 'Flip Selected Objects',
    shortLabel: 'Flip',
    icon: '🔄',
    shortcut: 'F',
    category: CARD_ACTIONS,
    description: 'Flip all selected cards and tokens face up or face down',
    isAvailable: (ctx) =>
      ctx.selection.count > 0 &&
      (ctx.selection.hasStacks || ctx.selection.hasTokens),
    execute: (ctx) => {
      const flipped = flipCards(ctx.store, ctx.selection.ids);
      console.log(`Flipped ${flipped.length} objects:`, flipped);
    },
  });

  // Object action: Exhaust/Ready (only for stacks)
  registry.register({
    id: 'exhaust-cards',
    label: (ctx) => {
      const allExhausted = areAllSelectedStacksExhausted(ctx.store);
      const allReady = areAllSelectedStacksReady(ctx.store);
      if (allExhausted) return 'Ready Cards';
      if (allReady) return 'Exhaust Cards';
      return 'Exhaust/Ready Cards';
    },
    shortLabel: (ctx) => {
      const allExhausted = areAllSelectedStacksExhausted(ctx.store);
      const allReady = areAllSelectedStacksReady(ctx.store);
      if (allExhausted) return 'Ready';
      if (allReady) return 'Exhaust';
      return 'Exhaust/Ready';
    },
    icon: '↻',
    shortcut: 'E',
    category: CARD_ACTIONS,
    description:
      'Toggle exhaust state (rotate 90° to exhaust, rotate back to ready)',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: (ctx) => {
      const exhausted = exhaustCards(ctx.store, ctx.selection.ids);
      console.log(`Exhausted/Readied ${exhausted.length} cards:`, exhausted);
    },
  });

  // Object action: Stack operations (only for stacks)
  registry.register({
    id: 'shuffle-stack',
    label: (ctx) =>
      ctx.selection.count === 1
        ? 'Shuffle Stack'
        : `Shuffle ${ctx.selection.count} Stacks`,
    shortLabel: 'Shuffle',
    icon: '🔀',
    shortcut: 'S',
    category: CARD_ACTIONS,
    description: 'Randomly shuffle all cards in selected stack(s)',
    isAvailable: (ctx) => {
      if (!ctx.selection.hasStacks || ctx.selection.count === 0) {
        return false;
      }

      // Multiple stacks: always allow shuffle (even single-card stacks)
      if (ctx.selection.count > 1) {
        return true;
      }

      // Single stack: must have 2+ cards
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return false;

      const cards = yMap.get('_cards');
      return Array.isArray(cards) && cards.length >= 2;
    },
    execute: (ctx) => {
      let shuffledCount = 0;

      // Shuffle all selected stacks
      for (const stackId of ctx.selection.ids) {
        const success = shuffleStack(ctx.store, stackId);
        if (success) {
          shuffledCount++;
        }
      }

      console.log(`Shuffled ${shuffledCount} stack(s)`);
    },
  });

  registry.register({
    id: 'draw-card',
    label: 'Draw Card',
    shortLabel: 'Draw',
    icon: '🃏',
    shortcut: 'D',
    category: CARD_ACTIONS,
    description: 'Draw a card from the deck',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Draw card'),
  });

  registry.register({
    id: 'deal-cards',
    label: 'Deal Cards',
    shortLabel: 'Deal',
    icon: '📤',
    category: CARD_ACTIONS,
    description: 'Deal cards to all players',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Deal cards'),
  });

  registry.register({
    id: 'stack-cards',
    label: 'Stack Cards',
    shortLabel: 'Stack',
    icon: '📚',
    category: CARD_ACTIONS,
    description: 'Stack selected cards together',
    isAvailable: (ctx) => ctx.selection.count > 1 && ctx.selection.hasStacks,
    execute: () => console.log('Stack cards'),
  });

  registry.register({
    id: 'unstack-cards',
    label: 'Unstack Cards',
    shortLabel: 'Unstack',
    icon: '📖',
    category: CARD_ACTIONS,
    description: 'Unstack the selected stack',
    isAvailable: (ctx) => ctx.selection.count === 1 && ctx.selection.hasStacks,
    execute: () => console.log('Unstack cards'),
  });

  registry.register({
    id: 'peek-card',
    label: 'Peek at Top Card',
    shortLabel: 'Peek',
    icon: '👀',
    category: CARD_ACTIONS,
    description: 'Look at the top card without revealing to others',
    isAvailable: (ctx) => ctx.selection.count === 1 && ctx.selection.hasStacks,
    execute: () => console.log('Peek at card'),
  });

  registry.register({
    id: 'reveal-card',
    label: 'Reveal Card',
    shortLabel: 'Reveal',
    icon: '💡',
    category: CARD_ACTIONS,
    description: 'Reveal the selected card to all players',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Reveal card'),
  });

  // Card-on-card attachment: Detach card from parent
  registry.register({
    id: 'detach-card',
    label: 'Detach Card',
    shortLabel: 'Detach',
    icon: '📎',
    category: CARD_ACTIONS,
    description: 'Detach this card from its parent',
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;
      const yMap = ctx.store.getObjectYMap(ctx.selection.ids[0]);
      if (!yMap) return false;
      return yMap.get('_attachedToId') !== undefined;
    },
    execute: (ctx) => {
      const cardId = ctx.selection.ids[0];
      const success = detachCard(
        ctx.store,
        cardId,
        resolveEffectiveAttachmentLayout(ctx.store),
      );
      if (success) {
        console.log(`Detached card ${cardId}`);
      }
    },
  });

  // Card-on-card attachment: Detach all cards from parent
  registry.register({
    id: 'detach-all-cards',
    label: 'Detach All Cards',
    shortLabel: 'Detach All',
    icon: '📎',
    category: CARD_ACTIONS,
    description: 'Detach all cards attached to this card',
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;
      const yMap = ctx.store.getObjectYMap(ctx.selection.ids[0]);
      if (!yMap) return false;
      const attachedIds: string[] | undefined = yMap.get('_attachedCardIds');
      return Array.isArray(attachedIds) && attachedIds.length > 0;
    },
    execute: (ctx) => {
      const parentId = ctx.selection.ids[0];
      const detached = detachAllCards(ctx.store, parentId);
      console.log(`Detached ${detached.length} cards from ${parentId}`);
    },
  });

  // Object action: Lock/Unlock (works on any object)
  registry.register({
    id: 'lock-object',
    label: 'Lock Object',
    shortLabel: 'Lock',
    icon: '🔒',
    shortcut: 'L',
    category: CARD_ACTIONS,
    description: 'Lock the selected object to prevent modifications',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.allUnlocked,
    execute: () => console.log('Lock object'),
  });

  registry.register({
    id: 'unlock-object',
    label: 'Unlock Object',
    shortLabel: 'Unlock',
    icon: '🔓',
    shortcut: 'Shift+L',
    category: CARD_ACTIONS,
    description: 'Unlock the selected object',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.allLocked,
    execute: () => console.log('Unlock object'),
  });

  // Object action: Duplicate/Delete (works on any object)
  registry.register({
    id: 'duplicate-object',
    label: 'Duplicate Object',
    shortLabel: 'Duplicate',
    icon: '📋',
    shortcut: 'Cmd+D',
    category: CARD_ACTIONS,
    description: 'Create a copy of the selected object',
    isAvailable: (ctx) => ctx.selection.count > 0,
    execute: () => console.log('Duplicate object'),
  });

  registry.register({
    id: 'delete-object',
    label: 'Delete Object',
    shortLabel: 'Delete',
    icon: '🗑️',
    shortcut: 'Delete',
    category: CARD_ACTIONS,
    description: 'Delete the selected object',
    isAvailable: (ctx) => ctx.selection.count > 0,
    execute: () => console.log('Delete object'),
  });

  // Global action: Say Hello (only when nothing selected)
  registry.register({
    id: 'test-hello',
    label: 'Say Hello',
    icon: '👋',
    shortcut: 'H',
    category: 'Global Actions',
    description: 'Display a hello message (only when nothing selected)',
    isAvailable: (ctx) => ctx.selection.count === 0,
    execute: () => {
      console.log('Hello from Command Palette!');
      alert('Hello from Command Palette!');
    },
  });

  // Global action: Clear All (only when nothing selected)
  registry.register({
    id: 'test-clear',
    label: 'Clear All Objects',
    icon: '🗑️',
    shortcut: 'Shift+C',
    category: 'Global Actions',
    description: 'Remove all objects from the table',
    isAvailable: (ctx) => {
      // Only available when nothing selected AND there are objects (M3.6-T5)
      return ctx.selection.count === 0 && ctx.store.objects.size > 0;
    },
    execute: (ctx) => {
      ctx.store.clearAllObjects();
      console.log('Cleared all objects');
    },
  });

  // Global action: Switch to Dev Mode (only available in full mode)
  registry.register({
    id: 'switch-to-dev-mode',
    label: 'Switch to Dev Mode',
    icon: '🔧',
    category: 'Global Actions',
    description: 'Switch to development mode with debug tools',
    isAvailable: (ctx) =>
      ctx.selection.count === 0 &&
      ctx.navigate !== undefined &&
      typeof ctx.currentRoute === 'string' &&
      ctx.currentRoute.startsWith('/table/'),
    execute: (ctx) => {
      if (ctx.navigate && typeof ctx.currentRoute === 'string') {
        // Extract table ID from current route (/table/{id})
        const tableId = ctx.currentRoute.split('/')[2];
        const devRoute = `/dev/table/${tableId}`;
        console.log(`Switching to dev mode: ${devRoute}`);
        ctx.navigate(devRoute);
      }
    },
  });

  // Global action: Switch to Full Mode (only available in dev mode)
  registry.register({
    id: 'switch-to-full-mode',
    label: 'Switch to Full Mode',
    icon: '🎮',
    category: 'Global Actions',
    description: 'Switch to full table mode without debug tools',
    isAvailable: (ctx) =>
      ctx.selection.count === 0 &&
      ctx.navigate !== undefined &&
      typeof ctx.currentRoute === 'string' &&
      ctx.currentRoute.startsWith('/dev/table/'),
    execute: (ctx) => {
      if (ctx.navigate && typeof ctx.currentRoute === 'string') {
        // Extract table ID from current route (/dev/table/{id})
        const tableId = ctx.currentRoute.split('/')[3];
        const fullRoute = `/table/${tableId}`;
        console.log(`Switching to full mode: ${fullRoute}`);
        ctx.navigate(fullRoute);
      }
    },
  });

  // Global action: Reset to Test Scene (only when nothing selected)
  registry.register({
    id: 'reset-to-test-scene',
    label: 'Reset to Test Scene',
    icon: '🎨',
    category: 'Global Actions',
    description:
      'Clear all objects and create a test scene with various object types',
    isAvailable: (ctx) => ctx.selection.count === 0,
    execute: (ctx) => {
      resetToTestScene(ctx.store);
    },
  });

  // View action: Toggle Grid Snap
  registry.register({
    id: 'toggle-grid-snap',
    label: (ctx) =>
      ctx.gridSnapEnabled ? 'Disable Grid Snap' : 'Enable Grid Snap',
    shortLabel: 'Grid Snap',
    icon: '⊞',
    shortcut: 'G',
    category: VIEW_ACTIONS,
    description: 'Toggle grid snapping for precise object placement',
    isAvailable: (ctx) => ctx.onGridSnapEnabledChange !== undefined,
    execute: (ctx) => {
      if (ctx.onGridSnapEnabledChange && ctx.gridSnapEnabled !== undefined) {
        ctx.onGridSnapEnabledChange(!ctx.gridSnapEnabled);
      }
    },
  });

  // Global action: Reset Table
  registry.register({
    id: 'reset-table',
    label: 'Reset Table',
    icon: '🔄',
    category: 'Global Actions',
    description: 'Clear all objects from the table',
    isAvailable: (ctx) => {
      // Only available when nothing selected AND there are objects
      return ctx.selection.count === 0 && ctx.store.objects.size > 0;
    },
    execute: (ctx) => {
      resetTable(ctx.store);
      registerAttachmentActions(registry, null);
      console.log('[Reset Table] Table reset complete');
    },
  });

  // Global action: Close Table
  registry.register({
    id: 'close-table',
    label: 'Close Table',
    icon: '🚪',
    category: 'Global Actions',
    description: 'Close the table and return to game selection',
    isAvailable: (ctx) =>
      ctx.selection.count === 0 && ctx.navigate !== undefined,
    execute: (ctx) => {
      if (ctx.navigate) {
        // TODO: Replace with React UI component (Headless UI Dialog)
        // For now using browser confirm dialog for simplicity
        // Future: Create a ConfirmDialog component and pass confirm function via ActionContext
        const confirmed = window.confirm(
          'Are you sure you want to close this table? Your progress is automatically saved.',
        );
        if (confirmed) {
          console.log('[Close Table] Navigating to game selection');
          ctx.navigate('/');
        }
      }
    },
  });

  // Content action: Generic Load... (opens the two-step picker)
  //
  // Per-type Load <X>... commands are registered separately by
  // `registerLoadablesActions()` so they can be re-derived whenever the
  // active plugin's loadable registry changes.
  registry.register({
    id: 'load',
    label: 'Load…',
    shortLabel: 'Load',
    icon: '📥',
    category: CONTENT_ACTIONS,
    description: 'Pick what to load onto the table (scenarios, cards, sets…)',
    isAvailable: (ctx) =>
      ctx.selection.count === 0 && ctx.onOpenLoadPicker !== undefined,
    execute: (ctx) => {
      ctx.onOpenLoadPicker?.();
    },
  });
}

/** Module-level record of the per-type Load actions that are live, so a
 * subsequent register call can unregister them precisely without touching
 * unrelated `load-*` ids (e.g. the built-in generic `load`). */
const liveLoadableActionIds = new Set<string>();

/**
 * Register the dynamic "Load <type>..." actions derived from the current
 * plugin's loadable registry.  Idempotent: callers should pair this with
 * {@link unregisterLoadablesActions} before re-registering with a new set.
 *
 * The id format is `load-<entry.type>`; collisions with built-in action ids
 * are the plugin author's responsibility — the registry warns on overwrite.
 */
export function registerLoadablesActions(loadables: LoadableEntry[]): void {
  const registry = ActionRegistry.getInstance();
  for (const entry of loadables) {
    const id = `load-${entry.type}`;
    registry.register({
      id,
      label: `Load ${entry.label}…`,
      shortLabel: entry.label,
      icon: '📥',
      category: CONTENT_ACTIONS,
      description: `Open the ${entry.label} picker`,
      isAvailable: (ctx) =>
        ctx.selection.count === 0 && ctx.onOpenLoadPicker !== undefined,
      execute: (ctx) => {
        ctx.onOpenLoadPicker?.(entry.type);
      },
    });
    liveLoadableActionIds.add(id);
  }
}

/**
 * Remove the dynamic "Load <type>..." actions previously registered by
 * {@link registerLoadablesActions}.  Built-in actions (e.g. the generic
 * `load`) are left untouched.
 */
export function unregisterLoadablesActions(): void {
  const registry = ActionRegistry.getInstance();
  for (const id of liveLoadableActionIds) {
    registry.unregister(id);
  }
  liveLoadableActionIds.clear();
}
