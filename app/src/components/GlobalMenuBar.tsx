import { useEffect, useRef, useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuItems,
  MenuItem,
  Transition,
} from '@headlessui/react';
import { isTouchDevice } from '../utils/detectTouch';

export interface GlobalMenuBarProps {
  interactionMode: 'pan' | 'select';
  onInteractionModeChange: (mode: 'pan' | 'select') => void;
  onCommandPaletteOpen: () => void;
  isMultiSelectMode?: boolean;
  onMultiSelectModeChange?: (enabled: boolean) => void;
  gridSnapEnabled?: boolean;
  onGridSnapEnabledChange?: (enabled: boolean) => void;
}

/**
 * Global menu bar component (M3.5.1-T5)
 * Fixed position toolbar in top-right corner with:
 * - Command Palette button
 * - Settings/Actions menu (Pan/Select toggle, future settings)
 * - Keyboard shortcuts: V (select mode), Space (temporary pan)
 */
export function GlobalMenuBar({
  interactionMode,
  onInteractionModeChange,
  onCommandPaletteOpen,
  isMultiSelectMode = false,
  onMultiSelectModeChange,
  gridSnapEnabled = false,
  onGridSnapEnabledChange,
}: GlobalMenuBarProps) {
  const spaceKeyDownRef = useRef(false);
  const previousModeRef = useRef<'pan' | 'select'>(interactionMode);
  const [isTouch] = useState(isTouchDevice());

  // Keyboard shortcuts: V key and Space hold
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // V key: Switch to select mode
      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault();
        onInteractionModeChange('select');
        return;
      }

      // G key: Toggle grid snap
      if ((event.key === 'g' || event.key === 'G') && onGridSnapEnabledChange) {
        event.preventDefault();
        onGridSnapEnabledChange(!gridSnapEnabled);
        return;
      }

      // Space key: Temporary pan mode (hold)
      if (event.key === ' ' && !spaceKeyDownRef.current) {
        event.preventDefault();
        spaceKeyDownRef.current = true;
        previousModeRef.current = interactionMode;
        onInteractionModeChange('pan');
        return;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Space key released: Return to previous mode
      if (event.key === ' ' && spaceKeyDownRef.current) {
        event.preventDefault();
        spaceKeyDownRef.current = false;
        onInteractionModeChange(previousModeRef.current);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    interactionMode,
    onInteractionModeChange,
    gridSnapEnabled,
    onGridSnapEnabledChange,
  ]);

  return (
    <div className="global-menu-bar">
      {/* Command Palette Button */}
      <button
        type="button"
        className="global-menu-button command-palette-trigger"
        onClick={onCommandPaletteOpen}
        aria-label="Open command palette"
      >
        <span className="button-icon">⌘</span>
      </button>

      {/* Settings/Actions Menu */}
      <Menu as="div" className="settings-menu-container">
        {({ open }) => (
          <>
            <MenuButton
              className="global-menu-button settings-button"
              aria-label="Settings and actions"
            >
              <span className="button-icon">⋮</span>
            </MenuButton>

            <Transition
              show={open}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems className="settings-menu-panel">
                {/* Interaction Mode Section */}
                <div className="menu-section">
                  <div className="menu-section-label">Interaction Mode</div>
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        type="button"
                        className={`menu-item ${focus ? 'focused' : ''} ${interactionMode === 'pan' ? 'active' : ''}`}
                        onClick={() => onInteractionModeChange('pan')}
                      >
                        <span className="menu-item-icon">🖐️</span>
                        <span className="menu-item-label">Pan</span>
                        {interactionMode === 'pan' && (
                          <span className="menu-item-check">✓</span>
                        )}
                      </button>
                    )}
                  </MenuItem>
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        type="button"
                        className={`menu-item ${focus ? 'focused' : ''} ${interactionMode === 'select' ? 'active' : ''}`}
                        onClick={() => onInteractionModeChange('select')}
                      >
                        <span className="menu-item-icon">🔲</span>
                        <span className="menu-item-label">Select</span>
                        {interactionMode === 'select' && (
                          <span className="menu-item-check">✓</span>
                        )}
                      </button>
                    )}
                  </MenuItem>
                </div>

                {/* Multi-Select Mode Section (Touch devices only) */}
                {isTouch && onMultiSelectModeChange && (
                  <div className="menu-section">
                    <div className="menu-section-label">Multi-Select Mode</div>
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          type="button"
                          className={`menu-item ${focus ? 'focused' : ''} ${isMultiSelectMode ? 'active' : ''}`}
                          onClick={() =>
                            onMultiSelectModeChange(!isMultiSelectMode)
                          }
                        >
                          <span className="menu-item-icon">
                            {isMultiSelectMode ? '✓' : '○'}
                          </span>
                          <span className="menu-item-label">
                            {isMultiSelectMode ? 'Enabled' : 'Disabled'}
                          </span>
                        </button>
                      )}
                    </MenuItem>
                    <div className="menu-section-help">
                      When enabled, touch selections add to current selection
                      instead of replacing it
                    </div>
                  </div>
                )}

                {/* Grid Snap Section */}
                {onGridSnapEnabledChange && (
                  <div className="menu-section">
                    <div className="menu-section-label">Grid Snap</div>
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          type="button"
                          className={`menu-item ${focus ? 'focused' : ''} ${gridSnapEnabled ? 'active' : ''}`}
                          onClick={() =>
                            onGridSnapEnabledChange(!gridSnapEnabled)
                          }
                        >
                          <span className="menu-item-icon">
                            {gridSnapEnabled ? '✓' : '○'}
                          </span>
                          <span className="menu-item-label">
                            {gridSnapEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </button>
                      )}
                    </MenuItem>
                    <div className="menu-section-help">
                      When enabled, objects snap to grid on drop (Shortcut: G)
                    </div>
                  </div>
                )}

                {/* Future: More settings sections can be added here */}
              </MenuItems>
            </Transition>
          </>
        )}
      </Menu>
    </div>
  );
}
