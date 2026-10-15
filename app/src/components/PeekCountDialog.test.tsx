import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeekCountDialog } from './PeekCountDialog';

function setup(totalCount = 8) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <PeekCountDialog
      isOpen
      totalCount={totalCount}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  const input = screen.getByTestId<HTMLInputElement>('peek-count-input');
  return { onSubmit, onCancel, input };
}

describe('PeekCountDialog', () => {
  it('focuses the input pre-filled with 3 and shows "of M"', () => {
    const { input } = setup();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('3');
    expect(screen.getByText(/of 8/)).toBeTruthy();
  });

  it('pre-fills with the stack size when smaller than 3', () => {
    const { input } = setup(2);
    expect(input.value).toBe('2');
  });

  it('submits the typed number on Enter', () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith(5);
  });

  it('submits on OK', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByTestId('peek-count-ok'));
    expect(onSubmit).toHaveBeenCalledWith(3);
  });

  it('clamps above the stack size and below 1', () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenLastCalledWith(8);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenLastCalledWith(1);
  });

  it('cancels on Esc and Cancel without submitting', () => {
    const { onSubmit, onCancel } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('peek-count-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
