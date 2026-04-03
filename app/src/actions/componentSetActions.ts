/**
 * Dynamic action registration for component sets.
 *
 * When a plugin with componentSets is loaded, registers a "Load Components"
 * action in the command palette. The action opens the ComponentSetModal.
 */

import type { ComponentSetEntry } from '@cardtable2/shared';
import { ActionRegistry } from './ActionRegistry';
import { CONTENT_ACTIONS } from './types';

const COMPONENT_SET_ACTION_PREFIX = 'load-components-';

/**
 * Register a "Load Components" action for a plugin's component sets.
 *
 * Call this after a plugin with componentSets is loaded.
 * Call unregisterComponentSetActions() on table reset.
 */
export function registerComponentSetActions(
  registry: ActionRegistry,
  pluginId: string,
  entries: ComponentSetEntry[],
  pluginBaseUrl: string,
): void {
  if (entries.length === 0) return;

  const actionId = `${COMPONENT_SET_ACTION_PREFIX}${pluginId}`;

  registry.register({
    id: actionId,
    label: 'Load Components',
    shortLabel: 'Components',
    icon: '📦',
    category: CONTENT_ACTIONS,
    description: `Load component sets from the current game plugin`,
    isAvailable: (ctx) => {
      return ctx.selection.count === 0 && ctx.onOpenComponentSets !== undefined;
    },
    execute: (ctx) => {
      if (ctx.onOpenComponentSets) {
        ctx.onOpenComponentSets(entries, pluginBaseUrl);
      }
    },
  });
}

/**
 * Remove all component set actions from the registry.
 *
 * Call this on table reset or content unload.
 */
export function unregisterComponentSetActions(registry: ActionRegistry): void {
  const allActions = registry.getAllActions();
  for (const action of allActions) {
    if (action.id.startsWith(COMPONENT_SET_ACTION_PREFIX)) {
      registry.unregister(action.id);
    }
  }
}
