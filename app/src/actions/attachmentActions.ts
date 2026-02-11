/**
 * Attachment Actions - Dynamic generation based on loaded game assets
 *
 * This module generates add/remove actions for tokens, status effects, and modifiers
 * based on the types defined in the currently loaded asset pack(s).
 *
 * The core system has no hardcoded game-specific types - everything is plugin-driven.
 */

import type { AttachmentData, GameAssets } from '@cardtable2/shared';
import type { ActionRegistry } from './ActionRegistry';
import { CARD_ACTIONS } from './types';

/**
 * Generate and register all attachment actions based on loaded game assets
 * This is called whenever a new scenario/content is loaded
 */
export function registerAttachmentActions(
  registry: ActionRegistry,
  gameAssets: GameAssets | null,
): void {
  if (!gameAssets) return;

  // Clear any previously registered attachment actions
  clearAttachmentActions(registry);

  // Generate token actions (index determines keyboard shortcut slot: Cmd+1, Cmd+2, etc.)
  if (gameAssets.tokenTypes) {
    let slotIndex = 0;
    for (const [typeCode, tokenDef] of Object.entries(gameAssets.tokenTypes)) {
      registerTokenActions(registry, typeCode, tokenDef.name, slotIndex);
      slotIndex++;
    }
  }

  // Generate status actions
  if (gameAssets.statusTypes) {
    for (const [typeCode, statusDef] of Object.entries(
      gameAssets.statusTypes,
    )) {
      registerStatusAddAction(registry, typeCode, statusDef.name);
    }
  }

  // Generate modifier actions
  if (gameAssets.modifierStats) {
    for (const [statCode] of Object.entries(gameAssets.modifierStats)) {
      registerModifierActions(registry, statCode);
    }
  }

  // Generate generic "Remove Status" action (removes any status)
  if (
    gameAssets.statusTypes &&
    Object.keys(gameAssets.statusTypes).length > 0
  ) {
    registerStatusRemoveAction(registry);
  }
}

/**
 * Clear all attachment-related actions
 * Called before regenerating actions for new content
 */
function clearAttachmentActions(registry: ActionRegistry): void {
  // Get all registered action IDs
  const allActions = registry.getAllActions();

  // Remove actions that start with attachment prefixes
  for (const action of allActions) {
    if (
      action.id.startsWith('add-token-') ||
      action.id.startsWith('remove-token-') ||
      action.id.startsWith('add-status-') ||
      action.id.startsWith('remove-status') ||
      action.id.startsWith('modify-')
    ) {
      registry.unregister(action.id);
    }
  }
}

/**
 * Register add/remove actions for a specific token type
 */
function registerTokenActions(
  registry: ActionRegistry,
  typeCode: string,
  typeName: string,
  slotIndex: number,
): void {
  // Keyboard shortcut slot: Cmd+1 to Cmd+9 for add, Shift+1 to Shift+9 for remove
  const slotNumber = slotIndex + 1; // 1-based
  const addShortcut = slotNumber <= 9 ? `Cmd+${slotNumber}` : undefined;
  const removeShortcut = slotNumber <= 9 ? `Shift+${slotNumber}` : undefined;

  // Add token action
  registry.register({
    id: `add-token-${typeCode}`,
    label: `Add ${typeName} Token`,
    icon: '🎯',
    shortcut: addShortcut,
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      return ctx.selection.count === 1 && ctx.selection.hasStacks;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const tokens = attachments.tokens || {};

        // Add one token of this type
        tokens[typeCode] = (tokens[typeCode] || 0) + 1;

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            tokens,
          },
        });
      });
    },
  });

  // Remove token action
  registry.register({
    id: `remove-token-${typeCode}`,
    label: `Remove ${typeName} Token`,
    icon: '➖',
    shortcut: removeShortcut,
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;

      // Check if card has this token type
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return false;

      const meta = yMap.get('_meta') as Record<string, unknown>;
      const attachments = meta?.attachments as AttachmentData;
      const tokenCount = attachments?.tokens?.[typeCode] || 0;

      return tokenCount > 0;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const tokens = attachments.tokens || {};

        // Remove one token of this type
        const current = tokens[typeCode] || 0;
        if (current > 1) {
          tokens[typeCode] = current - 1;
        } else {
          delete tokens[typeCode];
        }

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            tokens,
          },
        });
      });
    },
  });
}

/**
 * Register add action for a specific status type
 */
function registerStatusAddAction(
  registry: ActionRegistry,
  typeCode: string,
  typeName: string,
): void {
  registry.register({
    id: `add-status-${typeCode}`,
    label: `Add ${typeName}`,
    icon: '⚡',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;

      // Check if card already has this status
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return false;

      const meta = yMap.get('_meta') as Record<string, unknown>;
      const attachments = meta?.attachments as AttachmentData;
      const hasStatus = attachments?.status?.includes(typeCode);

      return !hasStatus;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const status = attachments.status || [];

        // Add status if not already present
        if (!status.includes(typeCode)) {
          status.push(typeCode);
        }

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            status,
          },
        });
      });
    },
  });
}

/**
 * Register generic "Remove Status" action (removes first status)
 */
function registerStatusRemoveAction(registry: ActionRegistry): void {
  registry.register({
    id: 'remove-status',
    label: 'Remove Status',
    icon: '❌',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;

      // Check if card has any status effects
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return false;

      const meta = yMap.get('_meta') as Record<string, unknown>;
      const attachments = meta?.attachments as AttachmentData;
      const statusCount = attachments?.status?.length || 0;

      return statusCount > 0;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const status = attachments.status || [];

        // Remove the first status
        if (status.length > 0) {
          status.shift();
        }

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            status,
          },
        });
      });
    },
  });
}

/**
 * Register increment/decrement actions for a specific stat modifier
 */
function registerModifierActions(
  registry: ActionRegistry,
  statCode: string,
): void {
  // Increment modifier action
  registry.register({
    id: `modify-${statCode.toLowerCase()}-plus`,
    label: `Modify ${statCode} +1`,
    icon: '📈',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      return ctx.selection.count === 1 && ctx.selection.hasStacks;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const modifiers = attachments.modifiers || {};

        // Add +1 to stat
        modifiers[statCode] = (modifiers[statCode] || 0) + 1;

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            modifiers,
          },
        });
      });
    },
  });

  // Decrement modifier action
  registry.register({
    id: `modify-${statCode.toLowerCase()}-minus`,
    label: `Modify ${statCode} -1`,
    icon: '📉',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      return ctx.selection.count === 1 && ctx.selection.hasStacks;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const modifiers = attachments.modifiers || {};

        // Subtract 1 from stat (can go negative)
        modifiers[statCode] = (modifiers[statCode] || 0) - 1;

        // Remove if zero
        if (modifiers[statCode] === 0) {
          delete modifiers[statCode];
        }

        yMap.set('_meta', {
          ...meta,
          attachments: {
            ...attachments,
            modifiers,
          },
        });
      });
    },
  });
}
