import { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS } from './types';
import { flipCards, exhaustCards, resetToTestScene } from '../store/YjsActions';
import {
  areAllSelectedStacksExhausted,
  areAllSelectedStacksReady,
} from '../store/YjsSelectors';

/**
 * Register default actions that are available in both table and dev routes.
 * This ensures consistent functionality across all table views.
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
    id: 'shuffle-deck',
    label: 'Shuffle Deck',
    shortLabel: 'Shuffle',
    icon: '🎲',
    category: CARD_ACTIONS,
    description: 'Shuffle all cards in the selected deck',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Shuffle deck'),
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
}
