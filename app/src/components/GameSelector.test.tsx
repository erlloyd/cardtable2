import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import GameSelector from './GameSelector';
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

const singleGame: Game[] = [mockGames[0]];

const gameWithBoxArt: Game = {
  id: 'art-game',
  name: 'Art Game',
  description: 'A game with box art',
  version: '1.0.0',
  manifestUrl: '/games/art-game/manifest.json',
  boxArt: '/games/art-game/box-art.jpg',
};

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

  it('game card shows first letter monogram when no boxArt', () => {
    const { container } = render(
      <GameSelector games={mockGames} onGameLaunch={vi.fn()} />,
    );

    const icons = container.querySelectorAll('.game-card__icon');
    expect(icons[0]).toHaveTextContent('F');
    expect(icons[1]).toHaveTextContent('T');
  });

  it('renders box art image when game has boxArt', () => {
    render(<GameSelector games={[gameWithBoxArt]} onGameLaunch={vi.fn()} />);

    const img = screen.getByRole('img', { name: 'Art Game' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/games/art-game/box-art.jpg');
  });

  it('shows monogram instead of image when game has no boxArt', () => {
    const { container } = render(
      <GameSelector games={singleGame} onGameLaunch={vi.fn()} />,
    );

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

  it('renders game versions', () => {
    render(<GameSelector games={mockGames} onGameLaunch={vi.fn()} />);

    const versions = screen.getAllByText('v1.0.0');
    expect(versions.length).toBeGreaterThan(0);
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
