import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectKind, toCardEntries } from '@cardtable2/shared';
import { ActionRegistry } from './ActionRegistry';
import { registerPeekActions } from './peekActions';
import type { ActionContext, SelectionInfo } from './types';
import { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';

type OpenPeek = (
  id: string,
  n: number,
  options?: { askCount?: boolean },
) => void;

describe('peekActions', () => {
  let store: YjsStore;
  let registry: ActionRegistry;
  let cleanup: () => void;
  let onOpenPeek: ReturnType<typeof vi.fn<OpenPeek>>;

  function makeStack(codes: string[]): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 100, y: 200, r: 0 },
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
    return { store, selection, actorId: 'a', onOpenPeek, ...extra };
  }

  beforeEach(() => {
    store = new YjsStore('test-peek-actions');
    registry = ActionRegistry.getInstance();
    registry.clear();
    onOpenPeek = vi.fn<OpenPeek>();
    cleanup = registerPeekActions(registry);
  });

  it('is available with one stack and onOpenPeek set', () => {
    const stack = makeStack(['a', 'b']);
    expect(registry.getAction('peek-stack')?.isAvailable(ctxFor([stack]))).toBe(
      true,
    );
  });

  it('is unavailable without onOpenPeek, with two stacks, or with a non-stack', () => {
    const s1 = makeStack(['a']);
    const s2 = makeStack(['b']);
    const token = makeToken();
    const action = registry.getAction('peek-stack');
    expect(action?.isAvailable(ctxFor([s1], { onOpenPeek: undefined }))).toBe(
      false,
    );
    expect(action?.isAvailable(ctxFor([s1, s2]))).toBe(false);
    expect(action?.isAvailable(ctxFor([token]))).toBe(false);
  });

  it('executes with default 3, or the numeric prefix', async () => {
    const stack = makeStack(['a', 'b', 'c', 'd']);
    await registry.execute('peek-stack', ctxFor([stack]));
    expect(onOpenPeek).toHaveBeenLastCalledWith(stack, 3);
    await registry.execute('peek-stack', ctxFor([stack], { numericPrefix: 5 }));
    expect(onOpenPeek).toHaveBeenLastCalledWith(stack, 5);
  });

  it('runs a variant with its own count', async () => {
    const stack = makeStack(['a', 'b']);
    await registry.executeVariant('peek-stack', 'top-10', ctxFor([stack]));
    expect(onOpenPeek).toHaveBeenCalledWith(stack, 10);
  });

  it('Other… asks for the number before opening', async () => {
    const stack = makeStack(['a', 'b', 'c', 'd']);
    await registry.executeVariant('peek-stack', 'other', ctxFor([stack]));
    expect(onOpenPeek).toHaveBeenCalledWith(stack, 3, { askCount: true });
  });

  it('cleanup unregisters the action', () => {
    cleanup();
    expect(registry.getAction('peek-stack')).toBeUndefined();
  });
});
