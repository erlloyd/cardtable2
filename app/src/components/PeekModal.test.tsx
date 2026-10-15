import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PeekModal } from './PeekModal';

const cards = [{ code: 'a' }, { code: 'b' }, { code: 'c' }];

function setup() {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <PeekModal
      isOpen
      cards={cards}
      getFaceUrl={(code) => (code === 'a' ? 'a.png' : null)}
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
    expect(screen.getByText('Top')).toBeTruthy();
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
});
