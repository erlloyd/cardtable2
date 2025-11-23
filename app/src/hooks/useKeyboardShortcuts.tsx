import { useEffect } from 'react';
import { KeyboardManager } from '../actions/KeyboardManager';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';

/**
 * React hook that manages keyboard shortcuts for the action system.
 * Automatically handles keyboard events and executes registered actions.
 *
 * @param context Current action context (store, selection, actorId)
 * @param enabled Whether keyboard shortcuts should be active (default: true)
 */
export function useKeyboardShortcuts(
  context: ActionContext | null,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !context) {
      return;
    }

    const actionRegistry = ActionRegistry.getInstance();
    const keyboardManager = new KeyboardManager(actionRegistry);

    // Register shortcuts from all actions that have them
    const actions = actionRegistry.getAllActions();
    for (const action of actions) {
      if (action.shortcut) {
        keyboardManager.registerShortcut(action.shortcut, action.id);
      }
    }

    // Handle keyboard events
    const handleKeyDown = (event: KeyboardEvent) => {
      keyboardManager.handleKeyEvent(event, context);
    };

    // Attach event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [context, enabled]);
}
