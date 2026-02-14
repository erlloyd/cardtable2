import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { ActionRegistry } from '../actions/ActionRegistry';
import { KeyboardManager } from '../actions/KeyboardManager';
import type { Action, ActionContext } from '../actions/types';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  context: ActionContext | null;
}

export function ContextMenu({
  isOpen,
  position,
  onClose,
  context,
}: ContextMenuProps) {
  const actionRegistry = ActionRegistry.getInstance();
  const keyboardManager = useMemo(
    () => new KeyboardManager(actionRegistry),
    [actionRegistry],
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  // Get available actions
  const actions = context ? actionRegistry.getAvailableActions(context) : [];

  // Debug logging
  if (context) {
    console.log('[ContextMenu] Available actions:', {
      totalActions: actions.length,
      selectionCount: context.selection.count,
      actionIds: actions.map((a) => a.id),
    });
  }

  // Group actions by category
  const actionsByCategory = new Map<string, Action[]>();
  for (const action of actions) {
    const category = action.category;
    const existing = actionsByCategory.get(category) || [];
    actionsByCategory.set(category, [...existing, action]);
  }

  // Margin in pixels from viewport edge
  const VIEWPORT_MARGIN = 8;

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) {
      setAdjustedPosition(position);
      setMaxHeight(undefined);
      return;
    }

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Check if menu would clip off right edge
    if (x + menuRect.width > viewportWidth) {
      x = viewportWidth - menuRect.width - VIEWPORT_MARGIN;
    }

    // Check if menu would clip off bottom
    if (y + menuRect.height > viewportHeight) {
      y = viewportHeight - menuRect.height - VIEWPORT_MARGIN;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(VIEWPORT_MARGIN, x);
    y = Math.max(VIEWPORT_MARGIN, y);

    setAdjustedPosition({ x, y });
    setMaxHeight(viewportHeight - y - VIEWPORT_MARGIN);
  }, [isOpen, position]);

  const handleSelect = (action: Action) => {
    if (!context) return;

    // Execute action asynchronously
    void (async () => {
      try {
        await actionRegistry.execute(action.id, context);
        onClose();
      } catch (error) {
        console.error('[ContextMenu] Failed to execute action:', error);
      }
    })();
  };

  const getShortcutDisplay = (shortcut: string | undefined): string => {
    if (!shortcut) return '';
    return keyboardManager.getShortcutDisplay(shortcut);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to detect clicks outside and close menu */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99,
        }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      <Menu>
        <MenuButton as={Fragment}>
          <div
            style={{
              position: 'fixed',
              left: adjustedPosition.x,
              top: adjustedPosition.y,
              width: 0,
              height: 0,
            }}
          />
        </MenuButton>

        <MenuItems
          ref={menuRef}
          static
          className="context-menu"
          style={{
            position: 'fixed',
            left: adjustedPosition.x,
            top: adjustedPosition.y,
            maxHeight,
          }}
        >
          {actions.length === 0 && (
            <div className="context-menu-empty">No actions available</div>
          )}

          {Array.from(actionsByCategory.entries()).map(
            ([category, categoryActions], index) => (
              <Fragment key={category}>
                {index > 0 && <div className="context-menu-divider" />}
                <div className="context-menu-section">
                  <div className="context-menu-section-title">{category}</div>
                  {categoryActions.map((action) => {
                    // Resolve dynamic label
                    const label =
                      typeof action.label === 'function' && context
                        ? action.label(context)
                        : typeof action.label === 'string'
                          ? action.label
                          : '';
                    return (
                      <MenuItem key={action.id}>
                        {({ focus }) => (
                          <button
                            type="button"
                            className={`context-menu-item ${focus ? 'focus' : ''}`}
                            onClick={() => handleSelect(action)}
                          >
                            <span className="context-menu-icon">
                              {action.icon}
                            </span>
                            <span className="context-menu-label">{label}</span>
                            {action.shortcut && (
                              <span className="context-menu-shortcut">
                                {getShortcutDisplay(action.shortcut)}
                              </span>
                            )}
                          </button>
                        )}
                      </MenuItem>
                    );
                  })}
                </div>
              </Fragment>
            ),
          )}
        </MenuItems>
      </Menu>
    </>
  );
}
