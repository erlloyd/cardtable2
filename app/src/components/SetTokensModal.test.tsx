import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SetTokensModal } from './SetTokensModal';

const TOKEN_TYPES = [
  { code: 'damage', name: 'Damage', count: 3 },
  { code: 'threat', name: 'Threat', count: 0 },
];

function setup() {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <SetTokensModal
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      tokenTypes={TOKEN_TYPES}
    />,
  );
  return { onSubmit, onClose };
}

describe('SetTokensModal', () => {
  it('prefills inputs in the given order', () => {
    setup();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.map((i) => i.getAttribute('data-testid'))).toEqual([
      'set-tokens-input-damage',
      'set-tokens-input-threat',
    ]);
    expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual([
      '3',
      '0',
    ]);
  });

  it('Enter submits numeric counts', async () => {
    const { onSubmit } = setup();
    const input = screen.getByTestId('set-tokens-input-damage');
    await userEvent.clear(input);
    await userEvent.type(input, '7{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ damage: 7, threat: 0 });
  });

  it('the Set button submits numeric counts', async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByTestId('set-tokens-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ damage: 3, threat: 0 });
  });

  it('a blank input submits as 0', async () => {
    const { onSubmit } = setup();
    await userEvent.clear(screen.getByTestId('set-tokens-input-damage'));
    await userEvent.click(screen.getByTestId('set-tokens-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ damage: 0, threat: 0 });
  });

  it.each(['-1', '2.5'])(
    '%s disables submit and Enter does nothing',
    async (v) => {
      const { onSubmit } = setup();
      const input = screen.getByTestId('set-tokens-input-damage');
      await userEvent.clear(input);
      await userEvent.type(input, `${v}{Enter}`);
      expect(screen.getByTestId('set-tokens-submit')).toBeDisabled();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('a browser-unparseable draft (badInput) disables submit and Enter does nothing', () => {
    const { onSubmit } = setup();
    const input = screen.getByTestId('set-tokens-input-damage');
    // jsdom never reports badInput; browsers do for drafts like "-" or "e",
    // while value reads back as ''.
    Object.defineProperty(input, 'validity', {
      configurable: true,
      value: { badInput: true },
    });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('set-tokens-submit')).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    Object.defineProperty(input, 'validity', {
      configurable: true,
      value: { badInput: false },
    });
    fireEvent.change(input, { target: { value: '4' } });
    expect(screen.getByTestId('set-tokens-submit')).toBeEnabled();
  });

  it('Esc calls onClose', async () => {
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
