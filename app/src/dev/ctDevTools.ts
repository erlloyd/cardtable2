/**
 * Developer-facing IndexedDB management helpers.
 *
 * Exposed at `window.__ctDevTools` in **all** builds (DEV and production)
 * — see `main.tsx`.  "Dev" in the name means "developer-facing console
 * API," not "dev-build-only": shipping it in production lets support /
 * developers guide affected users through a reset when an on-disk schema
 * change or other regression breaks a session.  No UI is exposed; the
 * helper is reachable only from the browser console.
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
 * correct action.  A connected y-websocket session can repopulate the
 * recreated IDB from the server — that's expected; this helper clears
 * local persistence only.
 */

import type { AttachmentDirection } from '@cardtable2/shared';
import { setAttachmentDirectionOverride } from './attachmentOverride';

const DB_PREFIX = 'cardtable-';

/**
 * Module-level flag so the destructive-action warning fires exactly once
 * per page session — first invocation of either entry point triggers it,
 * subsequent calls in the same load do not.  Reset on full reload, which
 * is what we already instruct the user to do anyway.
 */
let warnedThisSession = false;

const FIRST_CALL_WARNING =
  '[ctDevTools] This deletes local table data.  Connected y-websocket ' +
  'sessions can repopulate from the server.  Reload the page after this ' +
  'completes.';

function warnOnce(): void {
  if (warnedThisSession) return;
  warnedThisSession = true;
  console.warn(FIRST_CALL_WARNING);
}

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

  /**
   * Force the card-on-card attachment direction for any subsequent
   * `attach-cards` operation, regardless of the active plugin's
   * `attachmentLayout.direction`.  Pass `null` to clear the override and
   * restore plugin/default behavior.
   *
   * Lives on `__ctDevTools` (not `__ctTest`) so it is reachable from
   * deployed PR/preview builds — manual verification of non-default
   * directions is the entire reason the override exists, and no shipped
   * plugin currently sets a non-default `direction`.  See ct-t1c.
   *
   * The override is read inside `BoardMessageBus`'s `attach-cards`
   * handler — see `app/src/components/Board/BoardMessageBus.ts`.
   */
  setAttachmentDirection(dir: AttachmentDirection | null): void;
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
      warnOnce();
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
      warnOnce();
      const name = `${DB_PREFIX}${tableId}`;
      await deleteDatabase(name);
      console.log(`[ctDevTools] cleared IndexedDB database: ${name}`);
      console.log(
        '[ctDevTools] RELOAD THE PAGE to get a clean in-memory store ' +
          '— the current YjsStore is now divorced from persistence.',
      );
    },

    setAttachmentDirection(dir) {
      setAttachmentDirectionOverride(dir);
      if (dir === null) {
        console.log(
          '[ctDevTools] attachment direction override cleared — plugin/default behavior restored.',
        );
      } else {
        console.log(
          `[ctDevTools] attachment direction override set to "${dir}" — next attach-cards operation will use this direction regardless of plugin config.`,
        );
      }
    },
  };
}

/**
 * Install `window.__ctDevTools` in all builds (DEV and production).
 * Idempotent.  Safe to call at app startup.  Intentionally NOT gated on
 * `import.meta.env.DEV` — see file header for rationale (developer-
 * facing API, not dev-build-only; needed in prod for support).
 */
export function installCtDevTools(): void {
  if (window.__ctDevTools) return;
  window.__ctDevTools = createCtDevToolsApi();
  console.log(
    '[ctDevTools] installed window.__ctDevTools (developer console helper).  ' +
      'Use __ctDevTools.clearAllTables() or __ctDevTools.clearTable(id).',
  );
}

/**
 * Test-only helper to reset the once-per-session warn flag between
 * tests.  Not part of the public surface.
 */
export function __resetCtDevToolsForTests(): void {
  warnedThisSession = false;
  delete window.__ctDevTools;
}
