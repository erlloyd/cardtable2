import { useState } from 'react';
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
      totalCount={cards.length}
      onChangeCount={() => {}}
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
      { shuffleTop: false, shuffleBottom: false },
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
    expect(onDone).toHaveBeenCalledWith(
      [
        { entry: cards[1], dest: 'top' },
        { entry: cards[0], dest: 'top' },
        { entry: cards[2], dest: 'top' },
      ],
      { shuffleTop: false, shuffleBottom: false },
    );
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
    expect(onDone).toHaveBeenCalledWith(
      [
        { entry: cards[1], dest: 'top' },
        { entry: cards[0], dest: 'bottom' },
        { entry: cards[2], dest: 'top' },
      ],
      { shuffleTop: false, shuffleBottom: false },
    );
  });

  describe('shuffle checkboxes', () => {
    const box = (id: string) => screen.getByTestId<HTMLInputElement>(id);
    const setDestAt = (index: number, value: string) =>
      fireEvent.change(screen.getAllByTestId('peek-dest')[index], {
        target: { value },
      });

    it('are off by default and disabled when no card has that destination', () => {
      setup();
      expect(box('peek-shuffle-top').checked).toBe(false);
      expect(box('peek-shuffle-top').disabled).toBe(false);
      expect(box('peek-shuffle-bottom').checked).toBe(false);
      expect(box('peek-shuffle-bottom').disabled).toBe(true);
    });

    it('enable with a matching destination and travel into onDone', () => {
      const { onDone } = setup();
      setDestAt(1, 'bottom');
      expect(box('peek-shuffle-bottom').disabled).toBe(false);
      fireEvent.click(box('peek-shuffle-bottom'));
      fireEvent.click(screen.getByTestId('peek-done'));
      expect(onDone.mock.calls[0][1]).toEqual({
        shuffleTop: false,
        shuffleBottom: true,
      });
    });

    it('a ticked box is dropped when its group becomes empty', () => {
      const { onDone } = setup();
      setDestAt(1, 'bottom');
      fireEvent.click(box('peek-shuffle-bottom'));
      setDestAt(1, 'top');
      expect(box('peek-shuffle-bottom').disabled).toBe(true);
      expect(box('peek-shuffle-bottom').checked).toBe(false);
      fireEvent.click(screen.getByTestId('peek-done'));
      expect(onDone.mock.calls[0][1]).toEqual({
        shuffleTop: false,
        shuffleBottom: false,
      });
    });
  });

  describe('N input', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f'].map((code) => ({ code }));

    // Mirrors usePeekDialog: a count change re-snapshots and remounts.
    function Host() {
      const [snap, setSnap] = useState({ n: 3, key: 0 });
      return (
        <PeekModal
          key={snap.key}
          isOpen
          cards={deck.slice(0, snap.n)}
          totalCount={deck.length}
          onChangeCount={(n) => setSnap((s) => ({ n, key: s.key + 1 }))}
          getFaceUrl={() => null}
          canDiscard={() => true}
          onDone={() => {}}
          onClose={() => {}}
        />
      );
    }

    const input = () => screen.getByTestId<HTMLInputElement>('peek-n-input');
    const enter = (value: string) => {
      fireEvent.change(input(), { target: { value } });
      fireEvent.keyDown(input(), { key: 'Enter' });
    };

    it('shows N of total and re-snapshots on Enter', () => {
      render(<Host />);
      expect(input().value).toBe('3');
      expect(screen.getByText(/of 6/)).toBeTruthy();
      enter('5');
      expect(codes()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('clamps a value above the stack size', () => {
      render(<Host />);
      enter('20');
      expect(codes()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(input().value).toBe('6');
    });

    it('blur reverts the input without calling onChangeCount', () => {
      const onChangeCount = vi.fn();
      render(
        <PeekModal
          isOpen
          cards={cards}
          totalCount={6}
          onChangeCount={onChangeCount}
          getFaceUrl={() => null}
          canDiscard={() => true}
          onDone={() => {}}
          onClose={() => {}}
        />,
      );
      fireEvent.change(input(), { target: { value: '5' } });
      fireEvent.blur(input());
      expect(onChangeCount).not.toHaveBeenCalled();
      expect(input().value).toBe('3');
      expect(codes()).toEqual(['a', 'b', 'c']);
    });

    it('Enter resets destinations when N changes', () => {
      render(<Host />);
      fireEvent.change(screen.getAllByTestId('peek-dest')[0], {
        target: { value: 'hand' },
      });
      enter('4');
      expect(codes()).toEqual(['a', 'b', 'c', 'd']);
      const dests = screen.getAllByTestId('peek-dest') as HTMLSelectElement[];
      expect(dests.map((s) => s.value)).toEqual(['top', 'top', 'top', 'top']);
    });
  });

  it('hides the N box when fixedCount is set and keeps it otherwise', () => {
    const props = {
      isOpen: true,
      cards,
      totalCount: 6,
      onChangeCount: () => {},
      getFaceUrl: () => null,
      canDiscard: () => true,
      onDone: () => {},
      onClose: () => {},
    };
    const { rerender } = render(<PeekModal {...props} />);
    expect(screen.queryByTestId('peek-n-input')).toBeTruthy();
    rerender(<PeekModal {...props} fixedCount />);
    expect(screen.queryByTestId('peek-n-input')).toBeNull();
    expect(codes()).toEqual(['a', 'b', 'c']);
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
