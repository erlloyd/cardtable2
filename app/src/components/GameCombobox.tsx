import { useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  ComboboxButton,
} from '@headlessui/react';
import type { PluginRegistryEntry } from '../content/pluginLoader';

interface GameComboboxProps {
  games: PluginRegistryEntry[];
  selectedGame: PluginRegistryEntry | null;
  onGameSelect: (game: PluginRegistryEntry | null) => void;
}

function getDisplayName(game: PluginRegistryEntry): string {
  return game.displayName ?? game.name;
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
          getDisplayName(game).toLowerCase().includes(query.toLowerCase()),
        );

  return (
    <Combobox value={selectedGame} onChange={onGameSelect}>
      <div className="game-combobox">
        <div className="combobox-wrapper">
          <ComboboxInput
            className="combobox-input"
            displayValue={(game: PluginRegistryEntry | null) =>
              game ? getDisplayName(game) : ''
            }
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
                  <div className="game-name">{getDisplayName(game)}</div>
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
