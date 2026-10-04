/**
 * E2E tests for ct-ajw.48: YjsStore lifecycle (constructor is side-effect
 * free; useTableStore connects in an effect and disconnects on cleanup).
 *
 * (1) A StrictMode dev load must not leave behind a discarded store whose
 *     5s IndexedDB timer fires or whose socket is closed while CONNECTING.
 * (2) Client-side navigation between tables remounts the route (remountDeps)
 *     so each table gets its own store, and returning restores the first
 *     table's state.
 */

import type { Page } from '@playwright/test';
import { ObjectKind } from '@cardtable2/shared';
import { test, expect } from './_fixtures';

interface LifecycleTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, unknown>;
  waitForReady: () => Promise<void>;
}

interface LifecycleGlobals {
  __TEST_STORE__?: LifecycleTestStore;
}

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('board-canvas')).toHaveAttribute(
    'data-canvas-initialized',
    'true',
    { timeout: 15_000 },
  );
}

/**
 * Load a table under StrictMode and collect console output until 6s after
 * navigation, past the 5s IndexedDB sync-timeout of a leaked store.
 */
async function loadAndCollectConsole(
  page: Page,
  tableId: string,
): Promise<string[]> {
  const messages: string[] = [];
  page.on('console', (msg) => messages.push(msg.text()));

  const start = Date.now();
  await page.goto(`/table/${tableId}`);
  await waitForCanvas(page);

  const remaining = 6000 - (Date.now() - start);
  if (remaining > 0) await page.waitForTimeout(remaining);
  return messages;
}

test.describe('YjsStore lifecycle', () => {
  test('StrictMode load emits no IndexedDB sync-timeout warning', async ({
    page,
  }, testInfo) => {
    const messages = await loadAndCollectConsole(
      page,
      `lifecycle-${testInfo.testId}`,
    );
    expect(messages.filter((m) => /IndexedDB sync timeout/.test(m))).toEqual(
      [],
    );
  });

  // Pending ct-ajw.48 Q1: the provider currently opens together with
  // IndexedDB, so the discarded StrictMode connection closes a CONNECTING
  // socket. Enable once the provider opens only after IndexedDB has synced.
  test.fixme('StrictMode load emits no premature WebSocket close', async ({
    page,
  }, testInfo) => {
    const messages = await loadAndCollectConsole(
      page,
      `lifecycle-ws-${testInfo.testId}`,
    );
    expect(
      messages.filter((m) =>
        /closed before the connection is established/.test(m),
      ),
    ).toEqual([]);
  });

  test('switching tables keeps stores separate and restores state on return', async ({
    page,
  }, testInfo) => {
    const tableA = `lifecycle-a-${testInfo.testId}`;
    const tableB = `lifecycle-b-${testInfo.testId}`;

    await page.goto(`/table/${tableA}`);
    await waitForCanvas(page);

    await page.evaluate(
      ({ stackKind }) => {
        const store = (globalThis as unknown as LifecycleGlobals)
          .__TEST_STORE__!;
        store.setObject('lifecycle-stack', {
          _kind: stackKind,
          _containerId: 'table',
          _pos: { x: 100, y: 200, r: 0 },
          _sortKey: '1.0',
          _locked: false,
          _selectedBy: null,
          _meta: {},
          _cards: ['card-1'],
          _faceUp: true,
        });
      },
      { stackKind: ObjectKind.Stack },
    );

    // Client-side navigation (no page reload) to a different table.
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
    }, `/table/${tableB}`);
    await expect(page).toHaveURL(new RegExp(`/table/${tableB}$`));
    await waitForCanvas(page);
    await page.evaluate(async () => {
      await (
        globalThis as unknown as LifecycleGlobals
      ).__TEST_STORE__!.waitForReady();
    });

    const sizeOnB = await page.evaluate(
      () =>
        (
          globalThis as unknown as LifecycleGlobals
        ).__TEST_STORE__!.getAllObjects().size,
    );
    expect(sizeOnB).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/table/${tableA}$`));
    await waitForCanvas(page);
    await page.waitForFunction(() => {
      const store = (globalThis as unknown as LifecycleGlobals).__TEST_STORE__;
      return Boolean(store?.getAllObjects().has('lifecycle-stack'));
    });
  });
});
