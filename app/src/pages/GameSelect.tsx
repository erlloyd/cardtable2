import { CARDTABLE_VERSION } from '@cardtable2/shared';
import { useNavigate } from 'react-router-dom';
import {
  uniqueNamesGenerator,
  adjectives,
  animals,
  Config,
} from 'unique-names-generator';
import { useState, useEffect } from 'react';
import GameCombobox from '../components/GameCombobox';
import { Game, GamesIndex } from '../types/game';

const nameConfig: Config = {
  dictionaries: [adjectives, adjectives, animals],
  separator: '-',
  length: 3,
  style: 'lowerCase',
};

function GameSelect() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/gamesIndex.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load games index');
        }
        return response.json();
      })
      .then((data: GamesIndex) => {
        setGames(data.games);
        // Select the first game by default
        if (data.games.length > 0) {
          setSelectedGame(data.games[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleOpenTable = () => {
    if (!selectedGame) {
      return;
    }
    const tableId = uniqueNamesGenerator(nameConfig);
    navigate(`/table/${tableId}`, { state: { game: selectedGame } });
  };

  if (loading) {
    return (
      <div className="game-select">
        <p>Loading games...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-select">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="game-select">
      <header className="game-select-header">
        <h1>Cardtable {CARDTABLE_VERSION}</h1>
        <p>Solo-first card table with multiplayer support</p>
      </header>
      <main className="game-select-main">
        <GameCombobox
          games={games}
          selectedGame={selectedGame}
          onGameSelect={setSelectedGame}
        />
        <button
          onClick={handleOpenTable}
          className="open-table-button"
          disabled={!selectedGame}
        >
          Open Table
        </button>
      </main>
    </div>
  );
}

export default GameSelect;
