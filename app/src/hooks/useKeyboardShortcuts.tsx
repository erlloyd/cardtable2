import { useEffect, useEffectEvent } from 'react';
import { KeyboardManager } from '../actions/KeyboardManager';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';

/**
 * React hook that manages keyboard shortcuts for the action system.
 * Automatically handles keyboard events and executes registered actions.
 *
 * The keydown handler is an effect event, so it always reads the latest
 * context/onActionExecuted (effect events update at commit) while the window
 * listener and KeyboardManager are only rebuilt when `enabled` or the presence
 * of a context changes. A keyboard event arriving after a store update but
 * before React re-renders still sees the previous committed context; that gap
 * is the same one a ref mirror updated at commit would have.
 *
 * @param context Current action context (store, selection, actorId)
 * @param enabled Whether keyboard shortcuts should be active (default: true)
 */
export function useKeyboardShortcuts(
  context: ActionContext | null,
  enabled = true,
  onActionExecuted?: () => void,
): void {
  const hasContext = context !== null;

  const onKeyDown = useEffectEvent(
    (keyboardManager: KeyboardManager, event: KeyboardEvent) => {
      if (!context) return;
      const handled = keyboardManager.handleKeyEvent(event, context);
      if (handled) {
        onActionExecuted?.();
      }
    },
  );

  useEffect(() => {
    if (!enabled || !hasContext) {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      onKeyDown(keyboardManager, event);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, hasContext]);
}
