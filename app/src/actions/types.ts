import type { YjsStore } from '../store/YjsStore';
import type { TableObject } from '@cardtable2/shared';

/**
 * Category constants for grouping actions
 */
export const CARD_ACTIONS = 'Card Actions';
export const SELECTION_ACTIONS = 'Selection';
export const VIEW_ACTIONS = 'View';
export const MANAGEMENT_ACTIONS = 'Management';

/**
 * Selection context information for action availability and execution
 */
export interface SelectionInfo {
  ids: string[];
  objects: TableObject[];
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
}

/**
 * Action definition interface for the Action Registry
 */
export interface Action {
  id: string; // 'flip-cards', 'rotate-objects'
  label: string; // 'Flip Cards'
  icon: string; // '🔄' or icon name
  shortcut?: string; // 'F', 'Cmd+R', 'Shift+D'
  category: string; // CARD_ACTIONS, SELECTION_ACTIONS, etc.
  description?: string; // For tooltips/help
  isAvailable: (context: ActionContext) => boolean;
  execute: (context: ActionContext) => void | Promise<void>;
}
