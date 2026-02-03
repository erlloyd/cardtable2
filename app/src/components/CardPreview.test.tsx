import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CardPreview } from './CardPreview';
import type { Card, CardType, GameAssets } from '@cardtable2/shared';

describe('CardPreview', () => {
  const createGameAssets = (
    cardTypes: Record<string, CardType> = {},
    cards: Record<string, Card> = {},
  ): GameAssets => ({
    packs: [],
    cardTypes,
    cards,
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
  });

  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
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

      const wrapper = container.querySelector('.fixed');
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
        { villain: { orientation: 'landscape' } },
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
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

    it('applies rotation transform for landscape cards when rotationEnabled is true', () => {
      const gameAssets = createGameAssets(
        { villain: { orientation: 'landscape' } },
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
      );

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

    it('does not apply rotation for landscape cards when rotationEnabled is false', () => {
      const gameAssets = createGameAssets(
        { villain: { orientation: 'landscape' } },
        {
          rhino: {
            type: 'villain',
            face: 'rhino.jpg',
          },
        },
      );

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

    it('does not apply rotation for portrait cards', () => {
      const gameAssets = createGameAssets(
        { hero: { orientation: 'portrait' } },
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
});
