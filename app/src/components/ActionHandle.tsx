import { useEffect, useRef, useState } from 'react';
import { ActionRegistry } from '../actions/ActionRegistry';
import type { ActionContext } from '../actions/types';
import { getHandleDimensions } from '../utils/selectionBounds';
import { isTouchDevice } from '../utils/detectTouch';
import { Sparkles } from 'lucide-react';

export interface ActionHandleProps {
  screenCoords: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>; // M3.5.1-T6: Screen coordinates from renderer
  actionContext: ActionContext | null;
  onActionExecuted?: (actionId: string) => void;
}

/**
 * Action Handle (M3.5.1-T6)
 * Progressive disclosure action bar that appears when objects are selected.
 *
 * - Collapsed by default: small handle with context-aware icon
 * - Expands on click/hover/E key: shows action buttons
 * - Positioned above the center of the first selected object
 * - Touch-aware: larger hit targets on touch devices
 * - Hides during camera operations (managed by parent)
 */
export function ActionHandle({
  screenCoords,
  actionContext,
  onActionExecuted,
}: ActionHandleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const leaveTimeoutRef = useRef<number | null>(null);
  const [isTouch] = useState(isTouchDevice());
  const dimensions = getHandleDimensions(isTouch);

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
        event.preventDefault();
        setIsExpanded((prev) => !prev);
      } else if (event.key === 'Escape' && isExpanded) {
        event.preventDefault();
        setIsExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Calculate smart positioning: try top, right, left, bottom, or center
  // Use first object's screen coordinates from renderer
  const firstCoord = screenCoords[0];
  const margin = isTouch ? 30 : 25; // Extra space for touch devices

  // Estimate handle dimensions
  const handleWidth = isExpanded ? 250 : dimensions.handleWidth;
  const handleHeight = isExpanded
    ? dimensions.expandedHeight
    : dimensions.handleHeight;

  // Try positioning above (preferred)
  let handleX = firstCoord.x;
  let handleY = firstCoord.y - firstCoord.height / 2 - margin;

  // Check if top position is clipped
  const topClipped = handleY - handleHeight / 2 < 0;

  if (topClipped) {
    // Try right
    const rightX = firstCoord.x + firstCoord.width / 2 + margin;
    const rightY = firstCoord.y;
    if (rightX + handleWidth / 2 <= window.innerWidth) {
      handleX = rightX;
      handleY = rightY;
    } else {
      // Try left
      const leftX = firstCoord.x - firstCoord.width / 2 - margin;
      if (leftX - handleWidth / 2 >= 0) {
        handleX = leftX;
        handleY = firstCoord.y;
      } else {
        // Try bottom
        const bottomY = firstCoord.y + firstCoord.height / 2 + margin;
        if (bottomY + handleHeight / 2 <= window.innerHeight) {
          handleX = firstCoord.x;
          handleY = bottomY;
        } else {
          // All edges clipped - center on object
          handleX = firstCoord.x;
          handleY = firstCoord.y;
        }
      }
    }
  }

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
      className={`action-handle ${isExpanded ? 'expanded' : 'collapsed'} ${isTouch ? 'touch' : 'desktop'}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid="action-handle"
      style={{
        position: 'fixed',
        left: `${handleX}px`,
        top: `${handleY}px`,
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
