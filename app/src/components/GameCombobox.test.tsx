import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GameCombobox from './GameCombobox';
import type { PluginRegistryEntry } from '../content/pluginLoader';

const mockGames: PluginRegistryEntry[] = [
  {
    id: 'fake-game',
    name: 'Fake Game',
    author: 'Test Author',
    description: 'A placeholder game',
    baseUrl: '/plugins/fake-game/',
    boxArt: '/plugins/fake-game/box-art.jpg',
  },
  {
    id: 'test-game',
    name: 'Test Game',
    author: 'Test Author',
    description: 'Another test game',
    baseUrl: '/plugins/test-game/',
    boxArt: '/plugins/test-game/box-art.jpg',
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
