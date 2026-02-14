import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionRegistry } from './ActionRegistry';
import { registerAttachmentActions } from './attachmentActions';
import type { ActionContext } from './types';
import type { GameAssets, AttachmentData } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';

/**
 * Create a minimal GameAssets with attachment type definitions
 */
function createGameAssets(overrides?: Partial<GameAssets>): GameAssets {
  return {
    packs: [],
    cards: {},
    cardTypes: {},
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
    tokenTypes: {
      damage: { name: 'Damage', image: '/tokens/damage.png' },
      threat: { name: 'Threat', image: '/tokens/threat.png' },
    },
    statusTypes: {
      stunned: {
        name: 'Stunned',
        image: '/status/stunned.png',
      },
      confused: {
        name: 'Confused',
        image: '/status/confused.png',
        countable: true,
      },
    },
    modifierStats: {
      THW: {
        code: 'THW',
        name: 'Thwart',
        positiveColor: 0x4caf50,
        negativeColor: 0xf44336,
      },
      ATK: {
        code: 'ATK',
        name: 'Attack',
        positiveColor: 0x4caf50,
        negativeColor: 0xf44336,
      },
    },
    iconTypes: {},
    ...overrides,
  };
}

/**
 * Create a mock YMap that stores key-value pairs in a plain Map
 */
function createMockYMap(initial?: Record<string, unknown>) {
  const data = new Map<string, unknown>(initial ? Object.entries(initial) : []);
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: unknown) => data.set(key, value)),
  };
}

/**
 * Create a mock ActionContext with YjsStore for testing action execution
 */
function createMockContext(yMapData?: Record<string, unknown>): {
  context: ActionContext;
  yMap: ReturnType<typeof createMockYMap>;
  transactFn: ReturnType<typeof vi.fn>;
} {
  const yMap = createMockYMap(yMapData);
  const transactFn = vi.fn((fn: () => void) => fn());

  const mockStore = {
    getAllObjects: vi.fn(() => new Map()),
    getObject: vi.fn(),
    getObjectYMap: vi.fn(() => yMap),
    getDoc: vi.fn(() => ({ transact: transactFn })),
  } as unknown as YjsStore;

  const context: ActionContext = {
    store: mockStore,
    selection: {
      ids: ['stack-1'],
      yMaps: [],
      count: 1,
      hasStacks: true,
      hasTokens: false,
      hasMixed: false,
      allLocked: false,
      allUnlocked: true,
      canAct: true,
    },
    actorId: 'test-actor',
  };

  return { context, yMap, transactFn };
}

