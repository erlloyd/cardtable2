/**
 * E2E test for ct-c69: multiplayer JOIN with late `pluginId` arrival.
 *
 * Scenario this protects against:
 *   - Player A creates a fresh table at /table/<uuid>; navigation state
 *     carries `pluginId` and the route writes it to `store.metadata`.
 *     Player A does NOT load a scenario (so `loadedScenario` is never set).
 *   - Player B opens the SAME table URL with empty IndexedDB. The mount
 *     effect at `isStoreReady` early-returns (no `pluginId` cached locally),
 *     then the WebSocket sync delivers the `pluginId` written by A. Without
 *     the fix in `table.$id.tsx`, the metadata observer would only react to
 *     `loadedScenario` changes, so B's `gameAssets` would stay null forever.
 *
 * Two browser contexts share the same WebSocket-backed Y.Doc but have
 * independent IndexedDB stores — exactly the multi-client shape that the
 * single-context fixture cannot exercise.
 *
 * Determinism: the bug is timing-sensitive on a real network. To make the
 * test reliably exercise the buggy code path, we open Player B FIRST and
 * wait for B's `waitForReady()` (which resolves on IndexedDB-synced) to
 * complete BEFORE Player A writes `pluginId`. That guarantees B's mount
 * effect runs with no `pluginId` available and early-returns; the only
 * recovery path is the metadata observer reacting to A's later remote
 * write.
 */

import { test, expect } from './_fixtures';
import type { GameAssets } from '@cardtable2/shared';

interface MetadataMap {
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
}

interface JoinTestStore {
  metadata: MetadataMap;
  getGameAssets: () => GameAssets | null;
  waitForReady: () => Promise<void>;
}

interface JoinTestGlobalThis {
  __TEST_STORE__?: JoinTestStore;
}

test.describe('Multiplayer JOIN with late pluginId (ct-c69)', () => {
  test('joining client loads gameAssets when remote pluginId arrives after mount', async ({
    browser,
  }, testInfo) => {
    // Unique table id per test EXECUTION keeps us isolated even when the
    // dev y-websocket server retains state across runs of the same test
    // (testInfo.testId is hash-deterministic, so without `Date.now()` the
    // server state from a prior pass would leak into this one).
    const tableId = `mp-join-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`;

    // ---------- Player B: joiner, opens FIRST with empty IndexedDB ----------
    // Opening B first guarantees its mount effect runs with no `pluginId`
    // available locally — exactly the bug's preconditions.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/table/${tableId}`);

    await pageB.waitForFunction(() =>
      Boolean((globalThis as unknown as JoinTestGlobalThis).__TEST_STORE__),
    );
    await pageB.evaluate(async () => {
      const store = (globalThis as unknown as JoinTestGlobalThis)
        .__TEST_STORE__;
      await store?.waitForReady();
    });

    // Sanity: B's metadata is empty at mount time.
    const bPluginIdAtMount = await pageB.evaluate(() => {
      const store = (globalThis as unknown as JoinTestGlobalThis)
        .__TEST_STORE__;
      return store?.metadata.get('pluginId');
    });
    expect(bPluginIdAtMount).toBeUndefined();

    // ---------- Player A: creator, writes pluginId AFTER B is mounted ------
    // Simulates "player A picked a game on the home screen" by writing
    // `pluginId` directly to metadata. This is the same write the
    // pluginId-storage effect in `table.$id.tsx` performs on a fresh table
    // navigation. We do NOT load a scenario — the bug's hot path is when a
    // remote client writes only `pluginId`.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(`/table/${tableId}`);

    await pageA.waitForFunction(() =>
      Boolean((globalThis as unknown as JoinTestGlobalThis).__TEST_STORE__),
    );
    await pageA.evaluate(async () => {
      const store = (globalThis as unknown as JoinTestGlobalThis)
        .__TEST_STORE__;
      await store?.waitForReady();
    });

    await pageA.evaluate((pluginId) => {
      const store = (globalThis as unknown as JoinTestGlobalThis)
        .__TEST_STORE__;
      if (!store) throw new Error('Player A: __TEST_STORE__ not exposed');
      store.metadata.set('pluginId', pluginId);
    }, 'testgame');

    // Within a reasonable timeout, B must observe the remote `pluginId`
    // write and populate gameAssets via the metadata observer.
    await pageB.waitForFunction(
      () => {
        const store = (globalThis as unknown as JoinTestGlobalThis)
          .__TEST_STORE__;
        if (!store) return false;
        return store.getGameAssets() !== null;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Belt-and-braces: B sees the synced pluginId. Protects against a
    // future regression where assets get loaded but metadata doesn't sync.
    const bPluginIdAfter = await pageB.evaluate(() => {
      const store = (globalThis as unknown as JoinTestGlobalThis)
        .__TEST_STORE__;
      return store?.metadata.get('pluginId');
    });
    expect(bPluginIdAfter).toBe('testgame');

    await ctxA.close();
    await ctxB.close();
  });
});
