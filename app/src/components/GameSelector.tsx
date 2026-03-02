import { useState } from 'react';
import { Game } from '../types/game';

interface GameSelectorProps {
  games: Game[];
  onGameLaunch: (game: Game) => void;
}

function GameCardThumb({ game }: { game: Game }) {
  const [imgError, setImgError] = useState(false);

  if (game.boxArt && !imgError) {
    return (
      <img
        className="game-card__thumb"
        src={game.boxArt}
        alt={game.name}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div className="game-card__icon" aria-hidden="true">
      {game.name.charAt(0)}
    </div>
  );
}

function GameSelector({ games, onGameLaunch }: GameSelectorProps) {
  const [query, setQuery] = useState('');

  const filteredGames =
    query === ''
      ? games
      : games.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));

  const isMulti = games.length > 1;

  return (
    <div className="game-selector-panel">
      {isMulti && (
        <div className="game-selector-search">
          <span className="game-selector-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="game-selector-search__input"
            placeholder="Search games..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search games"
          />
          {query && (
            <button
              className="game-selector-search__clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {filteredGames.length === 0 ? (
        <div className="game-selector-empty" role="status">
          <span className="game-selector-empty__icon" aria-hidden="true">
            ◇
          </span>
          <p className="game-selector-empty__text">
            No games match &ldquo;<em>{query}</em>&rdquo;
          </p>
        </div>
      ) : (
        <div
          className={`game-selector-grid${isMulti ? ' game-selector-grid--multi' : ''}`}
          role="list"
          aria-label="Available games"
        >
          {filteredGames.map((game) => (
            <button
              key={game.id}
              className="game-card"
              aria-label={`Select ${game.name}`}
              onClick={() => onGameLaunch(game)}
            >
              <div className="game-card__header">
                <GameCardThumb game={game} />
                <div className="game-card__meta">
                  <span className="game-card__name">{game.name}</span>
                  <span className="game-card__version">v{game.version}</span>
                </div>
              </div>
              <p className="game-card__description">{game.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default GameSelector;
