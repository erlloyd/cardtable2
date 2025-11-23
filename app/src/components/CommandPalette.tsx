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
  const [query, setQuery] = useState('');
  const actionRegistry = ActionRegistry.getInstance();
  const keyboardManager = new KeyboardManager(actionRegistry);

  // Get all actions
  const allActions = useMemo(
    () => actionRegistry.getAllActions(),
    [actionRegistry],
  );

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

    return groups;
  }, [filteredActions]);

  // Check which actions are available in current context
  const availableActionIds = useMemo(() => {
    if (!context) return new Set<string>();

    const available = actionRegistry.getAvailableActions(context);
    return new Set(available.map((a) => a.id));
  }, [context, actionRegistry]);

  const handleSelect = (action: Action | null) => {
    if (!action || !context) return;

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

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
          <div className="fixed inset-0 bg-black/50" />
        </TransitionChild>

        {/* Dialog panel */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 pt-32">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-2xl">
                <Combobox value={null} onChange={handleSelect}>
                  <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
                    {/* Search input */}
                    <ComboboxInput
                      className="w-full border-0 bg-transparent px-4 py-4 text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
                      placeholder="Search actions..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      autoComplete="off"
                    />

                    {/* Results */}
                    <ComboboxOptions
                      static
                      className="max-h-96 scroll-py-2 overflow-y-auto border-t border-gray-100"
                    >
                      {/* Empty state */}
                      {filteredActions.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                          No actions found
                        </div>
                      )}

                      {/* Recent actions section (only when no query) */}
                      {!query && recentActions.length > 0 && (
                        <div className="px-2 py-2">
                          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Recent
                          </div>
                          {recentActions.map((action) => {
                            const isAvailable = availableActionIds.has(
                              action.id,
                            );
                            return (
                              <ComboboxOption
                                key={action.id}
                                value={action}
                                className={({ focus }) =>
                                  `flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${
                                    focus
                                      ? 'bg-indigo-600 text-white'
                                      : 'text-gray-900'
                                  } ${!isAvailable ? 'opacity-50' : ''}`
                                }
                              >
                                {({ focus }) => (
                                  <>
                                    <span className="text-xl">
                                      {action.icon}
                                    </span>
                                    <span className="flex-1 truncate text-sm font-medium">
                                      {action.label}
                                    </span>
                                    {action.shortcut && (
                                      <span
                                        className={`text-xs ${
                                          focus
                                            ? 'text-indigo-200'
                                            : 'text-gray-400'
                                        }`}
                                      >
                                        {getShortcutDisplay(action.shortcut)}
                                      </span>
                                    )}
                                  </>
                                )}
                              </ComboboxOption>
                            );
                          })}
                          <div className="my-2 border-t border-gray-200" />
                        </div>
                      )}

                      {/* Actions grouped by category */}
                      {Array.from(actionsByCategory.entries()).map(
                        ([category, actions]) => (
                          <div key={category} className="px-2 py-2">
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {category}
                            </div>
                            {actions.map((action) => {
                              const isAvailable = availableActionIds.has(
                                action.id,
                              );
                              return (
                                <ComboboxOption
                                  key={action.id}
                                  value={action}
                                  className={({ focus }) =>
                                    `flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${
                                      focus
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-900'
                                    } ${!isAvailable ? 'opacity-50' : ''}`
                                  }
                                >
                                  {({ focus }) => (
                                    <>
                                      <span className="text-xl">
                                        {action.icon}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">
                                          {action.label}
                                        </div>
                                        {action.description && (
                                          <div
                                            className={`text-xs truncate ${
                                              focus
                                                ? 'text-indigo-200'
                                                : 'text-gray-500'
                                            }`}
                                          >
                                            {action.description}
                                          </div>
                                        )}
                                      </div>
                                      {action.shortcut && (
                                        <span
                                          className={`text-xs ${
                                            focus
                                              ? 'text-indigo-200'
                                              : 'text-gray-400'
                                          }`}
                                        >
                                          {getShortcutDisplay(action.shortcut)}
                                        </span>
                                      )}
                                    </>
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
