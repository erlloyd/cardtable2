import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectKind, toCardEntries, type CardEntry } from '@cardtable2/shared';
import { ActionRegistry } from './ActionRegistry';
import { registerHandActions } from './handActions';
import type { ActionContext, SelectionInfo } from './types';
import { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';

const ACTIONS = [
  ['draw-to-hand', 'D'],
  ['draw-to-table', 'T'],
  ['draw-all-to-hand', 'Shift+D'],
  ['draw-all-to-table', 'Shift+T'],
] as const;

describe('handActions', () => {
  let store: YjsStore;
  let registry: ActionRegistry;
  let cleanup: () => void;

  function makeStack(codes: string[], x = 100): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x, y: 200, r: 0 },
      cards: toCardEntries(codes),
      faceUp: true,
    });
  }

  function makeToken(): string {
    return createObject(store, {
      kind: ObjectKind.Token,
      pos: { x: 0, y: 0, r: 0 },
    });
  }

  function ctxFor(
    ids: string[],
    extra: Partial<ActionContext> = {},
  ): ActionContext {
    const hasStacks = ids.some(
      (id) => store.getObjectYMap(id)?.get('_kind') === ObjectKind.Stack,
    );
    const selection: SelectionInfo = {
      ids,
      yMaps: [],
      count: ids.length,
      hasStacks,
      hasTokens: false,
      hasCounters: false,
      hasMixed: false,
      allLocked: false,
      allUnlocked: true,
      canAct: true,
    };
    return { store, selection, actorId: 'a', ...extra };
  }

  function run(id: string, ctx: ActionContext): void {
    const action = registry.getAction(id);
    if (!action) throw new Error(`missing action ${id}`);
    void action.execute(ctx);
  }

  function stackCodes(id: string): string[] {
    const cards: CardEntry[] | undefined = store
      .getObjectYMap(id)
      ?.get('_cards');
    return (cards ?? []).map((c) => c.code);
  }

  function stackCount(): number {
    return store.getObjectsByKind(ObjectKind.Stack).length;
  }

  beforeEach(() => {
    store = new YjsStore('test-hand-actions');
    registry = ActionRegistry.getInstance();
    registry.clear();
    cleanup = registerHandActions(registry);
  });

  it('registers the four draw actions with their shortcuts and cleans them up', () => {
    for (const [id, shortcut] of ACTIONS) {
      expect(registry.getAction(id)?.shortcut).toBe(shortcut);
    }
    for (const id of ['add-to-hand', 'draw-card', 'deal-cards']) {
      expect(registry.getAction(id)).toBeUndefined();
    }

    cleanup();
    for (const [id] of ACTIONS) {
      expect(registry.getAction(id)).toBeUndefined();
    }
  });

  it('is unavailable with no selection or only a token selected', () => {
    const token = makeToken();
    for (const [id] of ACTIONS) {
      const action = registry.getAction(id);
      expect(action?.isAvailable?.(ctxFor([]))).toBe(false);
      expect(action?.isAvailable?.(ctxFor([token]))).toBe(false);
    }
  });

  it('is available with a stack selected', () => {
    const stack = makeStack(['a', 'b']);
    for (const [id] of ACTIONS) {
      expect(registry.getAction(id)?.isAvailable?.(ctxFor([stack]))).toBe(true);
    }
  });

  it('draw-to-hand moves 1 card by default and N with numericPrefix', () => {
    const stack = makeStack(['a', 'b', 'c', 'd', 'e']);
    const hand = store.createHand('H');

    run('draw-to-hand', ctxFor([stack], { activeHandId: hand }));
    expect(store.getHandCards(hand).map((c) => c.code)).toEqual(['a']);

    run(
      'draw-to-hand',
      ctxFor([stack], { activeHandId: hand, numericPrefix: 3 }),
    );
    expect(store.getHandCards(hand).map((c) => c.code)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(stackCodes(stack)).toEqual(['e']);
  });

  it('draw-to-table moves 1 card by default and N with numericPrefix', () => {
    const stack = makeStack(['a', 'b', 'c', 'd', 'e']);

    run('draw-to-table', ctxFor([stack]));
    expect(stackCodes(stack)).toEqual(['b', 'c', 'd', 'e']);
    expect(stackCount()).toBe(2);

    run('draw-to-table', ctxFor([stack], { numericPrefix: 3 }));
    expect(stackCodes(stack)).toEqual(['e']);
    expect(stackCount()).toBe(5);
  });

  it('the all actions empty the deck and ignore numericPrefix', () => {
    const hand = store.createHand('H');
    const toHand = makeStack(['a', 'b', 'c']);
    run(
      'draw-all-to-hand',
      ctxFor([toHand], { activeHandId: hand, numericPrefix: 1 }),
    );
    expect(store.getHandCards(hand).map((c) => c.code)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(store.getObjectYMap(toHand)).toBeUndefined();

    const toTable = makeStack(['x', 'y', 'z']);
    run('draw-all-to-table', ctxFor([toTable], { numericPrefix: 1 }));
    expect(store.getObjectYMap(toTable)).toBeUndefined();
    expect(stackCount()).toBe(3);
  });

  it('draws N from each of several decks in one store update', () => {
    const s1 = makeStack(['a', 'b', 'c'], 100);
    const s2 = makeStack(['x', 'y', 'z'], 400);
    const hand = store.createHand('H');

    let updates = 0;
    const handler = () => {
      updates++;
    };
    store.getDoc().on('update', handler);
    run(
      'draw-to-hand',
      ctxFor([s1, s2], { activeHandId: hand, numericPrefix: 2 }),
    );
    store.getDoc().off('update', handler);

    expect(updates).toBe(1);
    expect(store.getHandCards(hand).map((c) => c.code)).toEqual([
      'a',
      'b',
      'x',
      'y',
    ]);
    expect(stackCodes(s1)).toEqual(['c']);
    expect(stackCodes(s2)).toEqual(['z']);
  });

  it('creates "Hand 1" when no hand exists', () => {
    const stack = makeStack(['a', 'b']);
    expect(store.getHandIds()).toEqual([]);

    run('draw-to-hand', ctxFor([stack]));

    const [handId] = store.getHandIds();
    expect(store.getHandName(handId)).toBe('Hand 1');
    expect(store.getHandCards(handId).map((c) => c.code)).toEqual(['a']);
  });

  it('skips non-stack objects in a mixed selection', () => {
    const token = makeToken();
    const stack = makeStack(['a', 'b']);
    const hand = store.createHand('H');

    run('draw-to-hand', ctxFor([token, stack], { activeHandId: hand }));

    expect(store.getHandCards(hand).map((c) => c.code)).toEqual(['a']);
  });
});
