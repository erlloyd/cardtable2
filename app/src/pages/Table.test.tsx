import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Table from './Table';

// Mock the Board component since it's lazy loaded
vi.mock('../components/Board', () => ({
  default: ({ tableId }: { tableId: string }) => (
    <div data-testid="board">Board for {tableId}</div>
  ),
}));

describe('Table', () => {
  it('renders with table ID from route', async () => {
    render(
      <MemoryRouter initialEntries={['/table/happy-clever-elephant']}>
        <Routes>
          <Route path="/table/:id" element={<Table />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Table: happy-clever-elephant/i),
    ).toBeInTheDocument();
    // Wait for lazy loaded Board component
    expect(await screen.findByTestId('board')).toBeInTheDocument();
  });
});
