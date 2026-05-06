import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CardPreview } from './CardPreview';
import type {
  Card,
  CardType,
  GameAssets,
  OrientationRule,
} from '@cardtable2/shared';

// Mock the useImage hook to control image loading
vi.mock('use-image', () => ({
  default: vi.fn(),
}));

describe('CardPreview', () => {
  const createGameAssets = (
    cardTypes: Record<string, CardType> = {},
    cards: Record<string, Card> = {},
    orientationRules: OrientationRule[] = [],
  ): GameAssets => ({
    packs: [],
    cardTypes,
    cards,
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
    tokenTypes: {},
    statusTypes: {},
    modifierStats: {},
    iconTypes: {},
    orientationRules,
  });

  const mockOnClose = vi.fn();
  let mockUseImage: Mock;

  beforeEach(async () => {
    mockOnClose.mockClear();

    // Default: mock portrait image (300x400)
    const mockImage = { width: 300, height: 400 };
    mockUseImage = vi.fn(() => [mockImage, 'loaded']);
    const useImageModule = await import('use-image');
    vi.mocked(useImageModule).default = mockUseImage;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when card is null', () => {
      const gameAssets = createGameAssets();
      const { container } = render(
        <CardPreview
          card={null}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when gameAssets is null', () => {
      const card: Card = {
        type: 'hero',
        face: 'spiderman.jpg',
      };

      const { container } = render(
        <CardPreview
          card={card}
          gameAssets={null}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders card image when both card and gameAssets are present', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'spiderman.jpg');
    });
  });

  describe('Modal mode', () => {
    it('renders with backdrop in modal mode', async () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      // Dialog renders with a backdrop and the card image
      const img = screen.getByAltText('Card preview');
      expect(img).toBeInTheDocument();

      // Modal mode renders the Dialog component (check for dialog role)
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('renders close button in modal mode', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      const closeButton = screen.getByLabelText('Close preview');
      expect(closeButton).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      const closeButton = screen.getByLabelText('Close preview');
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Hover mode', () => {
    it('renders without Dialog in hover mode', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 200 }}
          onClose={mockOnClose}
        />,
      );

      // No Dialog in hover mode (check for absence of dialog role)
      const dialog = screen.queryByRole('dialog');
      expect(dialog).not.toBeInTheDocument();
    });

    it('positions element at specified coordinates in hover mode', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      const { container } = render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 150, y: 250 }}
          onClose={mockOnClose}
        />,
      );

      const wrapper = container.querySelector('.card-preview-container');
      expect(wrapper).toHaveStyle({
        left: '150px',
        top: '250px',
      });
    });

    it('does not render close button in hover mode', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 200 }}
          onClose={mockOnClose}
        />,
      );

      const closeButton = screen.queryByLabelText('Close preview');
      expect(closeButton).not.toBeInTheDocument();
    });
  });

  describe('Orientation and rotation', () => {
    it('applies portrait dimensions by default', () => {
      const gameAssets = createGameAssets(
        { hero: {} }, // No orientation
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          size="medium"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      // Medium portrait: 280x392
      expect(img).toHaveStyle({ width: '280px', height: '392px' });
    });

    it('swaps dimensions for landscape cards', () => {
      const gameAssets = createGameAssets(
        {},
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      render(
        <CardPreview
          card={gameAssets.cards['rhino']}
          gameAssets={gameAssets}
          mode="modal"
          size="medium"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      // Medium landscape: 392x280 (swapped)
      expect(img).toHaveStyle({ width: '392px', height: '280px' });
    });

    it('applies rotation transform when image orientation does not match metadata', () => {
      // Landscape metadata but portrait image (300x400) -> should rotate
      const gameAssets = createGameAssets(
        {},
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      // Mock portrait image that doesn't match landscape metadata
      const mockImage = { width: 300, height: 400 };
      mockUseImage.mockReturnValue([mockImage, 'loaded']);

      render(
        <CardPreview
          card={gameAssets.cards['rhino']}
          gameAssets={gameAssets}
          mode="modal"
          rotationEnabled={true}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toHaveStyle({ transform: 'rotate(90deg)' });
    });

    it('does not apply rotation when rotationEnabled is false', () => {
      // Landscape metadata but portrait image -> would rotate, but rotationEnabled is false
      const gameAssets = createGameAssets(
        {},
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      // Mock portrait image that doesn't match landscape metadata
      const mockImage = { width: 300, height: 400 };
      mockUseImage.mockReturnValue([mockImage, 'loaded']);

      render(
        <CardPreview
          card={gameAssets.cards['rhino']}
          gameAssets={gameAssets}
          mode="modal"
          rotationEnabled={false}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toHaveStyle({ transform: 'none' });
    });

    it('does not apply rotation when image matches metadata orientation', () => {
      // Portrait metadata and portrait image -> no rotation needed
      const gameAssets = createGameAssets(
        {},
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
        [{ match: { type: 'hero' }, orientation: 'portrait' }],
      );

      // Mock portrait image that matches portrait metadata
      const mockImage = { width: 300, height: 400 };
      mockUseImage.mockReturnValue([mockImage, 'loaded']);

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          rotationEnabled={true}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toHaveStyle({ transform: 'none' });
    });

    it('does not apply rotation for landscape image with landscape metadata', () => {
      // Landscape metadata and landscape image -> no rotation needed
      const gameAssets = createGameAssets(
        {},
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      // Mock landscape image that matches landscape metadata
      const mockImage = { width: 400, height: 300 };
      mockUseImage.mockReturnValue([mockImage, 'loaded']);

      render(
        <CardPreview
          card={gameAssets.cards['rhino']}
          gameAssets={gameAssets}
          mode="modal"
          rotationEnabled={true}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toHaveStyle({ transform: 'none' });
    });
  });

  describe('Size presets', () => {
    it('applies small size preset', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          size="small"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      // Small portrait: 200x280
      expect(img).toHaveStyle({ width: '200px', height: '280px' });
    });

    it('applies large size preset', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          size="large"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      // Large portrait: 360x504
      expect(img).toHaveStyle({ width: '360px', height: '504px' });
    });

    it('uses custom dimensions when size is custom', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          size="custom"
          customDimensions={{ width: 400, height: 560 }}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      expect(img).toHaveStyle({ width: '400px', height: '560px' });
    });

    it('falls back to medium when size is invalid', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          size="invalid-size"
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText('Card preview');
      // Fallback to medium: 280x392
      expect(img).toHaveStyle({ width: '280px', height: '392px' });
    });
  });

  describe('Keyboard shortcuts', () => {
    it('calls onClose when ESC key is pressed in hover mode', async () => {
      const user = userEvent.setup();
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when ESC key is pressed in modal mode (via Dialog)', async () => {
      const user = userEvent.setup();
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="modal"
          onClose={mockOnClose}
        />,
      );

      await user.keyboard('{Escape}');

      // Dialog component handles ESC and calls onClose
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onClose when other keys are pressed in hover mode', async () => {
      const user = userEvent.setup();
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      await user.keyboard('a');
      await user.keyboard('{Enter}');
      await user.keyboard('{Space}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('cleans up event listener when unmounted (hover mode)', () => {
      const gameAssets = createGameAssets(
        { hero: {} },
        {
          spiderman: {
            type: 'hero',
            face: 'spiderman.jpg',
          },
        },
      );

      const { unmount } = render(
        <CardPreview
          card={gameAssets.cards['spiderman']}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      unmount();

      // Manually dispatch ESC event after unmount
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);

      // Should not be called after unmount
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Error States', () => {
    it('shows failed state when image load fails', () => {
      mockUseImage.mockReturnValue([null, 'failed']);

      const card: Card = {
        type: 'hero',
        face: 'front.jpg',
      };

      render(
        <CardPreview
          card={card}
          gameAssets={createGameAssets()}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      // Verify "Failed to load" message is visible
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });

    it('logs error when image load fails', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockUseImage.mockReturnValue([null, 'failed']);

      const card: Card = {
        type: 'hero',
        face: 'front.jpg',
      };

      render(
        <CardPreview
          card={card}
          gameAssets={createGameAssets()}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CardPreview] Failed to load card image',
        expect.objectContaining({
          imageUrl: 'front.jpg',
          cardType: 'hero',
          cardFace: 'front.jpg',
          mode: 'hover',
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('shows loading state while image loads', () => {
      mockUseImage.mockReturnValue([null, 'loading']);

      const card: Card = {
        type: 'hero',
        face: 'front.jpg',
      };

      render(
        <CardPreview
          card={card}
          gameAssets={createGameAssets()}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      // Verify "Loading..." message is visible
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Face-down back-image preview: show resolved back when non-default,
  // suppress when default cardType.back. Mirrors hover/modal behavior.
  // ==========================================================================
  describe('Face-down back-image resolution', () => {
    const playerCardType: CardType = {
      back: 'https://example.com/generic-back.png',
      size: 'standard',
    };

    it('shows partner face URL when face-down card has back_code pointing at an existing card', () => {
      const card: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097a.jpg',
        back_code: '01097b',
      };
      const partner: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097b.jpg',
      };
      const gameAssets = createGameAssets(
        {
          main_scheme: {
            back: 'https://example.com/generic-scheme-back.png',
            size: 'standard',
          },
        },
        { '01097a': card, '01097b': partner },
      );

      render(
        <CardPreview
          card={card}
          cardCode="01097a"
          faceUp={false}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText<HTMLImageElement>('Card preview');
      expect(img.src).toBe('https://example.com/01097b.jpg');
    });

    it('shows explicit card.back URL when face-down with no back_code', () => {
      const card: Card = {
        type: 'player',
        face: 'https://example.com/face.jpg',
        back: 'https://example.com/explicit-back.jpg',
      };
      const gameAssets = createGameAssets(
        { player: playerCardType },
        { card1: card },
      );

      render(
        <CardPreview
          card={card}
          cardCode="card1"
          faceUp={false}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText<HTMLImageElement>('Card preview');
      expect(img.src).toBe('https://example.com/explicit-back.jpg');
    });

    it('renders nothing when face-down card resolves to the generic cardType.back', () => {
      const card: Card = {
        type: 'player',
        face: 'https://example.com/face.jpg',
      };
      const gameAssets = createGameAssets(
        { player: playerCardType },
        { card1: card },
      );

      const { container } = render(
        <CardPreview
          card={card}
          cardCode="card1"
          faceUp={false}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when face-down card has back_code pointing at a missing card', () => {
      const card: Card = {
        type: 'player',
        face: 'https://example.com/face.jpg',
        back_code: 'NONEXISTENT',
      };
      const gameAssets = createGameAssets(
        { player: playerCardType },
        { card1: card },
      );

      // Suppress the expected resolver warn so it doesn't pollute output
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const { container } = render(
        <CardPreview
          card={card}
          cardCode="card1"
          faceUp={false}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      expect(container.firstChild).toBeNull();
      consoleWarnSpy.mockRestore();
    });

    it('shows the face when faceUp is true, regardless of back_code', () => {
      const card: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097a.jpg',
        back_code: '01097b',
      };
      const partner: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097b.jpg',
      };
      const gameAssets = createGameAssets(
        {
          main_scheme: {
            back: 'https://example.com/generic-scheme-back.png',
            size: 'standard',
          },
        },
        { '01097a': card, '01097b': partner },
      );

      render(
        <CardPreview
          card={card}
          cardCode="01097a"
          faceUp={true}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText<HTMLImageElement>('Card preview');
      expect(img.src).toBe('https://example.com/01097a.jpg');
    });

    it('falls back to legacy face-only behavior when cardCode is omitted', () => {
      // Legacy callers that haven't migrated to the new shape should keep
      // working: face is shown unconditionally.
      const card: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097a.jpg',
        back_code: '01097b',
      };
      const partner: Card = {
        type: 'main_scheme',
        face: 'https://example.com/01097b.jpg',
      };
      const gameAssets = createGameAssets(
        {
          main_scheme: {
            back: 'https://example.com/generic-scheme-back.png',
            size: 'standard',
          },
        },
        { '01097a': card, '01097b': partner },
      );

      render(
        <CardPreview
          card={card}
          gameAssets={gameAssets}
          mode="hover"
          position={{ x: 100, y: 100 }}
          onClose={mockOnClose}
        />,
      );

      const img = screen.getByAltText<HTMLImageElement>('Card preview');
      expect(img.src).toBe('https://example.com/01097a.jpg');
    });
  });
});
