/**
 * Dev-only IndexedDB management helpers.
 *
 * Exposed at `window.__ctDevTools` when `import.meta.env.DEV` is true (see
 * `main.tsx`).  Intended for console use to clear stale persisted CRDT
 * state — useful for debugging y-indexeddb desync, exercising the
 * "fresh-load" code path, and as a manual fallback for migrations that
 * change the on-disk schema.
 *
 * Naming convention
 * -----------------
 * `YjsStore` instantiates `new IndexeddbPersistence(`cardtable-${tableId}`,
 * doc)` (see `app/src/store/YjsStore.ts`).  y-indexeddb opens an IDB
 * database whose name is exactly the first constructor argument
 * (verified against the package source — no namespace, no prefix added by
 * the library).  So:
 *
 *   - Every persisted table → IDB database `cardtable-<tableId>`
 *   - `clearTable('foo')`     → deletes IDB database `cardtable-foo`
 *   - `clearAllTables()`      → deletes every IDB database whose name
 *     starts with `cardtable-`
 *
 * After clearing, the in-memory `YjsStore` for the current table is
 * divorced from persistence.  We log a clear "reload the page"
 * instruction so the user gets a clean slate; reloading is the cheapest
 * correct action.
 */

const DB_PREFIX = 'cardtable-';

export interface CtDevToolsApi {
  /**
   * Delete every IndexedDB database that was created by this app's
   * y-indexeddb persistence layer (name starts with `cardtable-`).
   *
   * Resolves once all delete requests have completed.  Any database
   * that fails to delete is reported via `console.warn`; the helper
   * still resolves so partial cleanup is observable.
   */
  clearAllTables(): Promise<{ deleted: string[]; failed: string[] }>;

  /**
   * Delete the IndexedDB database for a single table id.
   *
   * @param tableId - The table id (the path segment from `/table/$id`),
   *   NOT the full database name.  This helper prepends the
   *   `cardtable-` prefix internally.
   */
  clearTable(tableId: string): Promise<void>;
}

/**
 * Wrap `indexedDB.deleteDatabase` in a Promise.  The native API is
 * event-based; we resolve on `success`, reject on `error`, and treat
 * `blocked` as a non-fatal warning (other tabs/contexts have the DB
 * open — the deletion is queued by the browser and will complete when
 * those handles close, but it can't proceed right now).
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      reject(
        req.error ?? new Error(`[ctDevTools] deleteDatabase(${name}) failed`),
      );
    };
    req.onblocked = () => {
      console.warn(
        `[ctDevTools] deleteDatabase(${name}) is blocked — another tab or this page still has the DB open.  ` +
          `Close other tabs of this app and reload, then retry.`,
      );
      // Browser will complete the delete once handles close; resolve
      // here so the caller can proceed (the user is being told to
      // reload anyway).
      resolve();
    };
  });
}

/**
 * `indexedDB.databases()` returns `{ name?: string; version?: number }[]`
 * (TS lib type).  We need a string list of names that match our prefix.
 *
 * Note: `databases()` is not implemented in Firefox as of this writing
 * (https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/databases).
 * In that case the call throws or returns undefined; we surface a
 * console error and fall back to deleting nothing, since we have no
 * other reliable way to enumerate.  The user can fall back to
 * `clearTable(tableId)` for individual cleanup when they know the id.
 */
async function listOurDatabaseNames(): Promise<string[]> {
  if (!indexedDB.databases) {
    throw new Error(
      '[ctDevTools] indexedDB.databases() is not available in this browser ' +
        '(Firefox does not implement it).  Use clearTable(tableId) for ' +
        'individual cleanup.',
    );
  }
  const all = await indexedDB.databases();
  const names: string[] = [];
  for (const info of all) {
    const name = info.name;
    if (name && name.startsWith(DB_PREFIX)) {
      names.push(name);
    }
  }
  return names;
}

export function createCtDevToolsApi(): CtDevToolsApi {
  return {
    async clearAllTables() {
      const names = await listOurDatabaseNames();
      const deleted: string[] = [];
      const failed: string[] = [];

      for (const name of names) {
        try {
          await deleteDatabase(name);
          deleted.push(name);
        } catch (err) {
          failed.push(name);
          console.warn(`[ctDevTools] failed to delete ${name}:`, err);
        }
      }

      if (deleted.length === 0 && failed.length === 0) {
        console.log(
          '[ctDevTools] no cardtable-* IndexedDB databases found — nothing to clear.',
        );
      } else {
        console.log(
          `[ctDevTools] cleared ${String(deleted.length)} IndexedDB database(s):`,
          deleted,
        );
        if (failed.length > 0) {
          console.warn(
            `[ctDevTools] ${String(failed.length)} database(s) failed to delete:`,
            failed,
          );
        }
        console.log(
          '[ctDevTools] RELOAD THE PAGE to get a clean in-memory store ' +
            '— the current YjsStore is now divorced from persistence.',
        );
      }

      return { deleted, failed };
    },

    async clearTable(tableId) {
      const name = `${DB_PREFIX}${tableId}`;
      await deleteDatabase(name);
      console.log(`[ctDevTools] cleared IndexedDB database: ${name}`);
      console.log(
        '[ctDevTools] RELOAD THE PAGE to get a clean in-memory store ' +
          '— the current YjsStore is now divorced from persistence.',
      );
    },
  };
}

/**
 * Install `window.__ctDevTools` in development builds.  Idempotent.
 * Safe to call at app startup.  Tree-shaken from production: the
 * `import.meta.env.DEV` guard collapses to `false` under Vite's prod
 * build, so the closure (and all imports referenced only from it) drop
 * out.
 */
export function installCtDevTools(): void {
  if (!import.meta.env.DEV) return;
  if (window.__ctDevTools) return;
  window.__ctDevTools = createCtDevToolsApi();
  console.log(
    '[ctDevTools] installed window.__ctDevTools (dev-only helper).  ' +
      'Use __ctDevTools.clearAllTables() or __ctDevTools.clearTable(id).',
  );
}
