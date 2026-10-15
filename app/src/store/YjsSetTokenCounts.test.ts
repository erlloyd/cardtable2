import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ObjectKind,
  toCardEntries,
  type AttachmentData,
} from '@cardtable2/shared';
import { YjsStore } from './YjsStore';
import {
  createDiscardZoneForStack,
  createObject,
  setStackTokenCounts,
} from './YjsActions';

describe('setStackTokenCounts', () => {
  let store: YjsStore;
  let stackId: string;

  function makeStack(meta?: Record<string, unknown>): string {
    const id = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries(['card-a']),
    });
    if (meta) store.getObjectYMap(id)?.set('_meta', meta);
    return id;
  }

  const meta = () => store.getObjectYMap(stackId)?.get('_meta');
  const tokens = () =>
    (meta()?.attachments as AttachmentData | undefined)?.tokens;

  beforeEach(() => {
    store = new YjsStore('test-table');
    stackId = makeStack();
  });

  it('sets a count from absent', () => {
    expect(setStackTokenCounts(store, stackId, { damage: 7 })).toBe(true);
    expect(tokens()).toEqual({ damage: 7 });
  });

  it('overwrites an existing count', () => {
    stackId = makeStack({ attachments: { tokens: { damage: 3 } } });
    setStackTokenCounts(store, stackId, { damage: 7 });
    expect(tokens()).toEqual({ damage: 7 });
  });

  it('deletes a zero entry and keeps other token codes', () => {
    stackId = makeStack({ attachments: { tokens: { damage: 3, threat: 2 } } });
    setStackTokenCounts(store, stackId, { damage: 0 });
    expect(tokens()).toEqual({ threat: 2 });
  });

  it('deletes tokens and then attachments when all counts are zero', () => {
    stackId = makeStack({ attachments: { tokens: { damage: 3 } } });
    setStackTokenCounts(store, stackId, { damage: 0 });
    expect(meta()).not.toHaveProperty('attachments');
  });

  it('keeps other attachment keys when tokens empties', () => {
    stackId = makeStack({
      attachments: { tokens: { damage: 3 }, status: { stunned: 1 } },
    });
    setStackTokenCounts(store, stackId, { damage: 0 });
    expect(meta()?.attachments).toEqual({ status: { stunned: 1 } });
  });

  it('preserves status, modifiers, icons and unrelated _meta keys', () => {
    stackId = makeStack({
      note: 'keep',
      attachments: {
        tokens: { damage: 1 },
        status: { stunned: 1 },
        modifiers: { ATK: 2 },
        icons: ['guard'],
      },
    });
    setStackTokenCounts(store, stackId, { damage: 5 });
    expect(meta()).toEqual({
      note: 'keep',
      attachments: {
        tokens: { damage: 5 },
        status: { stunned: 1 },
        modifiers: { ATK: 2 },
        icons: ['guard'],
      },
    });
  });

  it('leaves a code missing from counts unchanged', () => {
    stackId = makeStack({ attachments: { tokens: { damage: 3, threat: 2 } } });
    setStackTokenCounts(store, stackId, { damage: 4 });
    expect(tokens()).toEqual({ damage: 4, threat: 2 });
  });

  it('produces no Y update when nothing changed', () => {
    stackId = makeStack({ attachments: { tokens: { damage: 3 } } });
    const onUpdate = vi.fn();
    store.getDoc().on('update', onUpdate);

    expect(setStackTokenCounts(store, stackId, { damage: 3, threat: 0 })).toBe(
      true,
    );
    expect(onUpdate).not.toHaveBeenCalled();

    setStackTokenCounts(store, stackId, { damage: 4 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns false for a missing id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setStackTokenCounts(store, 'nope', { damage: 1 })).toBe(false);
    warn.mockRestore();
  });

  it('returns false for a non-stack', () => {
    const zoneId = createDiscardZoneForStack(store, stackId);
    if (!zoneId) throw new Error('discard zone was not created');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setStackTokenCounts(store, zoneId, { damage: 1 })).toBe(false);
    warn.mockRestore();
  });
});
