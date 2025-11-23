import { ActionRegistry } from './ActionRegistry';
import type { ActionContext } from './types';

/**
 * Reserved browser shortcuts that should not be intercepted
 */
const RESERVED_SHORTCUTS = new Set([
  'F5', // Reload
  'Ctrl+R', // Reload
  'Cmd+R', // Reload (Mac)
  'Ctrl+T', // New tab
  'Cmd+T', // New tab (Mac)
  'Ctrl+W', // Close tab
  'Cmd+W', // Close tab (Mac)
  'Ctrl+N', // New window
  'Cmd+N', // New window (Mac)
  'Ctrl+Shift+T', // Reopen closed tab
  'Cmd+Shift+T', // Reopen closed tab (Mac)
  'F12', // Dev tools
]);

/**
 * Manages keyboard shortcuts for actions.
 * Handles shortcut registration, conflict detection, and cross-platform normalization.
 */
export class KeyboardManager {
  private shortcuts: Map<string, string> = new Map(); // normalized shortcut → actionId
  private actionRegistry: ActionRegistry;

  constructor(actionRegistry: ActionRegistry) {
    this.actionRegistry = actionRegistry;
  }

  /**
   * Register a keyboard shortcut for an action
   * @param shortcut Shortcut string (e.g., 'F', 'Cmd+K', 'Shift+R')
   * @param actionId Action ID to execute
   * @param options Options for registration
   */
  public registerShortcut(
    shortcut: string,
    actionId: string,
    options?: { override?: boolean },
  ): void {
    const normalized = this.normalizeShortcut(shortcut);

    // Check if reserved
    if (RESERVED_SHORTCUTS.has(normalized)) {
      console.warn(
        `[KeyboardManager] Shortcut "${shortcut}" is reserved and cannot be registered`,
      );
      return;
    }

    // Check for conflicts
    if (this.shortcuts.has(normalized) && !options?.override) {
      const existingActionId = this.shortcuts.get(normalized);
      console.warn(
        `[KeyboardManager] Shortcut "${shortcut}" is already registered for action "${existingActionId}". Use override option to replace.`,
      );
      return;
    }

    this.shortcuts.set(normalized, actionId);
  }

  /**
   * Unregister a keyboard shortcut
   * @param shortcut Shortcut string to unregister
   */
  public unregisterShortcut(shortcut: string): void {
    const normalized = this.normalizeShortcut(shortcut);
    this.shortcuts.delete(normalized);
  }

  /**
   * Handle a keyboard event and execute the associated action if found
   * @param event KeyboardEvent from the browser
   * @param context ActionContext for executing the action
   * @returns true if the event was handled, false otherwise
   */
  public handleKeyEvent(event: KeyboardEvent, context: ActionContext): boolean {
    // Don't handle shortcuts when typing in input fields
    if (this.isTypingContext(event)) {
      return false;
    }

    const normalized = this.normalizeKeyEvent(event);

    // Check if we have a registered shortcut
    const actionId = this.shortcuts.get(normalized);
    if (!actionId) {
      return false;
    }

    // Get the action from the registry
    const action = this.actionRegistry.getAction(actionId);
    if (!action) {
      console.warn(
        `[KeyboardManager] Action "${actionId}" not found in registry`,
      );
      return false;
    }

    // Check if action is available in current context
    if (!action.isAvailable(context)) {
      return false;
    }

    // Prevent default browser behavior
    event.preventDefault();
    event.stopPropagation();

    // Execute the action
    void this.actionRegistry.execute(actionId, context);

    return true;
  }

  /**
   * Get a display-friendly version of a shortcut
   * @param shortcut Shortcut string (e.g., 'Cmd+K')
   * @returns Display string (e.g., '⌘K')
   */
  public getShortcutDisplay(shortcut: string): string {
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);

    return shortcut
      .replace(/Cmd/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, '');
  }

  /**
   * Normalize a shortcut string for consistent comparison
   * Handles cross-platform differences (Cmd on Mac, Ctrl on Windows/Linux)
   */
  private normalizeShortcut(shortcut: string): string {
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);

    // Split into parts and normalize
    const parts = shortcut
      .split('+')
      .map((p) => p.trim())
      .map((p) => {
        // Normalize Cmd/Ctrl based on platform
        if (p === 'Cmd' || p === 'Meta') {
          return isMac ? 'Cmd' : 'Ctrl';
        }
        if (p === 'Ctrl' || p === 'Control') {
          return 'Ctrl';
        }
        // Normalize other modifiers
        if (p === 'Alt' || p === 'Option') return 'Alt';
        if (p === 'Shift') return 'Shift';
        // Normalize key to uppercase
        return p.toUpperCase();
      });

    // Sort modifiers for consistent order: Ctrl/Cmd, Alt, Shift, Key
    const modifiers: string[] = [];
    let key = '';

    for (const part of parts) {
      if (part === 'Ctrl' || part === 'Cmd') {
        modifiers.unshift(part); // Ctrl/Cmd first
      } else if (part === 'Alt') {
        modifiers.push(part);
      } else if (part === 'Shift') {
        modifiers.push(part);
      } else {
        key = part;
      }
    }

    return [...modifiers, key].join('+');
  }

  /**
   * Normalize a KeyboardEvent into a shortcut string
   */
  private normalizeKeyEvent(event: KeyboardEvent): string {
    const parts: string[] = [];
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);

    // Add modifiers in consistent order
    // Handle both Ctrl and Meta (Cmd on Mac, Windows key on PC)
    if (event.ctrlKey || event.metaKey) {
      // On Mac, metaKey is Cmd. On non-Mac, normalize metaKey to Ctrl for consistency
      parts.push(isMac && event.metaKey ? 'Cmd' : 'Ctrl');
    }
    if (event.altKey) {
      parts.push('Alt');
    }
    if (event.shiftKey) {
      parts.push('Shift');
    }

    // Add the key
    let key = event.key.toUpperCase();

    // Normalize special keys
    if (key === ' ') key = 'SPACE';
    if (key === 'ESCAPE') key = 'ESC';

    parts.push(key);

    return parts.join('+');
  }

  /**
   * Check if the user is typing in an input field
   */
  private isTypingContext(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();

    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable
    );
  }

  /**
   * Get all registered shortcuts (for debugging)
   */
  public getAllShortcuts(): Map<string, string> {
    return new Map(this.shortcuts);
  }

  /**
   * Clear all registered shortcuts
   */
  public clear(): void {
    this.shortcuts.clear();
  }
}
