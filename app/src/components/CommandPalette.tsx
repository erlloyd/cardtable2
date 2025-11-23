import { Fragment, useState, useMemo } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import { ActionRegistry } from '../actions/ActionRegistry';
import { KeyboardManager } from '../actions/KeyboardManager';
import type { Action, ActionContext } from '../actions/types';
import { fuzzySearch } from '../utils/fuzzySearch';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  context: ActionContext | null;
  recentActionIds: string[];
  onActionExecuted: (actionId: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  context,
  recentActionIds,
  onActionExecuted,
}: CommandPaletteProps) {
  console.log('[CommandPalette] Component rendering, isOpen:', isOpen);

  const [query, setQuery] = useState('');
  const actionRegistry = ActionRegistry.getInstance();
  const keyboardManager = new KeyboardManager(actionRegistry);

  // Get all actions (re-query when palette opens to pick up newly registered actions)
  const allActions = useMemo(() => {
    const actions = actionRegistry.getAllActions();
    console.log('[CommandPalette] allActions:', actions.length);
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Need isOpen to refresh when palette opens
  }, [actionRegistry, isOpen]);

  // Get recent actions (resolved from IDs)
  const recentActions = useMemo(() => {
    return recentActionIds
      .map((id) => actionRegistry.getAction(id))
      .filter((action): action is Action => action !== undefined);
  }, [recentActionIds, actionRegistry]);

  // Filter actions by search query
  const filteredActions = useMemo(() => {
    if (!query) {
      return allActions;
    }
    return fuzzySearch(allActions, query, (action) => {
      // Search in both label and description
      const searchText = `${action.label} ${action.description || ''}`;
      return searchText;
    });
  }, [allActions, query]);

  // Group actions by category
  const actionsByCategory = useMemo(() => {
    const groups = new Map<string, Action[]>();

    for (const action of filteredActions) {
      const category = action.category;
      const existing = groups.get(category) || [];
      groups.set(category, [...existing, action]);
    }

    console.log('[CommandPalette] actionsByCategory:', {
      size: groups.size,
      categories: Array.from(groups.keys()),
      totalActions: Array.from(groups.values()).flat().length,
    });

    return groups;
  }, [filteredActions]);

  // Check which actions are available in current context (re-check when palette opens)
  const availableActionIds = useMemo(() => {
    if (!context) return new Set<string>();

    const available = actionRegistry.getAvailableActions(context);
    return new Set(available.map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Need isOpen to refresh availability when palette opens
  }, [context, actionRegistry, isOpen]);

  const handleSelect = (wrappedAction: { action: Action } | null) => {
    if (!wrappedAction || !context) return;
    const action = wrappedAction.action;

    // Check if action is available
    if (!availableActionIds.has(action.id)) {
      return;
    }

    // Execute action asynchronously (fire and forget)
    void (async () => {
      try {
        await actionRegistry.execute(action.id, context);
        onActionExecuted(action.id);
        setQuery('');
        onClose();
      } catch (error) {
        console.error('[CommandPalette] Failed to execute action:', error);
      }
    })();
  };

  const getShortcutDisplay = (shortcut: string | undefined): string => {
    if (!shortcut) return '';
    return keyboardManager.getShortcutDisplay(shortcut);
  };

  console.log('[CommandPalette] Rendering with:', {
    isOpen,
    query,
    allActionsCount: allActions.length,
    recentActionsCount: recentActions.length,
    categoriesCount: actionsByCategory.size,
    availableActionsCount: availableActionIds.size,
  });

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="command-palette-dialog" onClose={onClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="command-palette-backdrop" />
        </TransitionChild>

        {/* Dialog panel */}
        <div className="command-palette-container">
          <div className="command-palette-wrapper">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className="command-palette-panel"
                onWheel={(e) => e.stopPropagation()}
              >
                <Combobox value={null} onChange={handleSelect}>
                  <div className="command-palette-combobox">
                    {/* Search input */}
                    <ComboboxInput
                      autoFocus
                      className="command-palette-input"
                      placeholder="Search actions..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      autoComplete="off"
                    />

                    {/* Results */}
                    <ComboboxOptions static className="command-palette-options">
                      {/* Empty state */}
                      {filteredActions.length === 0 && (
                        <div className="command-palette-empty">
                          No actions found
                        </div>
                      )}

                      {/* Recent actions section (only when no query) */}
                      {!query && recentActions.length > 0 && (
                        <div className="command-palette-section">
                          <div className="command-palette-section-title">
                            Recent
                          </div>
                          {recentActions.map((action) => {
                            const isAvailable = availableActionIds.has(
                              action.id,
                            );
                            return (
                              <ComboboxOption
                                key={`recent-${action.id}`}
                                value={{ action }}
                                className="command-palette-option"
                              >
                                {({ focus }) => (
                                  <div
                                    className={`command-palette-option-content ${
                                      focus ? 'focus' : ''
                                    } ${!isAvailable ? 'disabled' : ''}`}
                                  >
                                    <span className="command-palette-icon">
                                      {action.icon}
                                    </span>
                                    <span className="command-palette-label">
                                      {action.label}
                                    </span>
                                    {action.shortcut && (
                                      <span className="command-palette-shortcut">
                                        {getShortcutDisplay(action.shortcut)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </ComboboxOption>
                            );
                          })}
                          <div className="command-palette-divider" />
                        </div>
                      )}

                      {/* Actions grouped by category */}
                      {Array.from(actionsByCategory.entries()).map(
                        ([category, actions]) => (
                          <div
                            key={category}
                            className="command-palette-section"
                          >
                            <div className="command-palette-section-title">
                              {category}
                            </div>
                            {actions.map((action) => {
                              const isAvailable = availableActionIds.has(
                                action.id,
                              );
                              return (
                                <ComboboxOption
                                  key={`category-${category}-${action.id}`}
                                  value={{ action }}
                                  className="command-palette-option"
                                >
                                  {({ focus }) => (
                                    <div
                                      className={`command-palette-option-content ${
                                        focus ? 'focus' : ''
                                      } ${!isAvailable ? 'disabled' : ''}`}
                                    >
                                      <span className="command-palette-icon">
                                        {action.icon}
                                      </span>
                                      <div className="command-palette-details">
                                        <div className="command-palette-label">
                                          {action.label}
                                        </div>
                                        {action.description && (
                                          <div className="command-palette-description">
                                            {action.description}
                                          </div>
                                        )}
                                      </div>
                                      {action.shortcut && (
                                        <span className="command-palette-shortcut">
                                          {getShortcutDisplay(action.shortcut)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </ComboboxOption>
                              );
                            })}
                          </div>
                        ),
                      )}
                    </ComboboxOptions>
                  </div>
                </Combobox>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
