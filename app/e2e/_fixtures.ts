/**
 * Shared Playwright fixtures for Cardtable E2E tests.
 *
 * The exported `test` is a thin extension of Playwright's base `test` whose
 * `page.goto()` is wrapped to auto-clear the in-memory CRDT store any time the
 * navigation lands on a `/table/:id` or `/dev/table/:id` URL.
 *
 * ## Why this exists
 *
 * The local y-websocket dev server retains CRDT documents in memory keyed by
 * table id, and `testInfo.testId` is hash-deterministic — so back-to-back runs
 * of the same test against the same long-running dev server inherit prior
 * state. Authors used to call `__TEST_STORE__.clearAllObjects()` manually at
 * the top of each test, but it was easy to forget and produced silent
 * fragility (see PR #89, ct-r75).
 *
 * ## Convention
 *
 * Every E2E spec should import `test` and `expect` from this module rather
 * than from `@playwright/test` directly. The auto-clear behaviour happens
 * after navigation completes, before the spec body runs:
 *
 *   1. `page.goto(url, options)` runs as normal.
 *   2. If the resolved URL contains `/table/` or `/dev/table/`, the fixture
 *      waits for `globalThis.__TEST_STORE__` to exist, then calls
 *      `clearAllObjects()`.
 *   3. Any other URL passes through untouched.
 *
 * Tests that need a clean store mid-test (rather than only at navigation)
 * may still call `__TEST_STORE__.clearAllObjects()` directly.
 */

import {
  test as base,
  expect,
  type Page,
  type Response,
} from '@playwright/test';

/**
 * Shape of the dev/test-only store hung off `globalThis.__TEST_STORE__`.
 * Mirrors what the real `YjsStore` exposes for tests; only the methods
 * exercised by E2E fixtures need to appear here.
 */
export interface TestStore {
  setObject: (id: string, obj: unknown) => void;
  getObject: (id: string) => unknown;
  getAllObjects: () => Map<string, unknown>;
  clearAllObjects: () => void;
  waitForReady: () => Promise<void>;
}

interface TestGlobalThis {
  __TEST_STORE__?: TestStore;
}

const TABLE_PATH_PATTERN = /\/(?:dev\/)?table\//;

/**
 * Tag a `Page` so the next `page.goto()` to a table URL skips the auto-clear.
 * Useful for tests that intentionally navigate between tables and need to
 * verify that prior state survives (e.g., cross-table persistence checks).
 *
 *   skipNextAutoClear(page);
 *   await page.goto(`/dev/table/${id}`);
 *
 * The flag is consumed once; subsequent navigations resume auto-clearing.
 */
export function skipNextAutoClear(page: Page): void {
  (page as Page & { __skipAutoClear?: boolean }).__skipAutoClear = true;
}

/**
 * Playwright `test` fixture extended with auto-clear-on-table-nav behaviour.
 *
 * Every spec in `app/e2e/` should import `test` and `expect` from here. After
 * `page.goto(...)` resolves, if the destination URL is a table or dev-table
 * route, the in-memory CRDT store is cleared so the spec starts from an empty
 * table — even when run repeatedly against the same dev server.
 *
 * To skip the auto-clear for a specific navigation, call
 * `skipNextAutoClear(page)` before `page.goto(...)`.
 */
export const test = base.extend<Record<string, never>>({
  page: async ({ page }, runTest) => {
    const originalGoto = page.goto.bind(page);
    const taggedPage = page as Page & { __skipAutoClear?: boolean };
    page.goto = async (
      url: string,
      options?: Parameters<Page['goto']>[1],
    ): Promise<Response | null> => {
      const response = await originalGoto(url, options);
      const shouldSkip = taggedPage.__skipAutoClear === true;
      taggedPage.__skipAutoClear = false;
      if (!shouldSkip && TABLE_PATH_PATTERN.test(url)) {
        // Wait for the store global to exist, then wait for its IndexedDB
        // hydration to finish. Clearing before hydration is a no-op because
        // IndexedDB then re-introduces the prior state.
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as TestGlobalThis).__TEST_STORE__),
        );
        await page.evaluate(async () => {
          const store = (globalThis as unknown as TestGlobalThis)
            .__TEST_STORE__;
          await store?.waitForReady();
        });
        // Clear, then wait until the store actually reports zero objects.
        // The y-websocket dev server retains CRDT docs in memory keyed by
        // table id; if a prior run populated this id, server state can race
        // back in after a single clear. Re-clear until it sticks.
        await page.waitForFunction(() => {
          const store = (globalThis as unknown as TestGlobalThis)
            .__TEST_STORE__;
          if (!store) return false;
          if (store.getAllObjects().size === 0) return true;
          store.clearAllObjects();
          return false;
        });
      }
      return response;
    };
    await runTest(page);
  },
});

export { expect };
