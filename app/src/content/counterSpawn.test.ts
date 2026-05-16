import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  COUNTER_LOADABLE_TYPE,
  ObjectKind,
  type CounterTypeDef,
  type LoadableEntry,
} from '@cardtable2/shared';
import {
  instantiateCounterSpawn,
  instantiateCounterSpawns,
} from './counterSpawn';
import type { CounterMeta } from '../renderer/objects/counter/types';

const validDef: CounterTypeDef = {
  color: 0xf39c12,
  text: 'DMG',
  min: 0,
  max: 99,
  startingValue: 0,
};

function counterEntry(
  items: Array<{ typeId: string; label: string; data: unknown }>,
): LoadableEntry<unknown> {
  return {
    type: COUNTER_LOADABLE_TYPE,
    label: 'Counter',
    mode: 'additive',
    source: { kind: 'static', items },
  };
}

function getMeta(obj: ReturnType<typeof instantiateCounterSpawn>): CounterMeta {
  if (!obj) throw new Error('expected non-null counter object');
  return obj._meta as CounterMeta;
}

describe('instantiateCounterSpawn', () => {
  it('materialises a counter from a resolved type def with initialValue override', () => {
    const entries = [
      counterEntry([{ typeId: 'damage', label: 'Damage', data: validDef }]),
    ];

    const obj = instantiateCounterSpawn(
      { typeId: 'damage', position: { x: 10, y: 20 }, initialValue: 7 },
      0,
      'scenario-id',
      entries,
    );

    expect(obj).not.toBeNull();
    expect(obj?._kind).toBe(ObjectKind.Counter);
    expect(obj?._pos).toEqual({ x: 10, y: 20, r: 0 });

    const meta = getMeta(obj);
    expect(meta.type).toBe('damage');
    expect(meta.typeId).toBe('damage');
    expect(meta.color).toBe(validDef.color);
    expect(meta.min).toBe(validDef.min);
    expect(meta.max).toBe(validDef.max);
    expect(meta.startingValue).toBe(validDef.startingValue);
    // initialValue overrides currentValue, but startingValue stays the template's.
    expect(meta.currentValue).toBe(7);
    expect(meta.text).toBe('DMG');
  });

  it('uses the type def startingValue when initialValue is omitted', () => {
    const entries = [
      counterEntry([
        {
          typeId: 'threat',
          label: 'Threat',
          data: { color: 0x3498db, min: 0, max: 20, startingValue: 3 },
        },
      ]),
    ];

    const obj = instantiateCounterSpawn(
      { typeId: 'threat' },
      0,
      'scenario-id',
      entries,
    );

    const meta = getMeta(obj);
    expect(meta.startingValue).toBe(3);
    expect(meta.currentValue).toBe(3);
  });

  it('applies the default cascade position when position is omitted', () => {
    const entries = [
      counterEntry([{ typeId: 'damage', label: 'Damage', data: validDef }]),
    ];

    const objAtZero = instantiateCounterSpawn(
      { typeId: 'damage' },
      0,
      'scenario-id',
      entries,
    );
    const objAtOne = instantiateCounterSpawn(
      { typeId: 'damage' },
      1,
      'scenario-id',
      entries,
    );

    expect(objAtZero?._pos.x).toBe(0);
    expect(objAtZero?._pos.y).toBe(0);
    // Index 1 lands a pill-width + gap to the right of index 0.
    expect(objAtOne?._pos.x).toBeGreaterThan(0);
    expect(objAtOne?._pos.y).toBe(0);
  });

  it('drops a spawn whose typeId is not registered and logs an error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const entries = [
      counterEntry([{ typeId: 'damage', label: 'Damage', data: validDef }]),
    ];

    const obj = instantiateCounterSpawn(
      { typeId: 'unknown-type' },
      0,
      'my-scenario',
      entries,
    );

    expect(obj).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('my-scenario'),
      expect.objectContaining({ typeId: 'unknown-type' }),
    );

    errorSpy.mockRestore();
  });

  it('drops a spawn whose type definition fails validation and logs an error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const entries = [
      counterEntry([
        // Malformed: color is a string. getCounterTypeDef throws on the
        // matched id; the spawn helper catches and skips.
        { typeId: 'bad', label: 'Bad', data: { color: 'red' } },
      ]),
    ];

    const obj = instantiateCounterSpawn(
      { typeId: 'bad' },
      0,
      'my-scenario',
      entries,
    );

    expect(obj).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('malformed'),
      expect.objectContaining({ typeId: 'bad' }),
    );

    errorSpy.mockRestore();
  });

  it('passes through optional text and img fields from the type def', () => {
    const entries = [
      counterEntry([
        {
          typeId: 'shield',
          label: 'Shield',
          data: {
            color: 0,
            text: 'SHD',
            img: 'shield.png',
            min: 0,
            max: 10,
            startingValue: 0,
          },
        },
      ]),
    ];

    const obj = instantiateCounterSpawn(
      { typeId: 'shield' },
      0,
      'scenario-id',
      entries,
    );
    const meta = getMeta(obj);
    expect(meta.text).toBe('SHD');
    expect(meta.img).toBe('shield.png');
  });
});

describe('instantiateCounterSpawns', () => {
  beforeEach(() => {
    // Reset console spies between tests.
  });

  it('returns an empty map when spawns is undefined', () => {
    expect(instantiateCounterSpawns(undefined, 'scenario-id').size).toBe(0);
  });

  it('returns an empty map when spawns is empty', () => {
    expect(instantiateCounterSpawns([], 'scenario-id').size).toBe(0);
  });

  it('materialises every well-formed spawn with unique ids', () => {
    const entries = [
      counterEntry([
        { typeId: 'damage', label: 'Damage', data: validDef },
        {
          typeId: 'threat',
          label: 'Threat',
          data: { color: 0x3498db, min: 0, max: 20, startingValue: 1 },
        },
      ]),
    ];

    const out = instantiateCounterSpawns(
      [{ typeId: 'damage', initialValue: 4 }, { typeId: 'threat' }],
      'scenario-id',
      entries,
    );

    expect(out.size).toBe(2);
    const ids = Array.from(out.keys());
    expect(new Set(ids).size).toBe(2);

    const objs = Array.from(out.values());
    const metas = objs.map((o) => o._meta as CounterMeta);
    const byTypeId = Object.fromEntries(metas.map((m) => [m.typeId, m]));
    expect(byTypeId['damage'].currentValue).toBe(4);
    expect(byTypeId['threat'].currentValue).toBe(1);
  });

  it('continues past an unknown typeId, materialising the remaining spawns', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const entries = [
      counterEntry([{ typeId: 'damage', label: 'Damage', data: validDef }]),
    ];

    const out = instantiateCounterSpawns(
      [{ typeId: 'unknown' }, { typeId: 'damage' }, { typeId: 'also-unknown' }],
      'my-scenario',
      entries,
    );

    expect(out.size).toBe(1);
    const [only] = Array.from(out.values());
    expect((only._meta as CounterMeta).typeId).toBe('damage');
    // Two unknown typeIds produce two error logs.
    expect(errorSpy).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  it('includes the scenario context string in error logs', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    instantiateCounterSpawns([{ typeId: 'nope' }], 'my-cool-scenario', [
      counterEntry([]),
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('my-cool-scenario'),
      expect.any(Object),
    );

    errorSpy.mockRestore();
  });
});
