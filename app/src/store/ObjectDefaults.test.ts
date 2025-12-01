import { describe, it, expect } from 'vitest';
import { ObjectKind } from '@cardtable2/shared';
import {
  getDefaultProperties,
  hasAllRequiredProperties,
} from './ObjectDefaults';

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
});
