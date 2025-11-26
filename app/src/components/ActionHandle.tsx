import { useEffect, useRef, useState } from 'react';
import type { TableObject } from '@cardtable2/shared';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';
import {
  getHandleDimensions,
  calculateSelectionBounds,
  calculateHandlePosition,
} from '../utils/selectionBounds';
import { isTouchDevice } from '../utils/detectTouch';
import { Sparkles } from 'lucide-react';

export interface ActionHandleProps {
  selectedObjects: TableObject[];
  actionContext: ActionContext | null;
  isDragging: boolean; // Hide handle during drag
  onActionExecuted?: (actionId: string) => void;
  // Viewport and camera info for positioning
  viewportWidth: number;
  viewportHeight: number;
  cameraX: number;
  cameraY: number;
  cameraScale: number;
}

/**
 * Action Handle (M3.5.1-T6)
 * Progressive disclosure action bar that appears when objects are selected.
 *
 * - Collapsed by default: small handle with context-aware icon
 * - Expands on click/hover/E key: shows action buttons
 * - Smart positioning: avoids viewport edges
 * - Touch-aware: larger hit targets on touch devices
 * - Follows selection with smooth animation
 */
export function ActionHandle({
  selectedObjects,
  actionContext,
  isDragging,
  onActionExecuted,
  viewportWidth,
  viewportHeight,
  cameraX,
  cameraY,
  cameraScale,
}: ActionHandleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const leaveTimeoutRef = useRef<number | null>(null);
  const [isTouch] = useState(isTouchDevice());
  const dimensions = getHandleDimensions(isTouch);

  // Show/hide handle based on selection
  useEffect(() => {
    if (selectedObjects.length === 0 || isDragging) {
      setIsVisible(false);
      setIsExpanded(false);
      return;
    }

    setIsVisible(true);
  }, [selectedObjects, isDragging]);

  // Keyboard shortcuts: E to toggle, Escape to collapse
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === 'e' || event.key === 'E') {
        if (selectedObjects.length > 0 && !isDragging) {
          event.preventDefault();
          setIsExpanded((prev) => !prev);
        }
      } else if (event.key === 'Escape' && isExpanded) {
        event.preventDefault();
        setIsExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjects, isDragging, isExpanded]);

  // Hide when no selection or dragging
  if (!isVisible || selectedObjects.length === 0 || isDragging) {
    return null;
  }

  // Calculate position based on selection bounds (only when visible)
  const selectionBounds = calculateSelectionBounds(selectedObjects);
  const position = calculateHandlePosition(
    selectionBounds,
    viewportWidth,
    viewportHeight,
    cameraX,
    cameraY,
    cameraScale,
    dimensions.handleWidth,
    dimensions.handleHeight,
    200, // expandedWidth estimate
    dimensions.expandedHeight,
    8, // margin
  );

  // Consistent icon component for all selections
  const IconComponent = Sparkles;

  // Get available actions
  const availableActions = actionContext
    ? ActionRegistry.getInstance().getAvailableActions(actionContext)
    : [];

  // Split into main actions (top 2-3) and more menu
  const mainActions = availableActions.slice(0, 3);
  const moreActions = availableActions.slice(3);

  const handleClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleMouseEnter = () => {
    // Cancel any pending leave timeout
    if (leaveTimeoutRef.current) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    if (!isTouch) {
      // Desktop: expand on hover after 200ms
      hoverTimeoutRef.current = window.setTimeout(() => {
        setIsExpanded(true);
      }, 200);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Collapse after 300ms delay when mouse leaves (desktop only)
    if (!isTouch && isExpanded) {
      leaveTimeoutRef.current = window.setTimeout(() => {
        setIsExpanded(false);
      }, 300);
    }
  };

  const handleActionClick = (actionId: string) => {
    if (!actionContext) return;

    const registry = ActionRegistry.getInstance();
    void registry.execute(actionId, actionContext);

    // Collapse after action
    setIsExpanded(false);

    // Notify parent
    onActionExecuted?.(actionId);
  };

  return (
    <div
      className={`action-handle ${isExpanded ? 'expanded' : 'collapsed'} ${isTouch ? 'touch' : 'desktop'} ${position.flipToLeft ? 'flip-left' : ''} ${position.flipToBottom ? 'flip-bottom' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid="action-handle"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isExpanded ? 'auto' : dimensions.handleWidth,
        height: isExpanded
          ? dimensions.expandedHeight
          : dimensions.handleHeight,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {!isExpanded ? (
        // Collapsed state: just the icon
        <div className="action-handle-icon" data-testid="action-handle-icon">
          <IconComponent size={isTouch ? 24 : 16} strokeWidth={2} />
        </div>
      ) : (
        // Expanded state: action buttons
        <div className="action-handle-bar" data-testid="action-handle-bar">
          {mainActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="action-button"
              onClick={(e) => {
                e.stopPropagation();
                handleActionClick(action.id);
              }}
              title={action.description}
              data-testid={`action-button-${action.id}`}
            >
              <span className="action-button-icon">{action.icon}</span>
              {!isTouch && (
                <span className="action-button-label">{action.label}</span>
              )}
            </button>
          ))}
          {moreActions.length > 0 && (
            <button
              type="button"
              className="action-button more-button"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Open more menu
                console.log('More menu', moreActions);
              }}
              title="More actions"
              data-testid="action-button-more"
            >
              <span className="action-button-icon">⋮</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
