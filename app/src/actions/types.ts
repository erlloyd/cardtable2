import type { YjsStore } from '../store/YjsStore';
import type { TableObjectYMap } from '../store/types';

/**
 * Category constants for grouping actions
 */
export const CARD_ACTIONS = 'Card Actions';
export const SELECTION_ACTIONS = 'Selection';
export const VIEW_ACTIONS = 'View';
export const MANAGEMENT_ACTIONS = 'Management';
export const CONTENT_ACTIONS = 'Content';
export const HAND_ACTIONS = 'Hand Actions';

/**
 * Selection context information for action availability and execution (M3.6-T4)
 *
 * Now uses Y.Maps directly instead of plain objects for zero-allocation performance.
 */
export interface SelectionInfo {
  ids: string[];
  yMaps: TableObjectYMap[]; // Y.Map references (no conversion, zero allocations)
  count: number;
  hasStacks: boolean;
  hasTokens: boolean;
  hasCounters: boolean;
  hasMixed: boolean;
  allLocked: boolean;
  allUnlocked: boolean;
  canAct: boolean; // owned by current actor
}

/**
 * Action execution context provided to action handlers
 */
export interface ActionContext {
  store: YjsStore;
  selection: SelectionInfo;
  actorId: string;
  clickedObjectId?: string; // ID of object under cursor when context menu opened (if any)
  navigate?: (path: string) => void; // Optional navigation function for route-based actions
  currentRoute?: string; // Current route path (e.g., '/table/123' or '/dev/table/123')
  gridSnapEnabled?: boolean; // Whether grid snapping is enabled
  onGridSnapEnabledChange?: (enabled: boolean) => void; // Toggle grid snap callback
  activeHandId?: string; // Currently active player hand
  numericPrefix?: number; // number typed before the shortcut key, e.g. 3 in "3D"
  /** Open the generic Load... picker modal (ct-8gf.5).
   * `presetType`, when supplied, skips the type-list step and renders the
   * item list for that loadable type directly. */
  onOpenLoadPicker?: (presetType?: string) => void;
  /** Open the rename dialog for the given zone. */
  onOpenRenameDialog?: (zoneId: string) => void;
  /** Open the Set Tokens dialog for the given stack. */
  onOpenSetTokensDialog?: (stackId: string) => void;
  /** Open the peek modal for the top `count` cards of the given stack.
   * `askCount` first asks for the number in a small dialog, then opens. */
  onOpenPeek?: (
    stackId: string,
    count: number,
    options?: { askCount?: boolean },
  ) => void;
  /** Index in the active hand of the card under the mouse, or null. A getter
   * so hovering does not rebuild the context. */
  getHoveredHandCardIndex?: () => number | null;
}

/**
 * A named alternative way to run an action, shown as a submenu entry.
 */
export interface ActionVariant {
  id: string;
  label: string | ((context: ActionContext) => string);
  execute: (context: ActionContext) => void | Promise<void>;
}

/**
 * Action definition interface for the Action Registry
 */
export interface Action {
  id: string; // 'flip-cards', 'rotate-objects'
  label: string | ((context: ActionContext) => string); // 'Flip Cards' (used in command palette), can be dynamic
  shortLabel?: string | ((context: ActionContext) => string); // 'Flip' (optional shorter label for action handle), can be dynamic
  icon: string; // '🔄' or icon name
  shortcut?: string; // 'F', 'Cmd+R', 'Shift+D'
  noRepeat?: boolean; // Ignore auto-repeat keydowns of the shortcut (a held key fires once)
  category: string; // CARD_ACTIONS, SELECTION_ACTIONS, etc.
  description?: string; // For tooltips/help
  isAvailable: (context: ActionContext) => boolean;
  execute: (context: ActionContext) => void | Promise<void>;
  /**
   * An action with variants shows as a submenu parent in the context menu.
   * Variants share the parent's isAvailable. The parent's own execute still
   * runs from its shortcut, the action handle and the command palette.
   * Variants appear only in the context menu.
   */
  variants?: ActionVariant[];
}
