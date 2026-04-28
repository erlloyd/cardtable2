import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CARDTABLE_VERSION } from '@cardtable2/shared';
import {
  uniqueNamesGenerator,
  adjectives,
  animals,
  Config,
} from 'unique-names-generator';
import { useState, useEffect } from 'react';
import GameSelector from '../components/GameSelector';
import {
  loadPluginRegistry,
  type PluginRegistryEntry,
} from '../content/pluginLoader';

export const Route = createFileRoute('/')({
  component: GameSelect,
});

const nameConfig: Config = {
  dictionaries: [adjectives, adjectives, animals],
  separator: '-',
  length: 3,
  style: 'lowerCase',
};

function GameSelect() {
  const navigate = useNavigate();
  const [games, setGames] = useState<PluginRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  useEffect(() => {
    const loadGames = async () => {
      setLoading(true);
      setError(null);
      try {
        const registry = await loadPluginRegistry();
        setGames(registry.plugins);
        setLoading(false);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load games';
        setError(errorMessage);
        setLoading(false);
      }
    };

    void loadGames();
  }, [attemptCount]);

  const retryLoad = () => {
    setAttemptCount((c) => c + 1);
  };

  const handleGameLaunch = (game: PluginRegistryEntry) => {
    const tableId = uniqueNamesGenerator(nameConfig);
    void navigate({
      to: '/table/$id',
      params: { id: tableId },
      state: { gameId: game.id } as Record<string, unknown>,
    });
  };

  if (loading) {
    return (
      <div className="game-select">
        <div className="game-select__ambient" />
        <div className="game-select__content">
          <div className="skeleton-hero">
            <div className="skeleton skeleton--logo" />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--tagline" />
          </div>
          <div className="skeleton-panel">
            <div className="skeleton skeleton--card" />
            <div className="skeleton skeleton--card" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-select">
        <div className="game-select__ambient" />
        <div className="game-select__content">
          <header className="game-select__hero">
            <div className="game-select__logo-mark" />
            <h1 className="game-select__title">Cardtable</h1>
            <span className="game-select__version">v{CARDTABLE_VERSION}</span>
            <p className="game-select__tagline">
              Your table. Any game. Play your way.
            </p>
          </header>
          <div className="error-panel" role="alert">
            <div className="error-panel__icon">⚠</div>
            <h2 className="error-panel__title">Could not load games</h2>
            <p className="error-panel__message">{error}</p>
            <button className="error-panel__retry" onClick={retryLoad}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="game-select">
        <div className="game-select__ambient" />
        <div className="game-select__content">
          <header className="game-select__hero">
            <div className="game-select__logo-mark" />
            <h1 className="game-select__title">Cardtable</h1>
            <span className="game-select__version">v{CARDTABLE_VERSION}</span>
            <p className="game-select__tagline">
              Your table. Any game. Play your way.
            </p>
          </header>
          <div className="error-panel" role="alert">
            <div className="error-panel__icon">◇</div>
            <h2 className="error-panel__title">No games found</h2>
            <p className="error-panel__message">
              Add plugins to your pluginsIndex.json to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-select">
      <div className="game-select__ambient" />
      <div className="game-select__content">
        <header className="game-select__hero">
          <div className="game-select__logo-mark" />
          <h1 className="game-select__title">Cardtable</h1>
          <span className="game-select__version">v{CARDTABLE_VERSION}</span>
          <p className="game-select__tagline">
            Your table. Any game. Play your way.
          </p>
        </header>

        <main className="game-select__main">
          <GameSelector games={games} onGameLaunch={handleGameLaunch} />
        </main>
      </div>
    </div>
  );
}
