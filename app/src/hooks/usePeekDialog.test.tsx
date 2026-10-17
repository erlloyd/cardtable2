import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { ObjectKind, toCardEntries, type CardEntry } from '@cardtable2/shared';
import { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';
import type { PeekPlacement } from '../store/YjsPeekActions';
import { getToasts } from '../toast/toastStore';
import { usePeekDialog } from './usePeekDialog';

interface MockModalProps {
  isOpen: boolean;
  cards: CardEntry[];
  onDone: (
    placements: PeekPlacement[],
    shuffle: { shuffleTop: boolean; shuffleBottom: boolean },
  ) => void;
}

// Drag mechanics are PeekModal's own tests; here a button sends every card
// to the hand so the hook's commit handling is what is under test.
vi.mock('../components/PeekModal', () => ({
  PeekModal: ({ isOpen, cards, onDone }: MockModalProps) =>
    isOpen ? (
      <button
        data-testid="send-to-hand"
        onClick={() =>
          onDone(
            cards.map((entry) => ({ entry, dest: 'hand' as const })),
            { shuffleTop: false, shuffleBottom: false },
          )
        }
      />
    ) : null,
}));

describe('usePeekDialog commit handling', () => {
  let store: YjsStore;
  let stackId: string;
  let cards: CardEntry[];

  function openAndRender() {
    const view = renderHook(() => usePeekDialog(store, null, null));
    act(() => view.result.current.openPeek(stackId, 2));
    render(<>{view.result.current.peekDialog}</>);
    return view;
  }

  beforeEach(() => {
    store = new YjsStore('test-table');
    cards = toCardEntries(['A', 'B', 'C']);
    stackId = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards,
      faceUp: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('isPeekOpen is true while the window is open and false once closed', () => {
    const view = renderHook(() => usePeekDialog(store, null, null));
    expect(view.result.current.isPeekOpen).toBe(false);
    act(() => view.result.current.openPeek(stackId, 2));
    expect(view.result.current.isPeekOpen).toBe(true);
  });

  it('toasts on an invalid commit and creates no hand', () => {
    const view = openAndRender();
    expect(view.result.current.isPeekOpen).toBe(true);
    store.deleteObject(stackId);
    const before = getToasts().length;

    fireEvent.click(screen.getByTestId('send-to-hand'));

    expect(getToasts().length).toBe(before + 1);
    expect(getToasts().at(-1)?.message).toMatch(/could not apply/i);
    expect(store.getHandIds()).toEqual([]);
  });

  it('creates no hand when the commit is stale', () => {
    openAndRender();
    store.getObjectYMap(stackId)?.set('_cards', toCardEntries(['Z', 'A', 'B']));
    const before = getToasts().length;

    fireEvent.click(screen.getByTestId('send-to-hand'));

    expect(getToasts().length).toBe(before + 1);
    expect(getToasts().at(-1)?.message).toMatch(/deck changed/i);
    expect(store.getHandIds()).toEqual([]);
  });

  it('creates Hand 1 and fills it when the commit applies with no hand', () => {
    openAndRender();

    fireEvent.click(screen.getByTestId('send-to-hand'));

    const [handId] = store.getHandIds();
    expect(store.getHandCards(handId)).toEqual(cards.slice(0, 2));
  });
});
