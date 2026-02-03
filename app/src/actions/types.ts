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
  category: string; // CARD_ACTIONS, SELECTION_ACTIONS, etc.
  description?: string; // For tooltips/help
  isAvailable: (context: ActionContext) => boolean;
  execute: (context: ActionContext) => void | Promise<void>;
}
