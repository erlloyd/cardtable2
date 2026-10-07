import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import Toaster from './Toaster';
import { showToast } from '../toast/toastStore';

describe('Toaster', () => {
  it('renders an error toast with role alert and dismisses it on click', async () => {
    render(<Toaster />);
    act(() => showToast('x', 'error'));

    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('x');
    expect(document.body).toContainElement(toast);

    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders an info toast with role status', () => {
    render(<Toaster />);
    act(() => showToast('hi'));
    expect(screen.getByRole('status')).toHaveTextContent('hi');
  });
});
