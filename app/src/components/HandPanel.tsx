import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { YjsStore } from '../store/YjsStore';
import type { Card, GameAssets } from '@cardtable2/shared';
import { moveCardToBoard } from '../store/YjsHandActions';
import { stackObjects } from '../store/YjsActions';
import { computeFanLayout, CARD_WIDTH } from '../utils/fanLayout';
import { CardPreview } from './CardPreview';
import { FullScreenCardPreview } from './FullScreenCardPreview';
import {
  getPreviewDimensions,
  getLandscapeDimensions,
} from '../constants/previewSizes';
import type { BoardHandle } from './Board';

const MOBILE_BREAKPOINT = 768;
const DOUBLE_TAP_THRESHOLD = 300;
const SCROLL_AMOUNT_CARDS = 3;

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
  isStackDragOverHand?: boolean;
  boardRef?: React.RefObject<BoardHandle | null>;
  phantomDragFeedback?: PhantomDragFeedback | null;
  onPhantomDragActiveChange?: (active: boolean) => void;
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
      isStackDragOverHand,
      boardRef,
      phantomDragFeedback,
      onPhantomDragActiveChange,
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
    const [isMobile, setIsMobile] = useState(
      () => window.innerWidth < MOBILE_BREAKPOINT,
    );
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [doubleTapPreviewCard, setDoubleTapPreviewCard] =
      useState<Card | null>(null);

    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const panelRootRef = useRef<HTMLDivElement>(null);
    const phantomDragRef = useRef<PhantomDragState | null>(null);
    const phantomFeedbackRef = useRef<PhantomDragFeedback | null>(null);
    const lastTapTimeRef = useRef<Map<number, number>>(new Map());
    const headerSwipeRef = useRef<{
      startX: number;
      scrollLeft: number;
    } | null>(null);

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

    // Track window resize for mobile breakpoint
    useEffect(() => {
      const handleResize = () => {
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Track scroll position for arrow button visibility
    const updateScrollState = useCallback(() => {
      const container = cardsContainerRef.current;
      if (!container) return;
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft <
          container.scrollWidth - container.clientWidth - 1,
      );
    }, []);

    useEffect(() => {
      const container = cardsContainerRef.current;
      if (!container || !isMobile) return;
      updateScrollState();
      container.addEventListener('scroll', updateScrollState);
      return () => container.removeEventListener('scroll', updateScrollState);
    }, [isMobile, updateScrollState]);

    // Update scroll arrows when cards or layout changes
    useEffect(() => {
      if (isMobile) {
        // Defer to next frame so DOM has updated
        requestAnimationFrame(updateScrollState);
      }
    }, [cards.length, containerWidth, isMobile, updateScrollState]);

    const handName = activeHandId ? store.getHandName(activeHandId) : '';
    const fanLayout = computeFanLayout(cards.length, containerWidth, isMobile);

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
      setHoveredIndex(null);
      setHoveredCardRect(null);
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

    // Scroll arrow handlers
    const handleScrollLeft = useCallback(() => {
      const container = cardsContainerRef.current;
      if (!container) return;
      const scrollBy = SCROLL_AMOUNT_CARDS * (CARD_WIDTH - fanLayout.overlap);
      container.scrollBy({ left: -scrollBy, behavior: 'smooth' });
    }, [fanLayout.overlap]);

    const handleScrollRight = useCallback(() => {
      const container = cardsContainerRef.current;
      if (!container) return;
      const scrollBy = SCROLL_AMOUNT_CARDS * (CARD_WIDTH - fanLayout.overlap);
      container.scrollBy({ left: scrollBy, behavior: 'smooth' });
    }, [fanLayout.overlap]);

    // Header swipe-to-scroll
    const handleHeaderPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isMobile) return;
        const container = cardsContainerRef.current;
        if (!container) return;
        headerSwipeRef.current = {
          startX: e.clientX,
          scrollLeft: container.scrollLeft,
        };
      },
      [isMobile],
    );

    const handleHeaderPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!headerSwipeRef.current) return;
        const container = cardsContainerRef.current;
        if (!container) return;
        const dx = e.clientX - headerSwipeRef.current.startX;
        container.scrollLeft = headerSwipeRef.current.scrollLeft - dx;
      },
      [],
    );

    const handleHeaderPointerUp = useCallback(() => {
      headerSwipeRef.current = null;
    }, []);

    // Double-tap to preview (touch devices only, matching board behavior)
    const handleCardTap = useCallback(
      (index: number, pointerType: string) => {
        if (pointerType !== 'touch') return;
        const now = Date.now();
        const lastTap = lastTapTimeRef.current.get(index) ?? 0;
        if (now - lastTap < DOUBLE_TAP_THRESHOLD) {
          const cardId = cards[index];
          const card =
            cardId && gameAssets ? (gameAssets.cards[cardId] ?? null) : null;
          if (card) {
            setDoubleTapPreviewCard(card);
          }
          lastTapTimeRef.current.delete(index);
        } else {
          lastTapTimeRef.current.set(index, now);
        }
      },
      [cards, gameAssets],
    );

    // Hover handlers
    const handleCardPointerEnter = useCallback(
      (index: number, e: React.PointerEvent<HTMLDivElement>) => {
        if (phantomDragRef.current?.isDragging) return;
        setHoveredIndex(index);
        setHoveredCardRect(new DOMRect(e.clientX, e.clientY, 0, 0));
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

        // Track taps for double-tap preview (touch only)
        handleCardTap(index, e.pointerType);

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
      [handleCardTap],
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

          // Notify renderer and parent
          boardRef?.current?.sendRendererMessage({
            type: 'phantom-drag-start',
          });
          onPhantomDragActiveChange?.(true);
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

          // Notify renderer and parent to clean up
          boardRef?.current?.sendRendererMessage({ type: 'phantom-drag-end' });
          onPhantomDragActiveChange?.(false);
        }

        setPhantomDrag(null);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      return () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
    }, [phantomDrag, activeHandId, boardRef, store, onPhantomDragActiveChange]);

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
          className={`hand-panel hand-panel--collapsed${isStackDragOverHand ? ' hand-panel--drop-target' : ''}`}
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

    // Hover preview position: bottom of preview 10px above hand panel top
    const PREVIEW_GAP = 10;
    const panelTop =
      panelRootRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const previewPosition = (() => {
      if (hoveredIndex === null || !hoveredCardRect) return null;
      const hoveredCardId = cards[hoveredIndex];
      const isLandscape = hoveredCardId && landscapeCards.has(hoveredCardId);
      const baseDims = getPreviewDimensions('medium');
      const dims = isLandscape ? getLandscapeDimensions(baseDims) : baseDims;
      return {
        x: hoveredCardRect.x - dims.width / 2,
        y: panelTop - PREVIEW_GAP - dims.height,
      };
    })();

    const hoveredCard =
      hoveredIndex !== null && gameAssets
        ? (gameAssets.cards[cards[hoveredIndex]] ?? null)
        : null;

    // Phantom drag ghost image URL
    const phantomGhostUrl = phantomDrag?.isDragging
      ? getCardImageUrl(phantomDrag.cardId)
      : null;

    return (
      <>
        <div
          ref={(node) => {
            panelRootRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={`hand-panel${isStackDragOverHand ? ' hand-panel--drop-target' : ''}`}
        >
          <div
            className="hand-panel__header"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
          >
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

          <div className="hand-panel__cards-wrapper">
            {isMobile && canScrollLeft && (
              <button
                className="hand-panel__scroll-arrow hand-panel__scroll-arrow--left"
                onClick={handleScrollLeft}
                aria-label="Scroll cards left"
              >
                &#9664;
              </button>
            )}

            <div
              className={`hand-panel__cards${isMobile ? ' hand-panel__cards--mobile' : ''}`}
              ref={cardsContainerRef}
            >
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
                      onPointerDown={(e) =>
                        handleCardPointerDown(index, cardId, e)
                      }
                    >
                      {imageUrl && !failedImages.has(cardId) ? (
                        landscapeCards.has(cardId) ? (
                          <div className="hand-panel__card-landscape">
                            <img
                              src={imageUrl}
                              alt={cardId}
                              className="hand-panel__card-img hand-panel__card-img--landscape"
                              draggable={false}
                              onLoad={(e) => handleImageLoad(cardId, e)}
                              onError={() => handleImageError(cardId)}
                            />
                          </div>
                        ) : (
                          <img
                            src={imageUrl}
                            alt={cardId}
                            className="hand-panel__card-img"
                            draggable={false}
                            onLoad={(e) => handleImageLoad(cardId, e)}
                            onError={() => handleImageError(cardId)}
                          />
                        )
                      ) : (
                        <div className="hand-panel__card-placeholder">
                          {cardId}
                        </div>
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

            {isMobile && canScrollRight && (
              <button
                className="hand-panel__scroll-arrow hand-panel__scroll-arrow--right"
                onClick={handleScrollRight}
                aria-label="Scroll cards right"
              >
                &#9654;
              </button>
            )}
          </div>
        </div>

        {/* Hover preview — portaled to body to avoid backdrop-filter containing block */}
        {hoveredCard &&
          previewPosition &&
          !phantomDrag?.isDragging &&
          createPortal(
            <div style={{ pointerEvents: 'none' }}>
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
            </div>,
            document.body,
          )}

        {/* Phantom drag ghost — portaled to body to avoid backdrop-filter containing block */}
        {phantomDrag?.isDragging &&
          phantomGhostUrl &&
          createPortal(
            <div
              className="hand-panel__phantom-ghost"
              style={{
                left: `${phantomDrag.currentX}px`,
                top: `${phantomDrag.currentY}px`,
              }}
            >
              {phantomDrag.cardId && landscapeCards.has(phantomDrag.cardId) ? (
                <div className="hand-panel__card-landscape">
                  <img
                    src={phantomGhostUrl}
                    alt="Dragging card"
                    className="hand-panel__card-img--landscape"
                    draggable={false}
                  />
                </div>
              ) : (
                <img
                  src={phantomGhostUrl}
                  alt="Dragging card"
                  draggable={false}
                />
              )}
            </div>,
            document.body,
          )}

        {/* Full-screen card preview — touch double-tap */}
        {doubleTapPreviewCard && (
          <FullScreenCardPreview
            card={doubleTapPreviewCard}
            onClose={() => setDoubleTapPreviewCard(null)}
          />
        )}
      </>
    );
  },
);