describe('attachmentActions', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = ActionRegistry.getInstance();
    registry.clear();
  });

  describe('registerAttachmentActions', () => {
    it('should register token add/remove actions for each token type', () => {
      const gameAssets = createGameAssets();

      registerAttachmentActions(registry, gameAssets);

      expect(registry.getAction('add-token-damage')).toBeDefined();
      expect(registry.getAction('remove-token-damage')).toBeDefined();
      expect(registry.getAction('add-token-threat')).toBeDefined();
      expect(registry.getAction('remove-token-threat')).toBeDefined();
    });

    it('should register status add/remove actions for each status type', () => {
      const gameAssets = createGameAssets();

      registerAttachmentActions(registry, gameAssets);

      expect(registry.getAction('add-status-stunned')).toBeDefined();
      expect(registry.getAction('remove-status-stunned')).toBeDefined();
      expect(registry.getAction('add-status-confused')).toBeDefined();
      expect(registry.getAction('remove-status-confused')).toBeDefined();
    });

    it('should register modifier +/- actions for each stat', () => {
      const gameAssets = createGameAssets();

      registerAttachmentActions(registry, gameAssets);

      expect(registry.getAction('modify-thw-plus')).toBeDefined();
      expect(registry.getAction('modify-thw-minus')).toBeDefined();
      expect(registry.getAction('modify-atk-plus')).toBeDefined();
      expect(registry.getAction('modify-atk-minus')).toBeDefined();
    });

    it('should not register actions when gameAssets is null', () => {
      registerAttachmentActions(registry, null);

      expect(registry.size).toBe(0);
    });

    it('should clear stale actions when called with null gameAssets', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);
      expect(registry.size).toBeGreaterThan(0);

      // Simulate table reset: re-register with null to clear
      registerAttachmentActions(registry, null);

      expect(registry.getAction('add-token-damage')).toBeUndefined();
      expect(registry.getAction('remove-status-stunned')).toBeUndefined();
      expect(registry.getAction('modify-thw-plus')).toBeUndefined();
      expect(registry.size).toBe(0);
    });

    it('should not register actions for missing type categories', () => {
      const gameAssets = createGameAssets({
        tokenTypes: undefined,
        statusTypes: undefined,
        modifierStats: undefined,
      });

      registerAttachmentActions(registry, gameAssets);

      expect(registry.size).toBe(0);
    });

    it('should clear previous attachment actions before re-registering', () => {
      const gameAssets = createGameAssets();

      registerAttachmentActions(registry, gameAssets);
      const initialSize = registry.size;

      // Re-register with different types
      const newAssets = createGameAssets({
        tokenTypes: {
          energy: { name: 'Energy', image: '/tokens/energy.png' },
        },
        statusTypes: {},
        modifierStats: {},
      });

      registerAttachmentActions(registry, newAssets);

      // Old actions should be gone, only new ones present
      expect(registry.getAction('add-token-damage')).toBeUndefined();
      expect(registry.getAction('add-token-energy')).toBeDefined();
      expect(registry.size).toBeLessThan(initialSize);
    });

    it('should assign keyboard shortcuts to token actions based on slot index', () => {
      const gameAssets = createGameAssets();

      registerAttachmentActions(registry, gameAssets);

      const addDamage = registry.getAction('add-token-damage');
      const addThreat = registry.getAction('add-token-threat');
      const removeDamage = registry.getAction('remove-token-damage');
      const removeThreat = registry.getAction('remove-token-threat');

      // First token type gets Cmd+1 / Shift+1
      expect(addDamage?.shortcut).toBe('Cmd+1');
      expect(removeDamage?.shortcut).toBe('Shift+1');

      // Second token type gets Cmd+2 / Shift+2
      expect(addThreat?.shortcut).toBe('Cmd+2');
      expect(removeThreat?.shortcut).toBe('Shift+2');
    });

    it('should not assign keyboard shortcuts beyond slot 9', () => {
      const tokenTypes: GameAssets['tokenTypes'] = {};
      for (let i = 0; i < 12; i++) {
        tokenTypes[`type${i}`] = {
          name: `Type ${i}`,
          image: `/tokens/type${i}.png`,
        };
      }

      const gameAssets = createGameAssets({ tokenTypes });

      registerAttachmentActions(registry, gameAssets);

      // Slot 10 (index 9) = number 10, no shortcut
      const addType9 = registry.getAction('add-token-type9');
      expect(addType9?.shortcut).toBeUndefined();
    });
  });

  describe('token action availability', () => {
    it('add token should be available when single stack is selected', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext();
      const action = registry.getAction('add-token-damage')!;

      expect(action.isAvailable(context)).toBe(true);
    });

    it('add token should not be available when multiple objects selected', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext();
      context.selection.count = 2;
      context.selection.ids = ['stack-1', 'stack-2'];

      const action = registry.getAction('add-token-damage')!;
      expect(action.isAvailable(context)).toBe(false);
    });

    it('add token should not be available when non-stack selected', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext();
      context.selection.hasStacks = false;

      const action = registry.getAction('add-token-damage')!;
      expect(action.isAvailable(context)).toBe(false);
    });

    it('remove token should not be available when token count is 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext({ _meta: {} });
      const action = registry.getAction('remove-token-damage')!;

      expect(action.isAvailable(context)).toBe(false);
    });

    it('remove token should be available when token count > 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext({
        _meta: { attachments: { tokens: { damage: 3 } } },
      });
      const action = registry.getAction('remove-token-damage')!;

      expect(action.isAvailable(context)).toBe(true);
    });
  });

  describe('token action execution', () => {
    it('add token should increment count from 0 to 1', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({ _meta: {} });
      const action = registry.getAction('add-token-damage')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      expect(meta).toBeDefined();
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.tokens?.damage).toBe(1);
    });

    it('add token should increment existing count', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { tokens: { damage: 3 } } },
      });
      const action = registry.getAction('add-token-damage')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.tokens?.damage).toBe(4);
    });

    it('remove token should decrement count', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { tokens: { damage: 3 } } },
      });
      const action = registry.getAction('remove-token-damage')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.tokens?.damage).toBe(2);
    });

    it('remove token should delete key when count reaches 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { tokens: { damage: 1 } } },
      });
      const action = registry.getAction('remove-token-damage')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.tokens?.damage).toBeUndefined();
    });

    it('token actions should use Yjs transactions', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, transactFn } = createMockContext({ _meta: {} });
      const action = registry.getAction('add-token-damage')!;

      void action.execute(context);

      expect(transactFn).toHaveBeenCalledOnce();
    });
  });

  describe('status action availability', () => {
    it('non-countable status add should not be available when already present', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      // stunned is non-countable (default)
      const { context } = createMockContext({
        _meta: { attachments: { status: { stunned: 1 } } },
      });
      const action = registry.getAction('add-status-stunned')!;

      expect(action.isAvailable(context)).toBe(false);
    });

    it('non-countable status add should be available when not present', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext({ _meta: {} });
      const action = registry.getAction('add-status-stunned')!;

      expect(action.isAvailable(context)).toBe(true);
    });

    it('countable status add should always be available when stack selected', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      // confused is countable
      const { context } = createMockContext({
        _meta: { attachments: { status: { confused: 5 } } },
      });
      const action = registry.getAction('add-status-confused')!;

      expect(action.isAvailable(context)).toBe(true);
    });

    it('remove status should be available when count > 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext({
        _meta: { attachments: { status: { stunned: 1 } } },
      });
      const action = registry.getAction('remove-status-stunned')!;

      expect(action.isAvailable(context)).toBe(true);
    });

    it('remove status should not be available when count is 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext({ _meta: {} });
      const action = registry.getAction('remove-status-stunned')!;

      expect(action.isAvailable(context)).toBe(false);
    });
  });

  describe('status action execution', () => {
    it('add status should set count to 1 for non-countable', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({ _meta: {} });
      const action = registry.getAction('add-status-stunned')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.status?.stunned).toBe(1);
    });

    it('add countable status should increment count', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { status: { confused: 2 } } },
      });
      const action = registry.getAction('add-status-confused')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.status?.confused).toBe(3);
    });

    it('remove status should delete key when count reaches 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { status: { stunned: 1 } } },
      });
      const action = registry.getAction('remove-status-stunned')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.status?.stunned).toBeUndefined();
    });

    it('remove countable status should decrement count', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { status: { confused: 3 } } },
      });
      const action = registry.getAction('remove-status-confused')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.status?.confused).toBe(2);
    });
  });

  describe('modifier action execution', () => {
    it('increment modifier should add +1', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({ _meta: {} });
      const action = registry.getAction('modify-thw-plus')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.modifiers?.THW).toBe(1);
    });

    it('decrement modifier should subtract 1', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { modifiers: { THW: 2 } } },
      });
      const action = registry.getAction('modify-thw-minus')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.modifiers?.THW).toBe(1);
    });

    it('decrement modifier should delete key when reaching 0', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({
        _meta: { attachments: { modifiers: { THW: 1 } } },
      });
      const action = registry.getAction('modify-thw-minus')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.modifiers?.THW).toBeUndefined();
    });

    it('modifier can go negative', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context, yMap } = createMockContext({ _meta: {} });
      const action = registry.getAction('modify-atk-minus')!;

      void action.execute(context);

      const meta = yMap.set.mock.calls.find(
        (c: [string, unknown]) => c[0] === '_meta',
      );
      const attachments = (meta![1] as Record<string, unknown>)
        .attachments as AttachmentData;
      expect(attachments.modifiers?.ATK).toBe(-1);
    });

    it('modifier actions should always be available for single stack', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const { context } = createMockContext();
      const plusAction = registry.getAction('modify-thw-plus')!;
      const minusAction = registry.getAction('modify-thw-minus')!;

      expect(plusAction.isAvailable(context)).toBe(true);
      expect(minusAction.isAvailable(context)).toBe(true);
    });
  });

  describe('action execution with no yMap', () => {
    it('should handle missing yMap gracefully', () => {
      const gameAssets = createGameAssets();
      registerAttachmentActions(registry, gameAssets);

      const mockStore = {
        getAllObjects: vi.fn(() => new Map()),
        getObject: vi.fn(),
        getObjectYMap: vi.fn(() => null),
        getDoc: vi.fn(),
      } as unknown as YjsStore;

      const context: ActionContext = {
        store: mockStore,
        selection: {
          ids: ['stack-1'],
          yMaps: [],
          count: 1,
          hasStacks: true,
          hasTokens: false,
          hasMixed: false,
          allLocked: false,
          allUnlocked: true,
          canAct: true,
        },
        actorId: 'test-actor',
      };

      const action = registry.getAction('add-token-damage')!;
      // Should not throw
      expect(() => action.execute(context)).not.toThrow();
    });
  });
});
