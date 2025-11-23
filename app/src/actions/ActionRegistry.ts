import type { Action, ActionContext } from './types';

/**
 * Central registry for all available actions in the application.
 * Manages action registration, querying, and execution.
 *
 * Usage:
 * ```typescript
 * const registry = ActionRegistry.getInstance();
 * registry.register({
 *   id: 'flip-cards',
 *   label: 'Flip Cards',
 *   icon: '🔄',
 *   shortcut: 'F',
 *   category: CARD_ACTIONS,
 *   isAvailable: (ctx) => ctx.selection.hasStacks,
 *   execute: (ctx) => flipCards(ctx.store, ctx.selection.ids)
 * });
 * ```
 */
type ChangeListener = () => void;

export class ActionRegistry {
  private static instance: ActionRegistry;
  private actions: Map<string, Action> = new Map();
  private listeners: Set<ChangeListener> = new Set();

  private constructor() {
    // Singleton pattern
  }

  /**
   * Subscribe to registry changes
   * @param listener Callback function to call when actions are registered/unregistered
   * @returns Unsubscribe function
   */
  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of a change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Get the singleton instance of ActionRegistry
   */
  public static getInstance(): ActionRegistry {
    if (!ActionRegistry.instance) {
      ActionRegistry.instance = new ActionRegistry();
    }
    return ActionRegistry.instance;
  }

  /**
   * Register a new action. Warns if action ID already exists.
   * @param action The action to register
   */
  public register(action: Action): void {
    if (this.actions.has(action.id)) {
      console.warn(
        `[ActionRegistry] Action with id "${action.id}" is already registered. Overwriting.`,
      );
    }
    this.actions.set(action.id, action);
    this.notifyListeners();
  }

  /**
   * Unregister an action by ID
   * @param actionId The ID of the action to remove
   */
  public unregister(actionId: string): void {
    this.actions.delete(actionId);
    this.notifyListeners();
  }

  /**
   * Get a specific action by ID
   * @param actionId The action ID
   * @returns The action, or undefined if not found
   */
  public getAction(actionId: string): Action | undefined {
    return this.actions.get(actionId);
  }

  /**
   * Get all actions that are available in the given context
   * @param context The action context (store, selection, actorId)
   * @returns Array of available actions
   */
  public getAvailableActions(context: ActionContext): Action[] {
    const available: Action[] = [];
    for (const action of this.actions.values()) {
      if (action.isAvailable(context)) {
        available.push(action);
      }
    }
    return available;
  }

  /**
   * Get all actions in a specific category
   * @param category The category name
   * @returns Array of actions in that category
   */
  public getActionsByCategory(category: string): Action[] {
    const categoryActions: Action[] = [];
    for (const action of this.actions.values()) {
      if (action.category === category) {
        categoryActions.push(action);
      }
    }
    return categoryActions;
  }

  /**
   * Execute an action by ID
   * @param actionId The action ID to execute
   * @param context The action context
   * @throws Error if action not found or not available
   */
  public async execute(
    actionId: string,
    context: ActionContext,
  ): Promise<void> {
    const action = this.actions.get(actionId);

    if (!action) {
      throw new Error(`[ActionRegistry] Action "${actionId}" not found`);
    }

    if (!action.isAvailable(context)) {
      throw new Error(
        `[ActionRegistry] Action "${actionId}" is not available in current context`,
      );
    }

    await action.execute(context);
  }

  /**
   * Get all registered actions (useful for debugging)
   * @returns Array of all actions
   */
  public getAllActions(): Action[] {
    return Array.from(this.actions.values());
  }

  /**
   * Clear all registered actions (useful for testing)
   */
  public clear(): void {
    this.actions.clear();
    this.notifyListeners();
  }

  /**
   * Get the count of registered actions
   */
  public get size(): number {
    return this.actions.size;
  }
}
