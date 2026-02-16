import { useEffect, useState } from 'react';
import type { YjsStore } from '../store/YjsStore';
import type { GameAssets } from '@cardtable2/shared';
import { moveCardToBoard } from '../store/YjsHandActions';

interface HandPanelProps {
  store: YjsStore;
  gameAssets: GameAssets | null;
  activeHandId: string | null;
  onActiveHandChange: (handId: string | null) => void;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  handIds: string[];
}

export function HandPanel({
  store,
  gameAssets,
  activeHandId,
  onActiveHandChange,
  isCollapsed,
  onCollapsedChange,
  handIds,
}: HandPanelProps) {
  const [cards, setCards] = useState<string[]>([]);

  // Subscribe to hand changes to keep card list updated
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

  const handName = activeHandId ? store.getHandName(activeHandId) : '';

  const handleCreateHand = () => {
    const name = `Hand ${handIds.length + 1}`;
    const newId = store.createHand(name);
    onActiveHandChange(newId);
  };

  const handlePlayCard = (cardIndex: number) => {
    if (!activeHandId) return;
    moveCardToBoard(store, activeHandId, cardIndex, { x: 0, y: 0, r: 0 }, true);
  };

  const getCardImageUrl = (cardId: string): string | null => {
    if (!gameAssets) return null;
    return gameAssets.cards[cardId]?.face ?? null;
  };

  // Collapsed state
  if (isCollapsed) {
    return (
      <div className="hand-panel hand-panel--collapsed">
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

  // Expanded state
  return (
    <div className="hand-panel">
      <div className="hand-panel__header">
        <div className="hand-panel__tabs">
          {handIds.map((hid) => (
            <button
              key={hid}
              className={`hand-panel__tab${hid === activeHandId ? ' hand-panel__tab--active' : ''}`}
              onClick={() => onActiveHandChange(hid)}
            >
              {store.getHandName(hid) || 'Hand'}
            </button>
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

      <div className="hand-panel__cards">
        {cards.length === 0 ? (
          <div className="hand-panel__empty">
            {handIds.length === 0
              ? 'Create a hand to get started.'
              : 'No cards in hand. Select a card on the board and use "Add to Hand" (A).'}
          </div>
        ) : (
          cards.map((cardId, index) => {
            const imageUrl = getCardImageUrl(cardId);
            return (
              <div key={`${cardId}-${index}`} className="hand-panel__card">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={cardId}
                    className="hand-panel__card-img"
                    draggable={false}
                  />
                ) : (
                  <div className="hand-panel__card-placeholder">{cardId}</div>
                )}
                <button
                  className="hand-panel__play-btn"
                  onClick={() => handlePlayCard(index)}
                  title="Play card to board"
                >
                  Play
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
