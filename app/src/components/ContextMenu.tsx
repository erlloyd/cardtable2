import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent } from 'react';
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

  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const parentRowRefs = useRef(new Map<string, HTMLButtonElement>());
  const submenuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusSubmenuOnOpen = useRef(false);

  const openSubmenuAction = openSubmenuId
    ? actions.find((a) => a.id === openSubmenuId)
    : undefined;

  const resolveLabel = (label: Action['label']): string => {
    if (typeof label === 'function') return context ? label(context) : '';
    return label;
  };

  const closeSubmenu = (restoreFocus: boolean) => {
    if (openSubmenuId && restoreFocus) {
      parentRowRefs.current.get(openSubmenuId)?.focus();
    }
    setOpenSubmenuId(null);
    setSubmenuPosition(null);
  };

  const openSubmenu = (actionId: string, focusFirst: boolean) => {
    focusSubmenuOnOpen.current = focusFirst;
    setOpenSubmenuId(actionId);
  };

  // Place the submenu beside its parent row, flipping to the left when it
  // would overflow the right edge and clamping to the viewport vertically.
  useLayoutEffect(() => {
    const row = openSubmenuId
      ? parentRowRefs.current.get(openSubmenuId)
      : undefined;
    const panel = submenuRef.current;
    if (!row || !panel) return;

    const rowRect = row.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let x = rowRect.right;
    if (x + panelRect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = rowRect.left - panelRect.width;
    }

    let y = rowRect.top;
    if (y + panelRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = window.innerHeight - panelRect.height - VIEWPORT_MARGIN;
    }
    y = Math.max(VIEWPORT_MARGIN, y);

    setSubmenuPosition({ x, y });
  }, [openSubmenuId, adjustedPosition]);

  useEffect(() => {
    if (openSubmenuId && focusSubmenuOnOpen.current) {
      focusSubmenuOnOpen.current = false;
      submenuItemRefs.current[0]?.focus();
    }
  }, [openSubmenuId]);

  const executeAndClose = (run: (ctx: ActionContext) => Promise<void>) => {
    if (!context) return;

    // Execute action asynchronously
    void (async () => {
      try {
        await run(context);
        onClose();
      } catch (error) {
        console.error('[ContextMenu] Failed to execute action:', error);
      }
    })();
  };

  const handleSelect = (action: Action) => {
    executeAndClose((ctx) => actionRegistry.execute(action.id, ctx));
  };

  const handleSelectVariant = (action: Action, variantId: string) => {
    executeAndClose((ctx) =>
      actionRegistry.executeVariant(action.id, variantId, ctx),
    );
  };

  const handleSubmenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = submenuItemRefs.current.filter(
      (el): el is HTMLButtonElement => el !== null,
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'ArrowLeft':
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu(true);
        break;
    }
  };

  const handleParentKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    action: Action,
  ) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openSubmenu(action.id, true);
    }
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
                    const label = resolveLabel(action.label);
                    const hasVariants = (action.variants?.length ?? 0) > 0;
                    return (
                      <MenuItem key={action.id}>
                        {({ focus }) => (
                          <button
                            type="button"
                            className={`context-menu-item ${focus ? 'focus' : ''}`}
                            {...(hasVariants
                              ? {
                                  'data-testid': `context-menu-item-${action.id}`,
                                  'aria-haspopup': 'menu' as const,
                                  'aria-expanded': openSubmenuId === action.id,
                                  ref: (el: HTMLButtonElement | null) => {
                                    if (el) {
                                      parentRowRefs.current.set(action.id, el);
                                    } else {
                                      parentRowRefs.current.delete(action.id);
                                    }
                                  },
                                  onClick: () => openSubmenu(action.id, false),
                                  onKeyDown: (
                                    e: KeyboardEvent<HTMLButtonElement>,
                                  ) => handleParentKeyDown(e, action),
                                }
                              : { onClick: () => handleSelect(action) })}
                            onMouseEnter={() =>
                              hasVariants
                                ? openSubmenu(action.id, false)
                                : closeSubmenu(false)
                            }
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
                            {hasVariants && (
                              <span className="context-menu-submenu-arrow">
                                ▸
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

      {openSubmenuAction && (
        <div
          ref={submenuRef}
          role="menu"
          className="context-menu"
          style={{
            position: 'fixed',
            left: submenuPosition?.x ?? adjustedPosition.x,
            top: submenuPosition?.y ?? adjustedPosition.y,
            visibility: submenuPosition ? 'visible' : 'hidden',
          }}
          onKeyDown={handleSubmenuKeyDown}
        >
          {openSubmenuAction.variants?.map((variant, i) => (
            <button
              key={variant.id}
              ref={(el) => {
                submenuItemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="context-menu-item"
              data-testid={`context-submenu-item-${openSubmenuAction.id}-${variant.id}`}
              onClick={() => handleSelectVariant(openSubmenuAction, variant.id)}
            >
              <span className="context-menu-label">
                {resolveLabel(variant.label)}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
