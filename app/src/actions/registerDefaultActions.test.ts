/**
 * Action-registration smoke tests for ct-8gf.5 (+ ct-8vh course-correction).
 *
 * What this file pins down:
 *  1. The hardcoded `load-scenario` and `load-marvelchampions-rhino` actions
 *     are gone — `getAction()` returns `undefined` for both ids.
 *  2. The generic `load` action routes selection through `onOpenLoadPicker`.
 *  3. The dynamic `load-<type>` actions produced by
 *     {@link registerLoadablesActions} cover every loadable type the host
 *     surfaces, including `counter`. Per ct-8vh the counter type is no
 *     longer special-cased: the loadables registry's UI view always
 *     includes a counter entry (synthetic Generic + any plugin-declared
 *     typed counters), so `load-counter` is registered through the regular
 *     per-type path and routes through the picker.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadableEntry } from '@cardtable2/shared';
import { ActionRegistry } from './ActionRegistry';
import {
  registerDefaultActions,
  registerLoadablesActions,
  unregisterLoadablesActions,
} from './registerDefaultActions';
import type { ActionContext } from './types';
import type { YjsStore } from '../store/YjsStore';

function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    store: {} as YjsStore,
    selection: {
      ids: [],
      yMaps: [],
      count: 0,
      hasStacks: false,
      hasTokens: false,
      hasCounters: false,
      hasMixed: false,
      allLocked: false,
      allUnlocked: true,
      canAct: true,
    },
    actorId: 'test',
    ...overrides,
  };
}

describe('registerDefaultActions / load actions', () => {
  beforeEach(() => {
    ActionRegistry.getInstance().clear();
    registerDefaultActions();
  });

  afterEach(() => {
    ActionRegistry.getInstance().clear();
  });

  it('removes the legacy load-scenario action', () => {
    expect(
      ActionRegistry.getInstance().getAction('load-scenario'),
    ).toBeUndefined();
  });

  it('removes the legacy load-marvelchampions-rhino action', () => {
    expect(
      ActionRegistry.getInstance().getAction('load-marvelchampions-rhino'),
    ).toBeUndefined();
  });

  it('registers the generic Load… action', () => {
    const action = ActionRegistry.getInstance().getAction('load');
    expect(action).toBeDefined();
    expect(action?.label).toBe('Load…');
  });

  it('Load… is unavailable without onOpenLoadPicker', () => {
    const action = ActionRegistry.getInstance().getAction('load');
    expect(action?.isAvailable(makeContext())).toBe(false);
  });

  it('Load… execute dispatches onOpenLoadPicker with no preset', () => {
    const action = ActionRegistry.getInstance().getAction('load');
    const onOpenLoadPicker = vi.fn();
    const ctx = makeContext({ onOpenLoadPicker });
    expect(action?.isAvailable(ctx)).toBe(true);
    void action?.execute(ctx);
    // Optional-chained call passes no arguments — `presetType` is undefined
    // by omission, which the picker treats as "two-step mode".
    expect(onOpenLoadPicker).toHaveBeenCalledTimes(1);
    expect(onOpenLoadPicker.mock.calls[0]).toEqual([]);
  });

  // ct-8vh: load-counter is no longer registered by registerDefaultActions
  // (the always-available built-in is gone). It comes from
  // registerLoadablesActions like every other per-type Load action — and the
  // counter loadable entry is guaranteed by the loadablesRegistry UI view's
  // synthetic Generic injection, so in real route flow it's always present.
  it('does NOT register load-counter from registerDefaultActions alone (ct-8vh)', () => {
    expect(
      ActionRegistry.getInstance().getAction('load-counter'),
    ).toBeUndefined();
  });
});

describe('registerLoadablesActions / per-type Load <X>… actions', () => {
  beforeEach(() => {
    ActionRegistry.getInstance().clear();
    registerDefaultActions();
  });

  afterEach(() => {
    ActionRegistry.getInstance().clear();
  });

  const loadables: LoadableEntry[] = [
    {
      type: 'scenario',
      label: 'Scenario',
      mode: 'replace',
      source: { kind: 'static', items: [] },
    },
    {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'static', items: [] },
    },
  ];

  it('registers id `load-<type>` per loadable entry', () => {
    registerLoadablesActions(loadables);
    expect(
      ActionRegistry.getInstance().getAction('load-scenario'),
    ).toBeDefined();
    expect(ActionRegistry.getInstance().getAction('load-card')).toBeDefined();
  });

  it('the per-type label is "Load <label>…"', () => {
    registerLoadablesActions(loadables);
    const a = ActionRegistry.getInstance().getAction('load-scenario');
    expect(a?.label).toBe('Load Scenario…');
  });

  it('execute calls onOpenLoadPicker with the entry type as preset', () => {
    registerLoadablesActions(loadables);
    const action = ActionRegistry.getInstance().getAction('load-card');
    const onOpenLoadPicker = vi.fn();
    const ctx = makeContext({ onOpenLoadPicker });
    void action?.execute(ctx);
    expect(onOpenLoadPicker).toHaveBeenCalledWith('card');
  });

  it('unregisterLoadablesActions strips per-type entries but leaves builtins', () => {
    registerLoadablesActions(loadables);
    unregisterLoadablesActions();
    expect(
      ActionRegistry.getInstance().getAction('load-scenario'),
    ).toBeUndefined();
    expect(ActionRegistry.getInstance().getAction('load-card')).toBeUndefined();
    // The generic Load… action stays.
    expect(ActionRegistry.getInstance().getAction('load')).toBeDefined();
  });

  it('does not register the legacy load-components action (ct-qbn)', () => {
    expect(
      ActionRegistry.getInstance().getAction('load-components'),
    ).toBeUndefined();
  });

  // Course-correction on ct-73z (ct-8vh): the `Load Counter…` action is no
  // longer registered unconditionally by registerDefaultActions; it lives in
  // registerLoadablesActions like every other per-type Load action. The
  // counter entry is always present in the loadables view (via the
  // loadablesRegistry's synthetic Generic injection), so `load-counter` is
  // still always registered in practice — but through the regular per-type
  // path, routing through the picker (Generic + plugin-declared typed
  // counters), not a direct generic-spawn.
  it('registers load-counter when a counter LoadableEntry is supplied', () => {
    const withCounter: LoadableEntry[] = [
      ...loadables,
      {
        type: 'counter',
        label: 'Counter',
        mode: 'additive',
        source: { kind: 'static', items: [] },
      },
    ];
    registerLoadablesActions(withCounter);
    const action = ActionRegistry.getInstance().getAction('load-counter');
    expect(action).toBeDefined();
    expect(action?.label).toBe('Load Counter…');
  });

  it('load-counter routes through onOpenLoadPicker("counter"), not a direct spawn', () => {
    const withCounter: LoadableEntry[] = [
      ...loadables,
      {
        type: 'counter',
        label: 'Counter',
        mode: 'additive',
        source: { kind: 'static', items: [] },
      },
    ];
    registerLoadablesActions(withCounter);
    const action = ActionRegistry.getInstance().getAction('load-counter');
    const onOpenLoadPicker = vi.fn();
    const ctx = makeContext({ onOpenLoadPicker });
    expect(action?.isAvailable(ctx)).toBe(true);
    void action?.execute(ctx);
    expect(onOpenLoadPicker).toHaveBeenCalledWith('counter');
  });

  it('load-counter is removed by unregisterLoadablesActions (dynamic, not built-in)', () => {
    const withCounter: LoadableEntry[] = [
      ...loadables,
      {
        type: 'counter',
        label: 'Counter',
        mode: 'additive',
        source: { kind: 'static', items: [] },
      },
    ];
    registerLoadablesActions(withCounter);
    unregisterLoadablesActions();
    expect(
      ActionRegistry.getInstance().getAction('load-counter'),
    ).toBeUndefined();
  });
});

describe('Counter increment/decrement actions (ct-d2p)', () => {
  beforeEach(() => {
    ActionRegistry.getInstance().clear();
    registerDefaultActions();
  });

  afterEach(() => {
    ActionRegistry.getInstance().clear();
  });

  function counterContext(
    overrides: Partial<ActionContext> = {},
  ): ActionContext {
    return makeContext({
      selection: {
        ids: ['counter-1'],
        yMaps: [],
        count: 1,
        hasStacks: false,
        hasTokens: false,
        hasCounters: true,
        hasMixed: false,
        allLocked: false,
        allUnlocked: true,
        canAct: true,
      },
      ...overrides,
    });
  }

  it('registers a counter-increment action bound to the "=" key (the unshifted form of "+")', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(action).toBeDefined();
    expect(action?.shortcut).toBe('=');
  });

  it('registers a counter-decrement action bound to "-"', () => {
    const action = ActionRegistry.getInstance().getAction('counter-decrement');
    expect(action).toBeDefined();
    expect(action?.shortcut).toBe('-');
  });

  it('increment is available when exactly one Counter is selected', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(action?.isAvailable(counterContext())).toBe(true);
  });

  it('increment is NOT available when selection is empty', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(action?.isAvailable(makeContext())).toBe(false);
  });

  it('increment is NOT available when selection contains 2+ counters', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(
      action?.isAvailable(
        counterContext({
          selection: {
            ids: ['counter-1', 'counter-2'],
            yMaps: [],
            count: 2,
            hasStacks: false,
            hasTokens: false,
            hasCounters: true,
            hasMixed: false,
            allLocked: false,
            allUnlocked: true,
            canAct: true,
          },
        }),
      ),
    ).toBe(false);
  });

  it('increment is NOT available for mixed selections', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(
      action?.isAvailable(
        counterContext({
          selection: {
            ids: ['counter-1', 'stack-1'],
            yMaps: [],
            count: 2,
            hasStacks: true,
            hasTokens: false,
            hasCounters: true,
            hasMixed: true,
            allLocked: false,
            allUnlocked: true,
            canAct: true,
          },
        }),
      ),
    ).toBe(false);
  });

  it('increment is NOT available when the sole selected object is not a counter', () => {
    const action = ActionRegistry.getInstance().getAction('counter-increment');
    expect(
      action?.isAvailable(
        counterContext({
          selection: {
            ids: ['stack-1'],
            yMaps: [],
            count: 1,
            hasStacks: true,
            hasTokens: false,
            hasCounters: false,
            hasMixed: false,
            allLocked: false,
            allUnlocked: true,
            canAct: true,
          },
        }),
      ),
    ).toBe(false);
  });
});
