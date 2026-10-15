import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CardEntry } from '@cardtable2/shared';
import { PeekModal } from './PeekModal';

const cards = [{ code: 'a' }, { code: 'b' }, { code: 'c' }];

function setup(canDiscard: (entry: CardEntry) => boolean = () => true) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <PeekModal
      isOpen
      cards={cards}
      getFaceUrl={(code) => (code === 'a' ? 'a.png' : null)}
      canDiscard={canDiscard}
      onDone={onDone}
      onClose={onClose}
    />,
  );
  return { onDone, onClose };
}

const codes = () =>
  screen.getAllByTestId('peek-card').map((el) => el.getAttribute('data-code'));

function pointer(type: string, clientX: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientX, clientY: 0 }));
  });
}

describe('PeekModal', () => {
  it('renders the snapshot in order, labels the top, falls back to code text', () => {
    setup();
    expect(codes()).toEqual(['a', 'b', 'c']);
    expect(screen.getByText('Top', { selector: 'span' })).toBeTruthy();
    expect(screen.getByAltText('a')).toBeTruthy();
    expect(screen.getAllByText('b').length).toBe(1);
  });

  it('Done without dragging returns identity order, all top', () => {
    const { onDone } = setup();
    fireEvent.click(screen.getByTestId('peek-done'));
    expect(onDone).toHaveBeenCalledWith(
      cards.map((entry) => ({ entry, dest: 'top' })),
    );
  });

  it('Cancel and Esc call onClose and never onDone', () => {
    const { onDone, onClose } = setup();
    fireEvent.click(screen.getByTestId('peek-cancel'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('dragging a card across a slot reorders it', () => {
    const { onDone } = setup();
    const first = screen.getAllByTestId('peek-card')[0];
    fireEvent.pointerDown(first, { button: 0, clientX: 10, clientY: 0 });
    pointer('pointermove', 150);
    pointer('pointermove', 230);
    pointer('pointerup', 230);
    expect(codes()).toEqual(['b', 'a', 'c']);
    fireEvent.click(screen.getByTestId('peek-done'));
    expect(onDone).toHaveBeenCalledWith([
      { entry: cards[1], dest: 'top' },
      { entry: cards[0], dest: 'top' },
      { entry: cards[2], dest: 'top' },
    ]);
  });

  it('every card has a destination control defaulting to top', () => {
    setup();
    const selects = screen.getAllByTestId('peek-dest') as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['top', 'top', 'top']);
  });

  it('a chosen dest travels with its card through a drag and into onDone', () => {
    const { onDone } = setup();
    fireEvent.change(screen.getAllByTestId('peek-dest')[0], {
      target: { value: 'bottom' },
    });
    const first = screen.getAllByTestId('peek-card')[0];
    fireEvent.pointerDown(first, { button: 0, clientX: 10, clientY: 0 });
    pointer('pointermove', 150);
    pointer('pointermove', 230);
    pointer('pointerup', 230);
    expect(codes()).toEqual(['b', 'a', 'c']);
    const selects = screen.getAllByTestId('peek-dest') as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['top', 'bottom', 'top']);
    fireEvent.click(screen.getByTestId('peek-done'));
    expect(onDone).toHaveBeenCalledWith([
      { entry: cards[1], dest: 'top' },
      { entry: cards[0], dest: 'bottom' },
      { entry: cards[2], dest: 'top' },
    ]);
  });

  it('disables Discard only for entries without a home zone', () => {
    setup((entry) => entry.code === 'b');
    const discardDisabled = screen
      .getAllByTestId('peek-dest')
      .map(
        (s) =>
          (
            Array.from((s as HTMLSelectElement).options).find(
              (o) => o.value === 'discard',
            ) as HTMLOptionElement
          ).disabled,
      );
    expect(discardDisabled).toEqual([true, false, true]);
  });
});
