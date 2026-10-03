import { useEffect, useLayoutEffect, useRef } from 'react';
import { KeyboardManager } from '../actions/KeyboardManager';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';

/**
 * React hook that manages keyboard shortcuts for the action system.
 * Automatically handles keyboard events and executes registered actions.
 *
 * Uses a ref for context so the keydown listener always reads the latest
 * selection/store state without waiting for the next React render cycle.
 * This prevents a race where a keyboard event arrives after a store update
 * (e.g., selection change) but before React re-renders the effect.
 *
 * @param context Current action context (store, selection, actorId)
 * @param enabled Whether keyboard shortcuts should be active (default: true)
 */
export function useKeyboardShortcuts(
  context: ActionContext | null,
  enabled = true,
  onActionExecuted?: () => void,
): void {
  const contextRef = useRef(context);
  const onActionExecutedRef = useRef(onActionExecuted);

  // Layout effects run before the passive effect below and before any event
  // can be dispatched after commit, so the listener always sees the latest values.
  useLayoutEffect(() => {
    contextRef.current = context;
    onActionExecutedRef.current = onActionExecuted;
  });

  useEffect(() => {
    if (!enabled || !contextRef.current) {
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

    // Handle keyboard events — read context from ref to always use latest state
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!contextRef.current) return;
      const handled = keyboardManager.handleKeyEvent(event, contextRef.current);
      if (handled) {
        onActionExecutedRef.current?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [context, enabled]);
}
