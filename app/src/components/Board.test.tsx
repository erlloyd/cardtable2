import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Board from './Board';

describe('Board', () => {
  it('renders with table ID', () => {
    render(<Board tableId="happy-clever-elephant" />);

    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(
      screen.getByText(/Board loaded for table: happy-clever-elephant/i),
    ).toBeInTheDocument();
  });

  it('displays placeholder message', () => {
    render(<Board tableId="test-table" />);

    expect(
      screen.getByText(/This is a placeholder for the PixiJS board/i),
    ).toBeInTheDocument();
  });
});
