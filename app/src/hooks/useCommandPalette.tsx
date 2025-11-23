import { useState, useEffect, useCallback } from 'react';

const RECENT_ACTIONS_KEY = 'cardtable2:recentActions';
const MAX_RECENT_ACTIONS = 5;

/**
 * Hook for managing command palette state
 * Handles open/close state, recently used actions, and keyboard shortcut
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [recentActions, setRecentActions] = useState<string[]>([]);

  // Load recent actions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_ACTIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          setRecentActions(
            parsed.filter((item): item is string => typeof item === 'string'),
          );
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const open = useCallback(() => {
    console.log('[CommandPalette] Opening...');
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    console.log('[CommandPalette] Closing...');
    setIsOpen(false);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      console.log('[CommandPalette] Toggling from', prev, 'to', !prev);
      return !prev;
    });
  }, []);

  /**
   * Record that an action was executed
   * Moves it to the front of the recent actions list
   */
  const recordAction = useCallback((actionId: string) => {
    setRecentActions((prev) => {
      // Remove if already in list
      const filtered = prev.filter((id) => id !== actionId);
      // Add to front
      const updated = [actionId, ...filtered].slice(0, MAX_RECENT_ACTIONS);

      // Persist to localStorage
      try {
        localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }

      return updated;
    });
  }, []);

  // Global keyboard shortcut handler (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const commandKey = isMac ? event.metaKey : event.ctrlKey;

      console.log('[CommandPalette] Key pressed:', {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isMac,
        commandKey,
        shouldTrigger: commandKey && event.key === 'k',
      });

      if (commandKey && event.key === 'k') {
        console.log('[CommandPalette] Opening palette!');
        event.preventDefault();
        toggle();
      }
    };

    console.log('[CommandPalette] Attaching keydown listener');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      console.log('[CommandPalette] Removing keydown listener');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggle]);

  return {
    isOpen,
    open,
    close,
    toggle,
    recentActions,
    recordAction,
  };
}
