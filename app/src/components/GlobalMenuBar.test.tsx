import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalMenuBar } from './GlobalMenuBar';

describe('GlobalMenuBar', () => {
  let onInteractionModeChange: (mode: 'pan' | 'select') => void;
  let onCommandPaletteOpen: () => void;

  beforeEach(() => {
    onInteractionModeChange = vi.fn();
    onCommandPaletteOpen = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render Command Palette button', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      expect(screen.getByLabelText('Open command palette')).toBeInTheDocument();
    });

    it('should render Settings button', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      expect(screen.getByLabelText('Settings and actions')).toBeInTheDocument();
    });
  });

  describe('command palette integration', () => {
    it('should call onCommandPaletteOpen when button clicked', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const commandButton = screen.getByLabelText('Open command palette');
      fireEvent.click(commandButton);

      expect(onCommandPaletteOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('settings menu', () => {
    it('should open settings menu when settings button clicked', async () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const settingsButton = screen.getByLabelText('Settings and actions');
      fireEvent.click(settingsButton);

      // Wait for menu to appear
      await waitFor(() => {
        expect(screen.getByText('Interaction Mode')).toBeInTheDocument();
      });
    });

    it('should show Pan and Select options in settings menu', async () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const settingsButton = screen.getByLabelText('Settings and actions');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByText('Pan')).toBeInTheDocument();
        expect(screen.getByText('Select')).toBeInTheDocument();
      });
    });

    it('should show checkmark on active mode in settings menu', async () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const settingsButton = screen.getByLabelText('Settings and actions');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        const panButton = screen.getByText('Pan').closest('button');
        expect(panButton).toHaveTextContent('✓');
      });
    });

    it('should call onInteractionModeChange when mode clicked in menu', async () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const settingsButton = screen.getByLabelText('Settings and actions');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByText('Select')).toBeInTheDocument();
      });

      const selectButton = screen.getByText('Select').closest('button');
      if (selectButton) {
        fireEvent.click(selectButton);
      }

      expect(onInteractionModeChange).toHaveBeenCalledWith('select');
    });
  });

  describe('keyboard shortcuts', () => {
    it('should switch to select mode when V key pressed', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      fireEvent.keyDown(window, { key: 'v' });

      expect(onInteractionModeChange).toHaveBeenCalledWith('select');
    });

    it('should switch to select mode when uppercase V pressed', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      fireEvent.keyDown(window, { key: 'V' });

      expect(onInteractionModeChange).toHaveBeenCalledWith('select');
    });

    it('should temporarily switch to pan mode when Space pressed', () => {
      render(
        <GlobalMenuBar
          interactionMode="select"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      fireEvent.keyDown(window, { key: ' ' });

      expect(onInteractionModeChange).toHaveBeenCalledWith('pan');
    });

    it('should return to previous mode when Space released', () => {
      render(
        <GlobalMenuBar
          interactionMode="select"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      fireEvent.keyDown(window, { key: ' ' });
      expect(onInteractionModeChange).toHaveBeenCalledWith('pan');

      vi.clearAllMocks();

      fireEvent.keyUp(window, { key: ' ' });
      expect(onInteractionModeChange).toHaveBeenCalledWith('select');
    });

    it('should not trigger shortcuts when typing in input', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const input = document.createElement('input');
      document.body.appendChild(input);

      fireEvent.keyDown(input, { key: 'v' });

      expect(onInteractionModeChange).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should not trigger shortcuts when typing in textarea', () => {
      render(
        <GlobalMenuBar
          interactionMode="pan"
          onInteractionModeChange={onInteractionModeChange}
          onCommandPaletteOpen={onCommandPaletteOpen}
        />,
      );

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      fireEvent.keyDown(textarea, { key: ' ' });

      expect(onInteractionModeChange).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });
  });
});
