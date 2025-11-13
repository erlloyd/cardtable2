import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GameCombobox from './GameCombobox';
import { Game } from '../types/game';

const mockGames: Game[] = [
  {
    id: 'fake-game',
    name: 'Fake Game',
    description: 'A placeholder game',
    version: '1.0.0',
    manifestUrl: '/games/fake-game/manifest.json',
  },
  {
    id: 'test-game',
    name: 'Test Game',
    description: 'Another test game',
    version: '1.0.0',
    manifestUrl: '/games/test-game/manifest.json',
  },
];

describe('GameCombobox', () => {
  it('renders with selected game', () => {
    const handleSelect = vi.fn();
    render(
      <GameCombobox
        games={mockGames}
        selectedGame={mockGames[0]}
        onGameSelect={handleSelect}
      />,
    );

    const input = screen.getByPlaceholderText('Select a game...');
    expect(input).toHaveValue('Fake Game');
  });

  it('renders with no selected game', () => {
    const handleSelect = vi.fn();
    render(
      <GameCombobox
        games={mockGames}
        selectedGame={null}
        onGameSelect={handleSelect}
      />,
    );

    const input = screen.getByPlaceholderText('Select a game...');
    expect(input).toHaveValue('');
  });
});
