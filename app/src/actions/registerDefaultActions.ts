import { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS } from './types';
import { flipCards } from '../store/YjsActions';

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

  // Object action: Rotate (works on any object)
  registry.register({
    id: 'rotate-clockwise',
    label: 'Rotate Clockwise',
    icon: '↻',
    shortcut: 'R',
    category: CARD_ACTIONS,
    description: 'Rotate selected objects 90 degrees clockwise',
    isAvailable: (ctx) => ctx.selection.count > 0,
    execute: () => console.log('Rotate clockwise'),
  });

  registry.register({
    id: 'rotate-counter',
    label: 'Rotate Counter-Clockwise',
    icon: '↺',
    shortcut: 'Shift+R',
    category: CARD_ACTIONS,
    description: 'Rotate selected objects 90 degrees counter-clockwise',
    isAvailable: (ctx) => ctx.selection.count > 0,
    execute: () => console.log('Rotate counter-clockwise'),
  });

  // Object action: Stack operations (only for stacks)
  registry.register({
    id: 'shuffle-deck',
    label: 'Shuffle Deck',
    icon: '🎲',
    category: CARD_ACTIONS,
    description: 'Shuffle all cards in the selected deck',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Shuffle deck'),
  });

  registry.register({
    id: 'draw-card',
    label: 'Draw Card',
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
    icon: '📤',
    category: CARD_ACTIONS,
    description: 'Deal cards to all players',
    isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
    execute: () => console.log('Deal cards'),
  });

  registry.register({
    id: 'stack-cards',
    label: 'Stack Cards',
    icon: '📚',
    category: CARD_ACTIONS,
    description: 'Stack selected cards together',
    isAvailable: (ctx) => ctx.selection.count > 1 && ctx.selection.hasStacks,
    execute: () => console.log('Stack cards'),
  });

  registry.register({
    id: 'unstack-cards',
    label: 'Unstack Cards',
    icon: '📖',
    category: CARD_ACTIONS,
    description: 'Unstack the selected stack',
    isAvailable: (ctx) => ctx.selection.count === 1 && ctx.selection.hasStacks,
    execute: () => console.log('Unstack cards'),
  });

  registry.register({
    id: 'peek-card',
    label: 'Peek at Top Card',
    icon: '👀',
    category: CARD_ACTIONS,
    description: 'Look at the top card without revealing to others',
    isAvailable: (ctx) => ctx.selection.count === 1 && ctx.selection.hasStacks,
    execute: () => console.log('Peek at card'),
  });

  registry.register({
    id: 'reveal-card',
    label: 'Reveal Card',
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
      // Only available when nothing selected AND there are objects
      return ctx.selection.count === 0 && ctx.store.getAllObjects().size > 0;
    },
    execute: (ctx) => {
      ctx.store.clearAllObjects();
      console.log('Cleared all objects');
    },
  });
}
