import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { YjsStore } from '../store/YjsStore';
import type { Card, GameAssets } from '@cardtable2/shared';
import { moveCardToBoard, reorderCardInHand } from '../store/YjsHandActions';
import { stackObjects } from '../store/YjsActions';
import { computeFanLayout, CARD_WIDTH } from '../utils/fanLayout';
import { CardPreview } from './CardPreview';
import { FullScreenCardPreview } from './FullScreenCardPreview';
import {
  getPreviewDimensions,
  getLandscapeDimensions,
} from '../constants/previewSizes';
import type { BoardHandle } from './Board';

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
// Cards are positioned at top: 0.75rem inside the container (12px at 16px base)
const CARD_ROW_TOP_OFFSET = 12;

/**
 * Compute how far a card at `index` should shift during a drag-reorder.
 *
 * When `toSlot` is set and differs from `fromSlot`, cards between them shift
 * to visually move the empty slot from `fromSlot` to `toSlot`.
 */
function computeShiftOffset(
  index: number,
  fromSlot: number,
  toSlot: number,
  slotWidth: number,
): number {
  if (toSlot === fromSlot) return 0;
  if (fromSlot < toSlot) {
    if (index > fromSlot && index <= toSlot) return -slotWidth;
  } else {
    if (index >= toSlot && index < fromSlot) return slotWidth;
  }
  return 0;
}

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
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [doubleTapPreviewCard, setDoubleTapPreviewCard] =
      useState<Card | null>(null);
    const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const cardsWrapperRef = useRef<HTMLDivElement>(null);
    const panelRootRef = useRef<HTMLDivElement>(null);
    const phantomDragRef = useRef<PhantomDragState | null>(null);
    const phantomFeedbackRef = useRef<PhantomDragFeedback | null>(null);
    const lastTapTimeRef = useRef<Map<number, number>>(new Map());
    const headerSwipeRef = useRef<{
      startX: number;
      scrollLeft: number;
    } | null>(null);
    const cleanupDragListenersRef = useRef<(() => void) | null>(null);
    const ghostElRef = useRef<HTMLDivElement>(null);
    const ghostPositionRef = useRef({ x: 0, y: 0 });

    // Refs to keep prop/computed values accessible from imperative listeners
    const activeHandIdRef = useRef(activeHandId);
    activeHandIdRef.current = activeHandId;
    const storeRef = useRef(store);
    storeRef.current = store;
    const boardRefRef = useRef(boardRef);
    boardRefRef.current = boardRef;
    const onPhantomDragActiveChangeRef = useRef(onPhantomDragActiveChange);
    onPhantomDragActiveChangeRef.current = onPhantomDragActiveChange;
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
    }, [isCollapsed]);

    // Track scroll position for arrow button visibility
    const updateScrollState = useCallback(() => {
      const wrapper = cardsWrapperRef.current;
      if (!wrapper) return;
      setCanScrollLeft(wrapper.scrollLeft > 0);
      setCanScrollRight(
        wrapper.scrollLeft < wrapper.scrollWidth - wrapper.clientWidth - 1,
      );
    }, []);

    useEffect(() => {
      const wrapper = cardsWrapperRef.current;
      if (!wrapper) return;
      updateScrollState();
      wrapper.addEventListener('scroll', updateScrollState);
      return () => wrapper.removeEventListener('scroll', updateScrollState);
    }, [updateScrollState]);

    // Update scroll arrows when cards or layout changes
    useEffect(() => {
      requestAnimationFrame(updateScrollState);
    }, [cards.length, containerWidth, updateScrollState]);

    const handName = activeHandId ? store.getHandName(activeHandId) : '';

    // Always compute fan layout from the full card count so that centering
    // (startOffset) doesn't shift when a card is dragged out.
    const fanLayout = computeFanLayout(cards.length, containerWidth);
    const fanLayoutRef = useRef(fanLayout);
    fanLayoutRef.current = fanLayout;
    const cardsRef = useRef(cards);
    cardsRef.current = cards;

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
      const wrapper = cardsWrapperRef.current;
      if (!wrapper) return;
      const scrollBy = SCROLL_AMOUNT_CARDS * (CARD_WIDTH - fanLayout.overlap);
      wrapper.scrollBy({ left: -scrollBy, behavior: 'smooth' });
    }, [fanLayout.overlap]);

    const handleScrollRight = useCallback(() => {
      const wrapper = cardsWrapperRef.current;
      if (!wrapper) return;
      const scrollBy = SCROLL_AMOUNT_CARDS * (CARD_WIDTH - fanLayout.overlap);
      wrapper.scrollBy({ left: scrollBy, behavior: 'smooth' });
    }, [fanLayout.overlap]);

    // Header swipe-to-scroll
    const handleHeaderPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const wrapper = cardsWrapperRef.current;
        if (!wrapper) return;
        headerSwipeRef.current = {
          startX: e.clientX,
          scrollLeft: wrapper.scrollLeft,
        };
      },
      [],
    );

    const handleHeaderPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!headerSwipeRef.current) return;
        const wrapper = cardsWrapperRef.current;
        if (!wrapper) return;
        const dx = e.clientX - headerSwipeRef.current.startX;
        wrapper.scrollLeft = headerSwipeRef.current.scrollLeft - dx;
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
        if (e.pointerType !== 'mouse') return;
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

    // Helper: determine drag drop target from pointer position.
    // Returns { overPanel, inCardRow } so callers can decide:
    //   overPanel && inCardRow  → reorder within hand
    //   !overPanel              → drop on board
    //   overPanel && !inCardRow → cancel (card returns to original slot)
    //
    // The ghost uses transform: translate(-50%, -50%), so its vertical
    // midpoint equals clientY — the "inCardRow" check tests whether that
    // midpoint is at or below the top edge of the card row.
    const getDragDropTarget = useCallback(
      (clientX: number, clientY: number) => {
        const panelEl = panelRootRef.current;
        if (!panelEl) return { overPanel: false, inCardRow: false };
        const rect = panelEl.getBoundingClientRect();
        const overPanel =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        const container = cardsContainerRef.current;
        const inCardRow = container
          ? clientY >=
            container.getBoundingClientRect().top + CARD_ROW_TOP_OFFSET
          : false;
        return { overPanel, inCardRow };
      },
      [],
    );

    // Helper: compute insertion index from pointer X over the cards container
    const computeInsertionIndex = useCallback(
      (clientX: number): number | null => {
        const container = cardsContainerRef.current;
        const wrapper = cardsWrapperRef.current;
        if (!container) return null;
        const containerRect = container.getBoundingClientRect();
        const scrollOffset = wrapper?.scrollLeft ?? 0;
        const relativeX = clientX - containerRect.left + scrollOffset;
        const layout = fanLayoutRef.current;
        const cardSpacing = CARD_WIDTH - layout.overlap;
        if (cardSpacing <= 0) return 0;
        const rawIndex = Math.round(
          (relativeX - layout.startOffset) / cardSpacing,
        );
        return Math.max(0, Math.min(rawIndex, cardsRef.current.length - 1));
      },
      [],
    );

    // Phantom drag — pointer down on a card
    // Listeners are registered imperatively (not via useEffect) to avoid
    // React 18's synchronous effect flush removing them during the same event.
    const handleCardPointerDown = useCallback(
      (
        index: number,
        cardId: string,
        e: React.PointerEvent<HTMLDivElement>,
      ) => {
        if (e.button !== 0) return;
        if (phantomDragRef.current) return; // drag already active
        e.preventDefault();

        // Track taps for double-tap preview (touch only)
        handleCardTap(index, e.pointerType);

        const dragState: PhantomDragState = {
          cardIndex: index,
          cardId,
          startX: e.clientX,
          startY: e.clientY,
          isDragging: false,
        };
        ghostPositionRef.current = { x: e.clientX, y: e.clientY };
        setPhantomDrag(dragState);
        phantomDragRef.current = dragState;

        // Remove any stale listeners from a previous drag
        cleanupDragListenersRef.current?.();

        const handleMove = (ev: PointerEvent) => {
          const current = phantomDragRef.current;
          if (!current) return;

          const dx = ev.clientX - current.startX;
          const dy = ev.clientY - current.startY;

          if (!current.isDragging) {
            if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;

            // Start phantom drag
            const started: PhantomDragState = {
              ...current,
              isDragging: true,
            };
            setPhantomDrag(started);
            phantomDragRef.current = started;
            ghostPositionRef.current = { x: ev.clientX, y: ev.clientY };

            // Clear hover state
            setHoveredIndex(null);
            setHoveredCardRect(null);

            // Notify renderer and parent
            boardRefRef.current?.current?.sendRendererMessage({
              type: 'phantom-drag-start',
            });
            onPhantomDragActiveChangeRef.current?.(true);

            // Set initial insertion index to fromSlot so the first render
            // doesn't flash-shift all cards (toSlot===fromSlot → no shift).
            setInsertionIndex(current.cardIndex);
            return;
          }

          // Update ghost position via direct DOM mutation (no React re-render)
          ghostPositionRef.current = { x: ev.clientX, y: ev.clientY };
          if (ghostElRef.current) {
            ghostElRef.current.style.left = `${ev.clientX}px`;
            ghostElRef.current.style.top = `${ev.clientY}px`;
          }

          // Show insertion gap only when ghost is over the panel and its
          // vertical midpoint is within the card row.
          const { overPanel, inCardRow } = getDragDropTarget(
            ev.clientX,
            ev.clientY,
          );
          setInsertionIndex(
            overPanel && inCardRow ? computeInsertionIndex(ev.clientX) : null,
          );

          // Send move to renderer for stack/snap detection
          const canvasPos = boardRefRef.current?.current?.viewportToCanvas(
            ev.clientX,
            ev.clientY,
          );
          if (canvasPos) {
            boardRefRef.current?.current?.sendRendererMessage({
              type: 'phantom-drag-move',
              canvasX: canvasPos.x,
              canvasY: canvasPos.y,
            });
          }
        };

        const handleUp = (ev: PointerEvent) => {
          const current = phantomDragRef.current;
          if (!current) return;

          if (current.isDragging) {
            const { overPanel, inCardRow } = getDragDropTarget(
              ev.clientX,
              ev.clientY,
            );
            const handId = activeHandIdRef.current;

            if (overPanel && inCardRow && handId) {
              // Reorder within hand — insertion index is a position in the
              // original cards array, mapping directly to reorderCardInHand.
              const toIndex = computeInsertionIndex(ev.clientX);
              if (toIndex !== null) {
                reorderCardInHand(
                  storeRef.current,
                  handId,
                  current.cardIndex,
                  toIndex,
                );
              }
            } else if (!overPanel && handId) {
              // Drop on board
              const feedback = phantomFeedbackRef.current;
              const pos = feedback?.snapPos ?? {
                x: feedback?.worldX ?? 0,
                y: feedback?.worldY ?? 0,
              };

              const newStackId = moveCardToBoard(
                storeRef.current,
                handId,
                current.cardIndex,
                { x: pos.x, y: pos.y, r: 0 },
                true,
              );

              // If dropping on a stack target, merge
              if (newStackId && feedback?.stackTargetId) {
                try {
                  stackObjects(
                    storeRef.current,
                    [newStackId],
                    feedback.stackTargetId,
                  );
                } catch (err) {
                  console.error('[HandPanel] Stack merge failed:', err);
                }
              }
            }

            // Notify renderer and parent to clean up
            boardRefRef.current?.current?.sendRendererMessage({
              type: 'phantom-drag-end',
            });
            onPhantomDragActiveChangeRef.current?.(false);
          }

          // Clean up
          cleanupDragListenersRef.current?.();
          setPhantomDrag(null);
          phantomDragRef.current = null;
          setInsertionIndex(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);

        cleanupDragListenersRef.current = () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
          cleanupDragListenersRef.current = null;
        };
      },
      [handleCardTap, getDragDropTarget, computeInsertionIndex],
    );

    // Safety cleanup on unmount
    useEffect(() => {
      return () => {
        cleanupDragListenersRef.current?.();
      };
    }, []);

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

          <div className="hand-panel__cards-wrapper" ref={cardsWrapperRef}>
            {canScrollLeft && (
              <button
                className="hand-panel__scroll-arrow hand-panel__scroll-arrow--left"
                onClick={handleScrollLeft}
                aria-label="Scroll cards left"
              >
                &#9664;
              </button>
            )}

            <div className="hand-panel__cards" ref={cardsContainerRef}>
              {cards.length === 0 ? (
                <div className="hand-panel__empty">
                  {handIds.length === 0
                    ? 'Create a hand to get started.'
                    : 'No cards in hand. Select a card on the board and use "Add to Hand" (A).'}
                </div>
              ) : containerWidth === 0 ? null : (
                (() => {
                  const isDragging = phantomDrag?.isDragging ?? false;
                  const slotWidth = CARD_WIDTH - fanLayout.overlap;
                  const fromSlot = phantomDrag?.cardIndex ?? -1;
                  // Default to fromSlot so the first render has no shift
                  const toSlot = insertionIndex ?? fromSlot;

                  const elements = cards.map((cardId, index) => {
                    // Don't render the card being dragged (it's shown as the ghost)
                    if (isDragging && index === fromSlot) return null;

                    const imageUrl = getCardImageUrl(cardId);
                    const isHovered = hoveredIndex === index;
                    const shiftOffset = isDragging
                      ? computeShiftOffset(index, fromSlot, toSlot, slotWidth)
                      : 0;

                    return (
                      <div
                        key={`${cardId}-${index}`}
                        className={`hand-panel__card${isHovered && !isDragging ? ' hand-panel__card--hovered' : ''}`}
                        style={{
                          left: `${getCardLeft(index) + shiftOffset}px`,
                          zIndex: isHovered ? 999 : index,
                          transition: isDragging
                            ? 'left 150ms ease'
                            : undefined,
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
                        {!isDragging && (
                          <button
                            className={`hand-panel__play-btn${fanLayout.overlap > 0 ? ' hand-panel__play-btn--compact' : ''}`}
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
                  });

                  // Insertion indicator line during drag reorder
                  if (isDragging && toSlot !== fromSlot) {
                    const indicatorLeft = getCardLeft(toSlot);
                    elements.push(
                      <div
                        key="insertion-indicator"
                        className="hand-panel__insertion-indicator"
                        style={{ left: `${indicatorLeft}px` }}
                      />,
                    );
                  }

                  return elements;
                })()
              )}
            </div>

            {canScrollRight && (
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
              ref={ghostElRef}
              className="hand-panel__phantom-ghost"
              style={{
                left: `${ghostPositionRef.current.x}px`,
                top: `${ghostPositionRef.current.y}px`,
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
