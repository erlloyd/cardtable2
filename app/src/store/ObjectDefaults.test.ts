import { describe, it, expect } from 'vitest';
import { ObjectKind } from '@cardtable2/shared';
import {
  getDefaultMeta,
  getDefaultProperties,
  hasAllRequiredProperties,
} from './ObjectDefaults';
import {
  COUNTER_DEFAULT_COLOR,
  COUNTER_DEFAULT_MAX,
  COUNTER_DEFAULT_MIN,
  COUNTER_DEFAULT_STARTING_VALUE,
  COUNTER_TYPE_GENERIC,
} from '../renderer/objects/counter/constants';

describe('ObjectDefaults', () => {
  describe('getDefaultProperties', () => {
    it('should return _faceUp and _cards for Stack', () => {
      const defaults = getDefaultProperties(ObjectKind.Stack);

      expect(defaults).toEqual({
        _faceUp: true,
        _cards: [],
      });
    });

    it('should return _faceUp for Token', () => {
      const defaults = getDefaultProperties(ObjectKind.Token);

      expect(defaults).toEqual({
        _faceUp: true,
      });
    });

    it('should return empty object for Zone', () => {
      const defaults = getDefaultProperties(ObjectKind.Zone);

      expect(defaults).toEqual({});
    });

    it('should return empty object for Mat', () => {
      const defaults = getDefaultProperties(ObjectKind.Mat);

      expect(defaults).toEqual({});
    });

    it('should return empty object for Counter', () => {
      const defaults = getDefaultProperties(ObjectKind.Counter);

      expect(defaults).toEqual({});
    });
  });

  describe('hasAllRequiredProperties', () => {
    it('should return true for Stack with all required properties', () => {
      const obj = {
        _kind: ObjectKind.Stack,
        _faceUp: true,
        _cards: ['card1', 'card2'],
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(true);
    });

    it('should return false for Stack missing _faceUp', () => {
      const obj = {
        _kind: ObjectKind.Stack,
        _cards: ['card1', 'card2'],
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(false);
    });

    it('should return false for Stack missing _cards', () => {
      const obj = {
        _kind: ObjectKind.Stack,
        _faceUp: true,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(false);
    });

    it('should return true for Token with all required properties', () => {
      const obj = {
        _kind: ObjectKind.Token,
        _faceUp: true,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(true);
    });

    it('should return false for Token missing _faceUp', () => {
      const obj = {
        _kind: ObjectKind.Token,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(false);
    });

    it('should return true for Zone (no additional required properties)', () => {
      const obj = {
        _kind: ObjectKind.Zone,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(true);
    });

    it('should return true for Mat (no additional required properties)', () => {
      const obj = {
        _kind: ObjectKind.Mat,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(true);
    });

    it('should return true for Counter (no additional required properties)', () => {
      const obj = {
        _kind: ObjectKind.Counter,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: 'a0',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
      };

      expect(hasAllRequiredProperties(obj)).toBe(true);
    });
  });

  describe('getDefaultMeta', () => {
    it('should return an empty object for Stack, Token, Zone, Mat', () => {
      expect(getDefaultMeta(ObjectKind.Stack)).toEqual({});
      expect(getDefaultMeta(ObjectKind.Token)).toEqual({});
      expect(getDefaultMeta(ObjectKind.Zone)).toEqual({});
      expect(getDefaultMeta(ObjectKind.Mat)).toEqual({});
    });

    it('should return the full generic CounterMeta for Counter', () => {
      const meta = getDefaultMeta(ObjectKind.Counter);

      expect(meta).toEqual({
        type: COUNTER_TYPE_GENERIC,
        typeId: COUNTER_TYPE_GENERIC,
        color: COUNTER_DEFAULT_COLOR,
        min: COUNTER_DEFAULT_MIN,
        max: COUNTER_DEFAULT_MAX,
        startingValue: COUNTER_DEFAULT_STARTING_VALUE,
        currentValue: COUNTER_DEFAULT_STARTING_VALUE,
      });
    });

    it('Counter default meta should not include optional text or img', () => {
      const meta = getDefaultMeta(ObjectKind.Counter);
      expect(meta).not.toHaveProperty('text');
      expect(meta).not.toHaveProperty('img');
    });
  });
});
