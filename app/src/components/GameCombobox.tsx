import { useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  ComboboxButton,
} from '@headlessui/react';
import { Game } from '../types/game';

interface GameComboboxProps {
  games: Game[];
  selectedGame: Game | null;
  onGameSelect: (game: Game | null) => void;
}

function GameCombobox({
  games,
  selectedGame,
  onGameSelect,
}: GameComboboxProps) {
  const [query, setQuery] = useState('');

  const filteredGames =
    query === ''
      ? games
      : games.filter((game) =>
          game.name.toLowerCase().includes(query.toLowerCase()),
        );

  return (
    <Combobox value={selectedGame} onChange={onGameSelect}>
      <div className="game-combobox">
        <div className="combobox-wrapper">
          <ComboboxInput
            className="combobox-input"
            displayValue={(game: Game | null) => game?.name ?? ''}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Select a game..."
          />
          <ComboboxButton className="combobox-button">▼</ComboboxButton>
        </div>
        <ComboboxOptions className="combobox-options">
          {filteredGames.map((game) => (
            <ComboboxOption
              key={game.id}
              value={game}
              className="combobox-option"
            >
              {({ active }) => (
                <div className={active ? 'active' : ''}>
                  <div className="game-name">{game.name}</div>
                  <div className="game-description">{game.description}</div>
                </div>
              )}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}

export default GameCombobox;
