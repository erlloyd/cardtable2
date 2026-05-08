/**
 * Action-registration smoke tests for ct-8gf.5.
 *
 * Two things this file pins down:
 *  1. The hardcoded `load-scenario` and `load-marvelchampions-rhino` actions
 *     are gone — `getAction()` returns `undefined` for both ids.
 *  2. The new generic `load` action and the dynamic `load-<type>` actions
 *     produced by {@link registerLoadablesActions} are present and route
 *     selection through the new `onOpenLoadPicker` callback.
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
});
