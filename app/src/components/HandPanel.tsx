import {
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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

interface DragSession {
  handId: string;
  cardIndex: number;
  cardId: string;
  startX: number;
  startY: number;
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

const NO_CARDS: string[] = [];

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
    const [containerWidth, setContainerWidth] = useState(0);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [hoverAnchor, setHoverAnchor] = useState<{
      x: number;
      panelTop: number;
    } | null>(null);
    const [session, setSession] = useState<DragSession | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [landscapeCards, setLandscapeCards] = useState<Set<string>>(
      () => new Set(),
    );
    const [failedImages, setFailedImages] = useState<Set<string>>(
      () => new Set(),
    );
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [doubleTapPreviewCard, setDoubleTapPreviewCard] = useState<{
      card: Card;
      cardCode: string;
    } | null>(null);
    const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const cardsWrapperRef = useRef<HTMLDivElement>(null);
    const panelRootRef = useRef<HTMLDivElement>(null);
    const lastTapTimeRef = useRef<Map<number, number>>(new Map());
    const headerSwipeRef = useRef<{
      startX: number;
      scrollLeft: number;
    } | null>(null);
    const ghostElRef = useRef<HTMLDivElement>(null);
    const ghostPositionRef = useRef({ x: 0, y: 0 });

    // Read cards straight from the store during render so the commit that
    // changes activeHandId already shows that hand's cards (no stale or empty
    // intermediate frame).
    const subscribeToHands = useCallback(
      (onChange: () => void) => store.onHandsChange(onChange),
      [store],
    );
    const cards = useSyncExternalStore(subscribeToHands, () =>
      activeHandId ? store.getHandCards(activeHandId) : NO_CARDS,
    );

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
      setHoverAnchor(null);
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

    // Phantom drag ghost image URL
    const phantomGhostUrl =
      isDragging && session ? getCardImageUrl(session.cardId) : null;

    // Place the ghost at the pointer when it mounts; pointermove then moves it
    // by direct DOM mutation.
    const isGhostMounted = phantomGhostUrl !== null;
    useLayoutEffect(() => {
      const ghost = ghostElRef.current;
      if (!isGhostMounted || !ghost) return;
      ghost.style.left = `${ghostPositionRef.current.x}px`;
      ghost.style.top = `${ghostPositionRef.current.y}px`;
    }, [isGhostMounted]);

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
        // Capture so pointerup fires even if released outside the header
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
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

    const handleHeaderPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        headerSwipeRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      },
      [],
    );

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
          if (card && cardId) {
            setDoubleTapPreviewCard({ card, cardCode: cardId });
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
        if (isDragging) return;
        setHoveredIndex(index);
        setHoverAnchor({
          x: e.clientX,
          panelTop:
            panelRootRef.current?.getBoundingClientRect().top ??
            window.innerHeight,
        });
      },
      [isDragging],
    );

    const handleCardPointerLeave = useCallback(() => {
      if (isDragging) return;
      setHoveredIndex(null);
      setHoverAnchor(null);
    }, [isDragging]);

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
    const computeInsertionIndex = (clientX: number): number | null => {
      const container = cardsContainerRef.current;
      const wrapper = cardsWrapperRef.current;
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const scrollOffset = wrapper?.scrollLeft ?? 0;
      const relativeX = clientX - containerRect.left + scrollOffset;
      const cardSpacing = CARD_WIDTH - fanLayout.overlap;
      if (cardSpacing <= 0) return 0;
      const rawIndex = Math.round(
        (relativeX - fanLayout.startOffset) / cardSpacing,
      );
      return Math.max(0, Math.min(rawIndex, cards.length - 1));
    };

    const endDrag = useCallback(() => {
      setSession(null);
      setIsDragging(false);
      setInsertionIndex(null);
    }, []);

    // The active hand changing mid-drag cancels the drag: the session's card
    // index belongs to the hand it started in.
    if (session && session.handId !== activeHandId) {
      endDrag();
    }

    // Slop crossed: show the ghost and tell the renderer and parent.
    const onDragStart = useEffectEvent(
      (current: DragSession, ev: PointerEvent) => {
        ghostPositionRef.current = { x: ev.clientX, y: ev.clientY };
        setIsDragging(true);
        setHoveredIndex(null);
        setHoverAnchor(null);
        boardRef?.current?.sendRendererMessage({ type: 'phantom-drag-start' });
        onPhantomDragActiveChange?.(true);
        // Start at fromSlot so the first render doesn't flash-shift all cards
        // (toSlot===fromSlot → no shift).
        setInsertionIndex(current.cardIndex);
      },
    );

    const onDragMove = useEffectEvent((ev: PointerEvent) => {
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
      const canvasPos = boardRef?.current?.viewportToCanvas(
        ev.clientX,
        ev.clientY,
      );
      if (canvasPos) {
        boardRef?.current?.sendRendererMessage({
          type: 'phantom-drag-move',
          canvasX: canvasPos.x,
          canvasY: canvasPos.y,
        });
      }
    });

    const onDrop = useEffectEvent((current: DragSession, ev: PointerEvent) => {
      const { overPanel, inCardRow } = getDragDropTarget(
        ev.clientX,
        ev.clientY,
      );

      if (overPanel && inCardRow) {
        // Reorder within hand — insertion index is a position in the
        // original cards array, mapping directly to reorderCardInHand.
        const toIndex = computeInsertionIndex(ev.clientX);
        if (toIndex !== null) {
          reorderCardInHand(store, current.handId, current.cardIndex, toIndex);
        }
      } else if (!overPanel) {
        // Drop on board
        const pos = phantomDragFeedback?.snapPos ?? {
          x: phantomDragFeedback?.worldX ?? 0,
          y: phantomDragFeedback?.worldY ?? 0,
        };

        const newStackId = moveCardToBoard(
          store,
          current.handId,
          current.cardIndex,
          { x: pos.x, y: pos.y, r: 0 },
          true,
        );

        // If dropping on a stack target, merge
        if (newStackId && phantomDragFeedback?.stackTargetId) {
          try {
            stackObjects(
              store,
              [newStackId],
              phantomDragFeedback.stackTargetId,
            );
          } catch (err) {
            console.error('[HandPanel] Stack merge failed:', err);
          }
        }
      }
    });

    const onDragEnd = useEffectEvent(() => {
      boardRef?.current?.sendRendererMessage({ type: 'phantom-drag-end' });
      onPhantomDragActiveChange?.(false);
    });

    // While a drag session exists, window listeners drive it. Every way a
    // session ends (drop, cancel, blur, Escape, hand change, unmount) clears
    // the session, so this cleanup is the single teardown path.
    useEffect(() => {
      if (!session) return;
      let started = false;

      const handleMove = (ev: PointerEvent) => {
        if (!started) {
          const dx = ev.clientX - session.startX;
          const dy = ev.clientY - session.startY;
          if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
          started = true;
          onDragStart(session, ev);
          return;
        }
        onDragMove(ev);
      };

      const handleUp = (ev: PointerEvent) => {
        if (started) onDrop(session, ev);
        endDrag();
      };

      const handleKeyDown = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return;
        // Capture phase + stopPropagation: the Escape that cancels the drag
        // must not also reach bubble-phase global Escape handlers.
        ev.stopPropagation();
        endDrag();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', endDrag);
      window.addEventListener('blur', endDrag);
      window.addEventListener('keydown', handleKeyDown, true);

      return () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', endDrag);
        window.removeEventListener('blur', endDrag);
        window.removeEventListener('keydown', handleKeyDown, true);
        if (started) onDragEnd();
      };
    }, [session, endDrag]);

    // Phantom drag — pointer down on a card
    const handleCardPointerDown = (
      index: number,
      cardId: string,
      e: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (e.button !== 0) return;
      if (session || !activeHandId) return; // drag already active
      e.preventDefault();

      // Track taps for double-tap preview (touch only)
      handleCardTap(index, e.pointerType);

      ghostPositionRef.current = { x: e.clientX, y: e.clientY };
      setSession({
        handId: activeHandId,
        cardIndex: index,
        cardId,
        startX: e.clientX,
        startY: e.clientY,
      });
    };

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
    const previewPosition = (() => {
      if (hoveredIndex === null || !hoverAnchor) return null;
      const hoveredCardId = cards[hoveredIndex];
      const isLandscape = hoveredCardId && landscapeCards.has(hoveredCardId);
      const baseDims = getPreviewDimensions('medium');
      const dims = isLandscape ? getLandscapeDimensions(baseDims) : baseDims;
      return {
        x: hoverAnchor.x - dims.width / 2,
        y: hoverAnchor.panelTop - PREVIEW_GAP - dims.height,
      };
    })();

    const hoveredCardCode =
      hoveredIndex !== null ? (cards[hoveredIndex] ?? null) : null;
    const hoveredCard =
      hoveredCardCode && gameAssets
        ? (gameAssets.cards[hoveredCardCode] ?? null)
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
                aria-label="Create new hand"
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
                  const slotWidth = CARD_WIDTH - fanLayout.overlap;
                  const fromSlot = session?.cardIndex ?? -1;
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
          !isDragging &&
          createPortal(
            <div style={{ pointerEvents: 'none' }}>
              <CardPreview
                card={hoveredCard}
                cardCode={hoveredCardCode}
                faceUp={true}
                gameAssets={gameAssets}
                mode="hover"
                position={previewPosition}
                onClose={() => {
                  setHoveredIndex(null);
                  setHoverAnchor(null);
                }}
              />
            </div>,
            document.body,
          )}

        {/* Phantom drag ghost — portaled to body to avoid backdrop-filter containing block */}
        {isDragging &&
          session &&
          phantomGhostUrl &&
          createPortal(
            <div ref={ghostElRef} className="hand-panel__phantom-ghost">
              {landscapeCards.has(session.cardId) ? (
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

        {/* Full-screen card preview — touch double-tap. Hand cards are
            always face-up, so the preview always shows the face. */}
        {doubleTapPreviewCard && gameAssets && (
          <FullScreenCardPreview
            card={doubleTapPreviewCard.card}
            cardCode={doubleTapPreviewCard.cardCode}
            faceUp={true}
            gameAssets={gameAssets}
            onClose={() => setDoubleTapPreviewCard(null)}
          />
        )}
      </>
    );
  },
);
