import { test, expect } from '@playwright/test';
import { ObjectKind } from '@cardtable2/shared';

// Define minimal store interface for type safety in page.evaluate()
interface TestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, unknown>;
  clearAllObjects: () => void;
}

test.describe('State Persistence (M3-T1)', () => {
  test('should initialize YjsStore and show ready status', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready (look for "Store: ✓ Ready" text)
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify initial object count is shown
    await expect(page.getByText(/Objects: 0/)).toBeVisible();
  });

  test('should persist objects across page reload', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify initial state has no objects
    await expect(page.getByText(/Objects: 0/)).toBeVisible();

    // Add test objects directly to the store via browser console
    // This simulates what will happen when the user interacts with the UI in M3-T2
    await page.evaluate(
      ({ stackKind, tokenKind }) => {
        // Declare the global test store for TypeScript (exists in browser via window)
        declare const __TEST_STORE__: TestStore;

        if (!__TEST_STORE__) {
          throw new Error('Store not found - this is a test-only API');
        }

        // Add a stack object
        __TEST_STORE__.setObject('test-stack-1', {
          _kind: stackKind,
          _containerId: 'table',
          _pos: { x: 100, y: 200, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          _cards: ['card-1', 'card-2'],
          _faceUp: true,
        });

        // Add a token object
        __TEST_STORE__.setObject('test-token-1', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 50, y: 75, r: 0 },
          _sortKey: '2.0',
          _locked: false,
          _selectedBy: null,
          _meta: { color: 'red' },
        });
      },
      { stackKind: ObjectKind.Stack, tokenKind: ObjectKind.Token },
    );

    // Wait a bit for Yjs to persist to IndexedDB
    await page.waitForTimeout(500);

    // Verify the object count updated
    await expect(page.getByText(/Objects: 2/)).toBeVisible();

    // Reload the page to test persistence
    await page.reload();

    // Wait for the board to load again
    await page.waitForSelector('[data-testid="board"]');

    // Wait for YjsStore to be ready after reload
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Verify objects persisted after reload
    await expect(page.getByText(/Objects: 2/)).toBeVisible({
      timeout: 5000,
    });

    // Verify we can still access the objects via the store
    const objectIds = await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (!__TEST_STORE__) {
        throw new Error('Store not found after reload');
      }
      const allObjects = __TEST_STORE__.getAllObjects();
      return Array.from(allObjects.keys());
    });

    expect(objectIds).toContain('test-stack-1');
    expect(objectIds).toContain('test-token-1');

    // Clean up - clear all objects for the next test
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });

    // Verify cleanup worked
    await page.waitForTimeout(200);
    await expect(page.getByText(/Objects: 0/)).toBeVisible();
  });

  test('should handle multiple tables with separate IndexedDB databases', async ({
    page,
  }) => {
    // Navigate to first table
    await page.goto('/');
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Get first table ID
    const url1 = page.url();
    const tableId1Match = url1.match(/\/table\/([a-z]+-[a-z]+-[a-z]+)/);
    const tableId1 = tableId1Match![1];

    // Wait for store ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Add object to first table
    await page.evaluate(
      ({ tokenKind }) => {
        declare const __TEST_STORE__: TestStore;
        if (!__TEST_STORE__) {
          throw new Error('Store not found');
        }
        __TEST_STORE__.setObject('table1-object', {
          _kind: tokenKind,
          _containerId: 'table',
          _pos: { x: 10, y: 10, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
        });
      },
      { tokenKind: ObjectKind.Token },
    );

    await page.waitForTimeout(500);
    await expect(page.getByText(/Objects: 1/)).toBeVisible();

    // Navigate to home (cleanup old store)
    await page.goto('/');

    // Open a new table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Get second table ID (should be different)
    const url2 = page.url();
    const tableId2Match = url2.match(/\/table\/([a-z]+-[a-z]+-[a-z]+)/);
    const tableId2 = tableId2Match![1];
    expect(tableId2).not.toBe(tableId1);

    // Wait for second store ready
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // Second table should start with 0 objects (different IndexedDB)
    await expect(page.getByText(/Objects: 0/)).toBeVisible();

    // Navigate back to first table
    await page.goto(`/table/${tableId1}`);
    await page.waitForSelector('[data-testid="board"]');
    await expect(page.getByText(/Store:.*✓ Ready/)).toBeVisible({
      timeout: 5000,
    });

    // First table should still have its object
    await expect(page.getByText(/Objects: 1/)).toBeVisible();

    // Clean up both tables
    await page.evaluate(() => {
      declare const __TEST_STORE__: TestStore;
      if (__TEST_STORE__) {
        __TEST_STORE__.clearAllObjects();
      }
    });
  });
});
