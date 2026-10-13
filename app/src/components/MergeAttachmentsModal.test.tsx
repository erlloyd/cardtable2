import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MergeAttachmentsModal } from './MergeAttachmentsModal';

describe('MergeAttachmentsModal', () => {
  it.each([
    ['merge-attachments-merge', 'merge'],
    ['merge-attachments-target', 'target'],
    ['merge-attachments-source', 'source'],
  ])('%s calls onChoose with %s', async (testId, choice) => {
    const onChoose = vi.fn();
    render(<MergeAttachmentsModal isOpen onChoose={onChoose} />);

    await userEvent.click(screen.getByTestId(testId));

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(choice);
  });

  it('ignores Escape and a backdrop click, and has no close button', async () => {
    const onChoose = vi.fn();
    render(<MergeAttachmentsModal isOpen onChoose={onChoose} />);

    await userEvent.keyboard('{Escape}');
    const panel = screen.getByTestId('merge-attachments-panel');
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: panel.parentElement!,
    });

    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByTestId('merge-attachments-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('keeps focus inside the panel after a backdrop click', async () => {
    render(<MergeAttachmentsModal isOpen onChoose={vi.fn()} />);
    const panel = screen.getByTestId('merge-attachments-panel');
    await waitFor(() =>
      expect(panel).toContainElement(document.activeElement as HTMLElement),
    );

    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: panel.parentElement!,
    });

    expect(panel).toContainElement(document.activeElement as HTMLElement);
  });

  it('renders nothing when closed', () => {
    render(<MergeAttachmentsModal isOpen={false} onChoose={vi.fn()} />);
    expect(screen.queryByTestId('merge-attachments-panel')).toBeNull();
  });
});
