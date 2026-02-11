/**
 * Attachment Actions - Dynamic generation based on loaded game assets
 *
 * This module generates add/remove actions for tokens, status effects, and modifiers
 * based on the types defined in the currently loaded asset pack(s).
 *
 * The core system has no hardcoded game-specific types - everything is plugin-driven.
 */

import type {
  AttachmentData,
  GameAssets,
  StatusTypeDef,
} from '@cardtable2/shared';
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

  // Generate status actions (add + remove per type, mirroring token pattern)
  if (gameAssets.statusTypes) {
    for (const [typeCode, statusDef] of Object.entries(
      gameAssets.statusTypes,
    )) {
      registerStatusActions(registry, typeCode, statusDef);
    }
  }

  // Generate modifier actions
  if (gameAssets.modifierStats) {
    for (const [statCode] of Object.entries(gameAssets.modifierStats)) {
      registerModifierActions(registry, statCode);
    }
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
 * Register add/remove actions for a specific status type.
 * Countable statuses work like tokens (increment/decrement).
 * Non-countable statuses toggle on/off (count clamped to 0 or 1).
 */
function registerStatusActions(
  registry: ActionRegistry,
  typeCode: string,
  statusDef: StatusTypeDef,
): void {
  const typeName = statusDef.name;
  const countable = statusDef.countable ?? false;

  // Add status action
  registry.register({
    id: `add-status-${typeCode}`,
    label: `Add ${typeName}`,
    icon: '⚡',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;

      if (!countable) {
        // Non-countable: only available if not already present
        const stackId = ctx.selection.ids[0];
        const yMap = ctx.store.getObjectYMap(stackId);
        if (!yMap) return false;

        const meta = yMap.get('_meta') as Record<string, unknown>;
        const attachments = meta?.attachments as AttachmentData;
        return (attachments?.status?.[typeCode] ?? 0) < 1;
      }

      return true;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const status = { ...(attachments.status || {}) };

        status[typeCode] = (status[typeCode] || 0) + 1;

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

  // Remove status action
  registry.register({
    id: `remove-status-${typeCode}`,
    label: `Remove ${typeName}`,
    icon: '❌',
    category: CARD_ACTIONS,
    isAvailable: (ctx) => {
      if (ctx.selection.count !== 1 || !ctx.selection.hasStacks) return false;

      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return false;

      const meta = yMap.get('_meta') as Record<string, unknown>;
      const attachments = meta?.attachments as AttachmentData;
      return (attachments?.status?.[typeCode] ?? 0) > 0;
    },
    execute: (ctx) => {
      const stackId = ctx.selection.ids[0];
      const yMap = ctx.store.getObjectYMap(stackId);
      if (!yMap) return;

      ctx.store.getDoc().transact(() => {
        const meta = (yMap.get('_meta') as Record<string, unknown>) || {};
        const attachments = (meta.attachments as AttachmentData) || {};
        const status = { ...(attachments.status || {}) };

        const current = status[typeCode] || 0;
        if (current > 1) {
          status[typeCode] = current - 1;
        } else {
          delete status[typeCode];
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
