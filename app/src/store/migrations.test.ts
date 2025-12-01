import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { ObjectKind } from '@cardtable2/shared';
import { runMigrations } from './migrations';

describe('migrations', () => {
  beforeEach(() => {
    // Clear console spies
    vi.clearAllMocks();
  });

  describe('runMigrations', () => {
    it('should add missing _faceUp to existing Tokens', () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Create a token without _faceUp (simulates old table)
      const tokenMap = new Y.Map();
      tokenMap.set('_kind', ObjectKind.Token);
      tokenMap.set('_pos', { x: 100, y: 200, r: 0 });
      tokenMap.set('_sortKey', 'a0');
      tokenMap.set('_locked', false);
      tokenMap.set('_selectedBy', null);
      tokenMap.set('_containerId', null);
      tokenMap.set('_meta', {});

      objectsMap.set('token-1', tokenMap);

      // Run migrations
      runMigrations(doc);

      // Verify _faceUp was added
      const migratedToken = objectsMap.get('token-1') as Y.Map<unknown>;
      expect(migratedToken.get('_faceUp')).toBe(true);
    });

    it('should add missing _faceUp and _cards to existing Stacks', () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Create a stack without _faceUp and _cards (simulates old table)
      const stackMap = new Y.Map();
      stackMap.set('_kind', ObjectKind.Stack);
      stackMap.set('_pos', { x: 100, y: 200, r: 0 });
      stackMap.set('_sortKey', 'a0');
      stackMap.set('_locked', false);
      stackMap.set('_selectedBy', null);
      stackMap.set('_containerId', null);
      stackMap.set('_meta', {});

      objectsMap.set('stack-1', stackMap);

      // Run migrations
      runMigrations(doc);

      // Verify _faceUp and _cards were added
      const migratedStack = objectsMap.get('stack-1') as Y.Map<unknown>;
      expect(migratedStack.get('_faceUp')).toBe(true);
      expect(migratedStack.get('_cards')).toEqual([]);
    });

    it('should not modify objects that already have all required properties', () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Create a token with _faceUp already present
      const tokenMap = new Y.Map();
      tokenMap.set('_kind', ObjectKind.Token);
      tokenMap.set('_pos', { x: 100, y: 200, r: 0 });
      tokenMap.set('_sortKey', 'a0');
      tokenMap.set('_locked', false);
      tokenMap.set('_selectedBy', null);
      tokenMap.set('_containerId', null);
      tokenMap.set('_meta', {});
      tokenMap.set('_faceUp', false); // Already present with custom value

      objectsMap.set('token-1', tokenMap);

      // Run migrations
      runMigrations(doc);

      // Verify _faceUp was not changed
      const migratedToken = objectsMap.get('token-1') as Y.Map<unknown>;
      expect(migratedToken.get('_faceUp')).toBe(false); // Should keep original value
    });

    it("should handle mixed scenarios (some objects need migration, some don't)", () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Old token (missing _faceUp)
      const oldToken = new Y.Map();
      oldToken.set('_kind', ObjectKind.Token);
      oldToken.set('_pos', { x: 0, y: 0, r: 0 });
      objectsMap.set('old-token', oldToken);

      // New token (has _faceUp)
      const newToken = new Y.Map();
      newToken.set('_kind', ObjectKind.Token);
      newToken.set('_pos', { x: 100, y: 100, r: 0 });
      newToken.set('_faceUp', true);
      objectsMap.set('new-token', newToken);

      // Old stack (missing _faceUp and _cards)
      const oldStack = new Y.Map();
      oldStack.set('_kind', ObjectKind.Stack);
      oldStack.set('_pos', { x: 200, y: 200, r: 0 });
      objectsMap.set('old-stack', oldStack);

      // Zone (no additional properties needed)
      const zone = new Y.Map();
      zone.set('_kind', ObjectKind.Zone);
      zone.set('_pos', { x: 300, y: 300, r: 0 });
      objectsMap.set('zone-1', zone);

      // Run migrations
      runMigrations(doc);

      // Verify old objects were migrated
      const migratedOldToken = objectsMap.get('old-token') as Y.Map<unknown>;
      expect(migratedOldToken.get('_faceUp')).toBe(true);

      const migratedOldStack = objectsMap.get('old-stack') as Y.Map<unknown>;
      expect(migratedOldStack.get('_faceUp')).toBe(true);
      expect(migratedOldStack.get('_cards')).toEqual([]);

      // Verify new objects were not changed
      const unchangedNewToken = objectsMap.get('new-token') as Y.Map<unknown>;
      expect(unchangedNewToken.get('_faceUp')).toBe(true);

      // Verify zone was not changed (no additional properties)
      const unchangedZone = objectsMap.get('zone-1') as Y.Map<unknown>;
      expect(unchangedZone.has('_faceUp')).toBe(false);
    });

    it('should be idempotent (safe to run multiple times)', () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Create a token without _faceUp
      const tokenMap = new Y.Map();
      tokenMap.set('_kind', ObjectKind.Token);
      tokenMap.set('_pos', { x: 100, y: 200, r: 0 });
      objectsMap.set('token-1', tokenMap);

      // Run migrations twice
      runMigrations(doc);
      runMigrations(doc);

      // Verify _faceUp is still correct after second run
      const token = objectsMap.get('token-1') as Y.Map<unknown>;
      expect(token.get('_faceUp')).toBe(true);
    });

    it('should handle empty objects map', () => {
      const doc = new Y.Doc();

      // Run migrations on empty doc
      expect(() => runMigrations(doc)).not.toThrow();
    });

    it('should use transaction for atomicity', () => {
      const doc = new Y.Doc();
      const objectsMap = doc.getMap('objects');

      // Spy on doc.transact
      const transactSpy = vi.spyOn(doc, 'transact');

      // Create objects that need migration
      const tokenMap = new Y.Map();
      tokenMap.set('_kind', ObjectKind.Token);
      tokenMap.set('_pos', { x: 100, y: 200, r: 0 });
      objectsMap.set('token-1', tokenMap);

      const stackMap = new Y.Map();
      stackMap.set('_kind', ObjectKind.Stack);
      stackMap.set('_pos', { x: 200, y: 300, r: 0 });
      objectsMap.set('stack-1', stackMap);

      // Run migrations
      runMigrations(doc);

      // Verify transact was called
      expect(transactSpy).toHaveBeenCalled();

      // Verify transaction origin is 'migration'
      const transactCall = transactSpy.mock.calls[0];
      expect(transactCall[1]).toBe('migration');
    });
  });
});
