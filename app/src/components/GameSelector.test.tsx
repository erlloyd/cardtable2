import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import GameSelector from './GameSelector';
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

const singleGame: PluginRegistryEntry[] = [mockGames[0]];

describe('GameSelector', () => {
  it('renders game cards for all provided games', () => {
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Select Fake Game' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Test Game' }),
    ).toBeInTheDocument();
  });

  it('shows search bar when games.length > 1', () => {
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
  });

  it('hides search bar when games.length === 1', () => {
    render(<GameSelector games={singleGame} onGameLaunch={vi.fn()} />);

    expect(
      screen.queryByPlaceholderText('Search games...'),
    ).not.toBeInTheDocument();
  });

  it('filters games when typing in search', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search games...'), 'Fake');

    expect(
      screen.getByRole('button', { name: 'Select Fake Game' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Select Test Game' }),
    ).not.toBeInTheDocument();
  });

  it('shows empty state when search has no matches', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Search games...'),
      'zzznomatch',
    );

    expect(
      screen.queryByRole('button', { name: 'Select Fake Game' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Select Test Game' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('calls onGameLaunch when clicking a game card', async () => {
    const handleLaunch = vi.fn();
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={handleLaunch} />);

    await user.click(screen.getByRole('button', { name: 'Select Fake Game' }));

    expect(handleLaunch).toHaveBeenCalledWith(mockGames[0]);
  });

  it('renders box art image with correct src and alt', () => {
    render(<GameSelector games={singleGame} onGameLaunch={vi.fn()} />);

    const img = screen.getByRole('img', { name: 'Fake Game' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/plugins/fake-game/box-art.jpg');
  });

  it('falls back to first-letter monogram when boxArt fails to load', () => {
    const { container } = render(
      <GameSelector games={singleGame} onGameLaunch={vi.fn()} />,
    );

    const img = screen.getByRole('img', { name: 'Fake Game' });
    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const icon = container.querySelector('.game-card__icon');
    expect(icon).toHaveTextContent('F');
  });

  it('renders a list container with aria-label for available games', () => {
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    expect(
      screen.getByRole('list', { name: 'Available games' }),
    ).toBeInTheDocument();
  });

  it('clear button appears only when search has text', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search games...'), 'Fake');

    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
  });

  it('clear button resets search and restores all games', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search games...');
    await user.type(input, 'Fake');

    expect(
      screen.queryByRole('button', { name: 'Select Test Game' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Select Fake Game' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Test Game' }),
    ).toBeInTheDocument();
  });

  it('does not use role="listbox" on the game grid', () => {
    const { container } = render(
      <GameSelector games={mockGames} onGameLaunch={vi.fn()} />,
    );

    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('does not use role="option" on game buttons', () => {
    const { container } = render(
      <GameSelector games={mockGames} onGameLaunch={vi.fn()} />,
    );

    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it('renders game descriptions', () => {
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    expect(screen.getByText('A placeholder game')).toBeInTheDocument();
    expect(screen.getByText('Another test game')).toBeInTheDocument();
  });

  it('empty state message includes the search query', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Search games...'),
      'xyz-missing',
    );

    expect(screen.getByText('xyz-missing')).toBeInTheDocument();
  });

  it('game list is hidden when empty search state is shown', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Search games...'),
      'zzznomatch',
    );

    expect(screen.queryByRole('list', { name: /available games/i })).toBeNull();
  });
});
