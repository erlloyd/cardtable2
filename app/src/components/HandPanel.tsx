import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { YjsStore } from '../store/YjsStore';
import type { GameAssets } from '@cardtable2/shared';
import { moveCardToBoard } from '../store/YjsHandActions';
import { stackObjects } from '../store/YjsActions';
import { computeFanLayout, CARD_WIDTH } from '../utils/fanLayout';
import { CardPreview } from './CardPreview';
import type { BoardHandle } from './Board';

interface PhantomDragFeedback {
  worldX: number;
  worldY: number;
  snapPos?: { x: number; y: number };
  stackTargetId?: string;
}

interface PhantomDragState {
  cardIndex: number;
  cardId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

export interface HandPanelProps {
  store: YjsStore;
  gameAssets: GameAssets | null;
  activeHandId: string | null;
  onActiveHandChange: (handId: string | null) => void;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  handIds: string[];
  isBoardDragging?: boolean;
  boardRef?: React.RefObject<BoardHandle | null>;
  phantomDragFeedback?: PhantomDragFeedback | null;
}

const DRAG_SLOP = 5;

export const HandPanel = forwardRef<HTMLDivElement, HandPanelProps>(
  function HandPanel(
    {
      store,
      gameAssets,
      activeHandId,
      onActiveHandChange,
      isCollapsed,
      onCollapsedChange,
      handIds,
      isBoardDragging,
      boardRef,
      phantomDragFeedback,
    },
    ref,
  ) {
    const [cards, setCards] = useState<string[]>([]);
    const [containerWidth, setContainerWidth] = useState(0);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [hoveredCardRect, setHoveredCardRect] = useState<DOMRect | null>(
      null,
    );
    const [phantomDrag, setPhantomDrag] = useState<PhantomDragState | null>(
      null,
    );
    const [landscapeCards, setLandscapeCards] = useState<Set<string>>(
      () => new Set(),
    );
    const [failedImages, setFailedImages] = useState<Set<string>>(
      () => new Set(),
    );

    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const panelRootRef = useRef<HTMLDivElement>(null);
    const phantomDragRef = useRef<PhantomDragState | null>(null);
    const phantomFeedbackRef = useRef<PhantomDragFeedback | null>(null);

    // Keep refs in sync
    phantomDragRef.current = phantomDrag;
    phantomFeedbackRef.current = phantomDragFeedback ?? null;

    // Subscribe to hand changes
    useEffect(() => {
      if (!store || !activeHandId) {
        setCards([]);
        return;
      }

      const refresh = () => {
        setCards(store.getHandCards(activeHandId));
      };

      refresh();
      return store.onHandsChange(refresh);
    }, [store, activeHandId]);

    // Measure container width with ResizeObserver
    useEffect(() => {
      const container = cardsContainerRef.current;
      if (!container) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });

      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    const handName = activeHandId ? store.getHandName(activeHandId) : '';
    const fanLayout = computeFanLayout(cards.length, containerWidth);

    const handleCreateHand = () => {
      const name = `Hand ${handIds.length + 1}`;
      const newId = store.createHand(name);
      onActiveHandChange(newId);
    };

    const handleDeleteHand = (handId: string) => {
      store.deleteHand(handId);
      if (activeHandId === handId) {
        const remaining = handIds.filter((h) => h !== handId);
        onActiveHandChange(remaining.length > 0 ? remaining[0] : null);
      }
    };

    const handlePlayCard = (cardIndex: number) => {
      if (!activeHandId) return;
      moveCardToBoard(
        store,
        activeHandId,
        cardIndex,
        { x: 0, y: 0, r: 0 },
        true,
      );
    };

    const getCardImageUrl = useCallback(
      (cardId: string): string | null => {
        if (!gameAssets) return null;
        return gameAssets.cards[cardId]?.face ?? null;
      },
      [gameAssets],
    );

    const handleImageLoad = useCallback(
      (cardId: string, e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth > img.naturalHeight) {
          setLandscapeCards((prev) => {
            if (prev.has(cardId)) return prev;
            const next = new Set(prev);
            next.add(cardId);
            return next;
          });
        }
      },
      [],
    );

    const handleImageError = useCallback((cardId: string) => {
      setFailedImages((prev) => {
        if (prev.has(cardId)) return prev;
        const next = new Set(prev);
        next.add(cardId);
        return next;
      });
    }, []);

    // Hover handlers
    const handleCardPointerEnter = useCallback(
      (index: number, e: React.PointerEvent<HTMLDivElement>) => {
        if (phantomDragRef.current?.isDragging) return;
        setHoveredIndex(index);
        setHoveredCardRect(e.currentTarget.getBoundingClientRect());
      },
      [],
    );

    const handleCardPointerLeave = useCallback(() => {
      if (phantomDragRef.current?.isDragging) return;
      setHoveredIndex(null);
      setHoveredCardRect(null);
    }, []);

    // Phantom drag — pointer down on a card
    const handleCardPointerDown = useCallback(
      (
        index: number,
        cardId: string,
        e: React.PointerEvent<HTMLDivElement>,
      ) => {
        if (e.button !== 0) return;
        e.preventDefault();

        setPhantomDrag({
          cardIndex: index,
          cardId,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
          isDragging: false,
        });
      },
      [],
    );

    // Phantom drag — window pointermove + pointerup
    useEffect(() => {
      if (!phantomDrag) return;

      const handleMove = (e: PointerEvent) => {
        const current = phantomDragRef.current;
        if (!current) return;

        const dx = e.clientX - current.startX;
        const dy = e.clientY - current.startY;

        if (!current.isDragging) {
          if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;

          // Start phantom drag
          setPhantomDrag((prev) =>
            prev
              ? {
                  ...prev,
                  isDragging: true,
                  currentX: e.clientX,
                  currentY: e.clientY,
                }
              : null,
          );

          // Clear hover state
          setHoveredIndex(null);
          setHoveredCardRect(null);

          // Notify renderer
          boardRef?.current?.sendRendererMessage({
            type: 'phantom-drag-start',
          });
          return;
        }

        // Update position
        setPhantomDrag((prev) =>
          prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null,
        );

        // Send move to renderer for stack/snap detection
        const canvasPos = boardRef?.current?.viewportToCanvas(
          e.clientX,
          e.clientY,
        );
        if (canvasPos) {
          boardRef?.current?.sendRendererMessage({
            type: 'phantom-drag-move',
            canvasX: canvasPos.x,
            canvasY: canvasPos.y,
          });
        }
      };

      const handleUp = (e: PointerEvent) => {
        const current = phantomDragRef.current;
        if (!current) return;

        if (current.isDragging) {
          // Check if drop is over the hand panel (cancel) or the board (drop)
          const panelEl = panelRootRef.current;
          const isOverPanel =
            panelEl &&
            e.clientX >= panelEl.getBoundingClientRect().left &&
            e.clientX <= panelEl.getBoundingClientRect().right &&
            e.clientY >= panelEl.getBoundingClientRect().top &&
            e.clientY <= panelEl.getBoundingClientRect().bottom;

          if (!isOverPanel && activeHandId) {
            // Drop on board
            const feedback = phantomFeedbackRef.current;
            const pos = feedback?.snapPos ?? {
              x: feedback?.worldX ?? 0,
              y: feedback?.worldY ?? 0,
            };

            const newStackId = moveCardToBoard(
              store,
              activeHandId,
              current.cardIndex,
              { x: pos.x, y: pos.y, r: 0 },
              true,
            );

            // If dropping on a stack target, merge
            if (newStackId && feedback?.stackTargetId) {
              try {
                stackObjects(store, [newStackId], feedback.stackTargetId);
              } catch (err) {
                console.error('[HandPanel] Stack merge failed:', err);
              }
            }
          }

          // Notify renderer to clean up
          boardRef?.current?.sendRendererMessage({ type: 'phantom-drag-end' });
        }

        setPhantomDrag(null);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      return () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
    }, [phantomDrag, activeHandId, boardRef, store]);

    // Calculate card position in fan
    const getCardLeft = useCallback(
      (index: number) => {
        return fanLayout.startOffset + index * (CARD_WIDTH - fanLayout.overlap);
      },
      [fanLayout],
    );

    // Collapsed state
    if (isCollapsed) {
      return (
        <div
          ref={(node) => {
            panelRootRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={`hand-panel hand-panel--collapsed${isBoardDragging ? ' hand-panel--drop-target' : ''}`}
        >
          <button
            className="hand-panel__toggle"
            onClick={() => onCollapsedChange(false)}
            aria-label="Expand hand panel"
          >
            &#9650;
          </button>
          <span className="hand-panel__name">{handName}</span>
          <span className="hand-panel__count">
            {cards.length} {cards.length === 1 ? 'card' : 'cards'}
          </span>
        </div>
      );
    }

    // Hover preview position: above the hovered card
    const previewPosition =
      hoveredIndex !== null && hoveredCardRect
        ? {
            x: hoveredCardRect.left + hoveredCardRect.width / 2 - 75,
            y: hoveredCardRect.top - 220,
          }
        : null;

    const hoveredCard =
      hoveredIndex !== null && gameAssets
        ? (gameAssets.cards[cards[hoveredIndex]] ?? null)
        : null;

    // Phantom drag ghost image URL
    const phantomGhostUrl = phantomDrag?.isDragging
      ? getCardImageUrl(phantomDrag.cardId)
      : null;

    return (
      <div
        ref={(node) => {
          panelRootRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={`hand-panel${isBoardDragging ? ' hand-panel--drop-target' : ''}`}
      >
        <div className="hand-panel__header">
          <div className="hand-panel__tabs">
            {handIds.map((hid) => (
              <span key={hid} className="hand-panel__tab-wrapper">
                <button
                  className={`hand-panel__tab${hid === activeHandId ? ' hand-panel__tab--active' : ''}`}
                  onClick={() => onActiveHandChange(hid)}
                >
                  {store.getHandName(hid) || 'Hand'}
                </button>
                <button
                  className="hand-panel__tab-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteHand(hid);
                  }}
                  title="Delete hand"
                  aria-label={`Delete ${store.getHandName(hid) || 'hand'}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="hand-panel__header-actions">
            <button
              className="hand-panel__create-btn"
              onClick={handleCreateHand}
              title="Create new hand"
            >
              +
            </button>
            <button
              className="hand-panel__toggle"
              onClick={() => onCollapsedChange(true)}
              aria-label="Collapse hand panel"
            >
              &#9660;
            </button>
          </div>
        </div>

        <div className="hand-panel__cards" ref={cardsContainerRef}>
          {cards.length === 0 ? (
            <div className="hand-panel__empty">
              {handIds.length === 0
                ? 'Create a hand to get started.'
                : 'No cards in hand. Select a card on the board and use "Add to Hand" (A).'}
            </div>
          ) : containerWidth === 0 ? null : (
            cards.map((cardId, index) => {
              const imageUrl = getCardImageUrl(cardId);
              const isHovered = hoveredIndex === index;
              const isDragSource =
                phantomDrag?.isDragging && phantomDrag.cardIndex === index;

              const className = [
                'hand-panel__card',
                isHovered && !phantomDrag?.isDragging
                  ? 'hand-panel__card--hovered'
                  : '',
                isDragSource ? 'hand-panel__card--dragging-source' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={`${cardId}-${index}`}
                  className={className}
                  style={{
                    left: `${getCardLeft(index)}px`,
                    zIndex: isHovered ? 999 : index,
                  }}
                  onPointerEnter={(e) => handleCardPointerEnter(index, e)}
                  onPointerLeave={handleCardPointerLeave}
                  onPointerDown={(e) => handleCardPointerDown(index, cardId, e)}
                >
                  {imageUrl && !failedImages.has(cardId) ? (
                    <img
                      src={imageUrl}
                      alt={cardId}
                      className="hand-panel__card-img"
                      draggable={false}
                      onLoad={(e) => handleImageLoad(cardId, e)}
                      onError={() => handleImageError(cardId)}
                      style={
                        landscapeCards.has(cardId)
                          ? {
                              transform: 'rotate(90deg)',
                              width: '100px',
                              height: 'auto',
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="hand-panel__card-placeholder">{cardId}</div>
                  )}
                  {!phantomDrag?.isDragging && (
                    <button
                      className="hand-panel__play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayCard(index);
                      }}
                      title="Play card to board"
                    >
                      Play
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Hover preview */}
        {hoveredCard && previewPosition && !phantomDrag?.isDragging && (
          <CardPreview
            card={hoveredCard}
            gameAssets={gameAssets}
            mode="hover"
            position={previewPosition}
            onClose={() => {
              setHoveredIndex(null);
              setHoveredCardRect(null);
            }}
          />
        )}

        {/* Phantom drag ghost */}
        {phantomDrag?.isDragging && phantomGhostUrl && (
          <div
            className="hand-panel__phantom-ghost"
            style={{
              left: `${phantomDrag.currentX}px`,
              top: `${phantomDrag.currentY}px`,
            }}
          >
            <img
              src={phantomGhostUrl}
              alt="Dragging card"
              draggable={false}
              style={
                phantomDrag?.cardId && landscapeCards.has(phantomDrag.cardId)
                  ? {
                      transform: 'rotate(90deg)',
                      width: '100px',
                      height: 'auto',
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    );
  },
);
