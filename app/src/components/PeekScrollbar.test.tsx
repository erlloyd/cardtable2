import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PeekScrollbar } from './PeekScrollbar';
import { thumbGeometry } from './peekScrollMath';

describe('thumbGeometry', () => {
  it('sizes the thumb by the visible fraction and positions it by scrollLeft', () => {
    const start = thumbGeometry({
      clientWidth: 300,
      scrollWidth: 900,
      scrollLeft: 0,
    });
    expect(start.width).toBe(100);
    expect(start.left).toBe(0);
    expect(start.maxScroll).toBe(600);

    const end = thumbGeometry({
      clientWidth: 300,
      scrollWidth: 900,
      scrollLeft: 600,
    });
    expect(end.left).toBe(200);
    expect(end.left + end.width).toBe(300);
  });

  it('keeps a minimum thumb width for very wide content', () => {
    const g = thumbGeometry({
      clientWidth: 300,
      scrollWidth: 30000,
      scrollLeft: 0,
    });
    expect(g.width).toBe(32);
  });
});

function makeRow(clientWidth: number, scrollWidth: number) {
  const row = document.createElement('div');
  Object.defineProperty(row, 'clientWidth', { value: clientWidth });
  Object.defineProperty(row, 'scrollWidth', { value: scrollWidth });
  return { current: row };
}

describe('PeekScrollbar', () => {
  it('renders nothing when the content fits', () => {
    render(<PeekScrollbar rowRef={makeRow(300, 300)} />);
    expect(screen.queryByTestId('peek-scrollbar')).toBeNull();
  });

  it('dragging the thumb scrolls the row proportionally', () => {
    const rowRef = makeRow(300, 900);
    render(<PeekScrollbar rowRef={rowRef} />);
    const thumb = screen.getByTestId('peek-scrollbar-thumb');

    fireEvent.pointerDown(thumb, { button: 0, clientX: 10, clientY: 0 });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 110, clientY: 0 }),
      );
    });
    expect(rowRef.current.scrollLeft).toBe(300);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 110 }));
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 210, clientY: 0 }),
      );
    });
    expect(rowRef.current.scrollLeft).toBe(300);
  });

  it('tapping the track centres the thumb there', () => {
    const rowRef = makeRow(300, 900);
    render(<PeekScrollbar rowRef={rowRef} />);
    const bar = screen.getByTestId('peek-scrollbar');
    bar.getBoundingClientRect = () => new DOMRect(0, 0, 300, 28);

    fireEvent.pointerDown(bar, { button: 0, clientX: 150, clientY: 0 });
    expect(rowRef.current.scrollLeft).toBe(300);

    fireEvent.pointerDown(bar, { button: 0, clientX: 299, clientY: 0 });
    expect(rowRef.current.scrollLeft).toBe(600);
  });
});
