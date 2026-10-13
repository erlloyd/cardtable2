import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectKind, toCardEntries } from '@cardtable2/shared';
import type { AttachmentData } from '@cardtable2/shared';
import { YjsStore } from '../../store/YjsStore';
import {
  createDiscardZoneForStack,
  createObject,
} from '../../store/YjsActions';
import { BoardMessageBus, type BoardHandlerContext } from './BoardMessageBus';

describe('BoardMessageBus stack-objects', () => {
  let store: YjsStore;
  let requestMergeChoice: ReturnType<typeof vi.fn>;
  let ctx: BoardHandlerContext;
  const bus = new BoardMessageBus();

  beforeEach(() => {
    store = new YjsStore('test-bus');
    requestMergeChoice = vi.fn();
    ctx = {
      store,
      requestMergeChoice,
      addMessage: vi.fn(),
    } as unknown as BoardHandlerContext;
  });

  function makeStack(code: string, attachments?: AttachmentData): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries([code]),
      faceUp: true,
      meta: attachments ? { attachments } : {},
    });
  }

  function drop(ids: string[], targetId: string): Promise<void> {
    return bus.handleMessage({ type: 'stack-objects', ids, targetId }, ctx);
  }

  function attachmentsOf(id: string): AttachmentData | undefined {
    return store.getObjectYMap(id)?.get('_meta')?.attachments as
      | AttachmentData
      | undefined;
  }

  it('asks when both sides have attachments and leaves the store alone', async () => {
    const target = makeStack('t', { tokens: { damage: 1 } });
    const source = makeStack('s', { tokens: { damage: 2 } });

    await drop([source], target);

    expect(requestMergeChoice).toHaveBeenCalledExactlyOnceWith(
      [source],
      target,
    );
    expect(store.getObjectYMap(source)).toBeDefined();
    expect(attachmentsOf(target)).toEqual({ tokens: { damage: 1 } });
  });

  it('merges immediately when only the dragged side has attachments', async () => {
    const target = makeStack('t');
    const source = makeStack('s', { tokens: { damage: 2 } });

    await drop([source], target);

    expect(requestMergeChoice).not.toHaveBeenCalled();
    expect(store.getObjectYMap(source)).toBeUndefined();
    expect(attachmentsOf(target)).toEqual({ tokens: { damage: 2 } });
  });

  it('merges immediately when only the target has attachments', async () => {
    const target = makeStack('t', { tokens: { damage: 1 } });
    const source = makeStack('s');

    await drop([source], target);

    expect(requestMergeChoice).not.toHaveBeenCalled();
    expect(store.getObjectYMap(source)).toBeUndefined();
    expect(attachmentsOf(target)).toEqual({ tokens: { damage: 1 } });
  });

  describe('onto a discard pile', () => {
    function makePile(attachments?: AttachmentData): string {
      const seed = makeStack('seed');
      const zoneId = createDiscardZoneForStack(store, seed)!;
      store.deleteObject(seed);
      const pile = makeStack('pile', attachments);
      store.getObjectYMap(pile)!.set('_containerId', zoneId);
      return pile;
    }

    it('merges without asking and the pile gains nothing', async () => {
      const pile = makePile();
      const source = makeStack('s', { tokens: { damage: 2 } });

      await drop([source], pile);

      expect(requestMergeChoice).not.toHaveBeenCalled();
      expect(store.getObjectYMap(source)).toBeUndefined();
      expect(attachmentsOf(pile)).toBeUndefined();
    });

    it('does not ask even when the pile has attachments', async () => {
      const pile = makePile({ tokens: { damage: 1 } });
      const source = makeStack('s', { tokens: { damage: 2 } });

      await drop([source], pile);

      expect(requestMergeChoice).not.toHaveBeenCalled();
      expect(store.getObjectYMap(source)).toBeUndefined();
      expect(attachmentsOf(pile)).toEqual({ tokens: { damage: 1 } });
    });
  });
});
