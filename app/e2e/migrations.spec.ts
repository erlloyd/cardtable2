import { test, expect } from '@playwright/test';
import { ObjectKind } from '@cardtable2/shared';

// Define minimal store interface for type safety in page.evaluate()
interface TestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, unknown>;
  getObject: (id: string) => unknown;
  clearAllObjects: () => void;
}

test.describe('Migrations (M3.5-T1)', () => {
  test('should migrate old tokens to add missing _faceUp property', async ({
    page,
  }, testInfo) => {
    // Navigate to table page with unique ID
    const tableId = `mig-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Create an old-style token WITHOUT _faceUp (simulates old table)
    await page.evaluate(
      ({ tokenKind }) => {
        declare const __TEST_STORE__: TestStore;

        if (!__TEST_STORE__) {
          throw new Error('Store not found - this is a test-only API');
        }

        // Add a token object WITHOUT _faceUp (simulates pre-migration table)
        __TEST_STORE__.setObject('old-token-1', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 50, y: 75, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: { color: 'red' },
          // NOTE: No _faceUp property - simulates old table schema
        });
      },
      { tokenKind: ObjectKind.Token },
    );

    // Wait for Yjs to persist to IndexedDB
    await page.waitForTimeout(500);

    // Verify object was created
    await expect(page.getByText(/Objects: 1/)).toBeVisible();

    // Reload the page to trigger migration
    await page.reload();

    // Wait for the board to load again
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready (migration runs during initialization)
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify object still exists after reload
    await expect(page.getByText(/Objects: 1/)).toBeVisible({
      timeout: 5000,
    });

    // Verify the migration added _faceUp property
    const tokenAfterMigration = await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (!__TEST_STORE__) {
        throw new Error('Store not found after reload');
      }
      return __TEST_STORE__.getObject('old-token-1');
    });

    expect(tokenAfterMigration).toHaveProperty('_faceUp', true);

    // Clean up
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });
  });

  test('should migrate old stacks to add missing _faceUp and _cards', async ({
    page,
  }, testInfo) => {
    // Navigate to table page with unique ID
    const tableId = `mig-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Create an old-style stack WITHOUT _faceUp and _cards
    await page.evaluate(
      ({ stackKind }) => {
        declare const __TEST_STORE__: TestStore;

        if (!__TEST_STORE__) {
          throw new Error('Store not found');
        }

        // Add a stack object WITHOUT _faceUp and _cards (simulates old table schema)
        __TEST_STORE__.setObject('old-stack-1', {
          _kind: stackKind,
          _containerId: 'table',
          _pos: { x: 100, y: 200, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          // NOTE: No _faceUp or _cards - simulates old table schema
        });
      },
      { stackKind: ObjectKind.Stack },
    );

    // Wait for Yjs to persist
    await page.waitForTimeout(500);

    // Verify object was created
    await expect(page.getByText(/Objects: 1/)).toBeVisible();

    // Reload to trigger migration
    await page.reload();
    await page.waitForSelector('[data-testid="board"]');
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify object still exists
    await expect(page.getByText(/Objects: 1/)).toBeVisible({
      timeout: 5000,
    });

    // Verify the migration added both _faceUp and _cards
    const stackAfterMigration = await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (!__TEST_STORE__) {
        throw new Error('Store not found');
      }
      return __TEST_STORE__.getObject('old-stack-1');
    });

    expect(stackAfterMigration).toHaveProperty('_faceUp', true);
    expect(stackAfterMigration).toHaveProperty('_cards');
    expect(
      Array.isArray((stackAfterMigration as { _cards: unknown[] })._cards),
    ).toBe(true);

    // Clean up
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });
  });

  test('should preserve existing _faceUp values during migration', async ({
    page,
  }, testInfo) => {
    // Navigate to table page with unique ID
    const tableId = `mig-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Create a token WITH _faceUp set to false (should not be changed)
    await page.evaluate(
      ({ tokenKind }) => {
        declare const __TEST_STORE__: TestStore;

        if (!__TEST_STORE__) {
          throw new Error('Store not found');
        }

        // Token with explicit _faceUp: false
        __TEST_STORE__.setObject('token-with-faceup', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 50, y: 75, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          _faceUp: false, // Explicitly set to false
        });
      },
      { tokenKind: ObjectKind.Token },
    );

    // Wait for Yjs to persist
    await page.waitForTimeout(500);

    // Reload to trigger migration
    await page.reload();
    await page.waitForSelector('[data-testid="board"]');
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify _faceUp was NOT changed (should still be false)
    const tokenAfterMigration = await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (!__TEST_STORE__) {
        throw new Error('Store not found');
      }
      return __TEST_STORE__.getObject('token-with-faceup');
    });

    expect(tokenAfterMigration).toHaveProperty('_faceUp', false);

    // Clean up
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });
  });

  test("should handle mixed scenarios (some need migration, some don't)", async ({
    page,
  }, testInfo) => {
    // Navigate to table page with unique ID
    const tableId = `mig-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Create multiple objects with different migration needs
    await page.evaluate(
      ({ tokenKind, stackKind }) => {
        declare const __TEST_STORE__: TestStore;

        if (!__TEST_STORE__) {
          throw new Error('Store not found');
        }

        // Old token (missing _faceUp)
        __TEST_STORE__.setObject('old-token', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 0, y: 0, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
        });

        // New token (has _faceUp)
        __TEST_STORE__.setObject('new-token', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 100, y: 0, r: 0 },
          _sortKey: '2.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          _faceUp: true,
        });

        // Old stack (missing _faceUp and _cards)
        __TEST_STORE__.setObject('old-stack', {
          _kind: stackKind,
          _containerId: 'table',
          _pos: { x: 0, y: 100, r: 0 },
          _sortKey: '3.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
        });

        // New stack (has _faceUp and _cards)
        __TEST_STORE__.setObject('new-stack', {
          _kind: stackKind,
          _containerId: 'table',
          _pos: { x: 100, y: 100, r: 0 },
          _sortKey: '4.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          _faceUp: false,
          _cards: ['card1'],
        });
      },
      { tokenKind: ObjectKind.Token, stackKind: ObjectKind.Stack },
    );

    // Wait for Yjs to persist
    await page.waitForTimeout(500);

    // Verify all objects were created
    await expect(page.getByText(/Objects: 4/)).toBeVisible();

    // Reload to trigger migration
    await page.reload();
    await page.waitForSelector('[data-testid="board"]');
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify all objects still exist
    await expect(page.getByText(/Objects: 4/)).toBeVisible({
      timeout: 5000,
    });

    // Verify migration results
    const objects = await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (!__TEST_STORE__) {
        throw new Error('Store not found');
      }
      return {
        oldToken: __TEST_STORE__.getObject('old-token'),
        newToken: __TEST_STORE__.getObject('new-token'),
        oldStack: __TEST_STORE__.getObject('old-stack'),
        newStack: __TEST_STORE__.getObject('new-stack'),
      };
    });

    // Old objects should have been migrated
    expect(objects.oldToken).toHaveProperty('_faceUp', true);
    expect(objects.oldStack).toHaveProperty('_faceUp', true);
    expect(objects.oldStack).toHaveProperty('_cards');

    // New objects should be unchanged
    expect(objects.newToken).toHaveProperty('_faceUp', true);
    expect(objects.newStack).toHaveProperty('_faceUp', false);
    expect((objects.newStack as { _cards: string[] })._cards).toEqual([
      'card1',
    ]);

    // Clean up
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });
  });
});
