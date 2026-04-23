/**
 * Subsystem-scoped debug logger.
 *
 * Usage
 * -----
 *   // In product code (any subsystem):
 *   import { dbg } from '@/dev/dbg';
 *   dbg('drag', 'pointerdown at', x, y);
 *   // Emits [DEBUG][drag] pointerdown at 10 20  iff 'drag' is enabled.
 *
 *   // From the browser console or Playwright MCP:
 *   window.__dbg.enable('drag');
 *   window.__dbg.enable('drag', 'attach');
 *   window.__dbg.list();      // => ['drag', 'attach']
 *   window.__dbg.disableAll();
 *
 *   // Via URL param on any route:
 *   /table/foo?debug=drag,attach
 *
 * Rationale
 * ---------
 * - Single prefix `[DEBUG]` keeps `grep "[DEBUG]"` working; the
 *   `[subsystem]` tag lets the user narrow further without spamming the
 *   main filter (per CLAUDE.md and MEMORY.md convention).
 * - Persists enabled subsystems in localStorage so hot-reloads and
 *   navigation don't lose context.
 * - Zero cost when disabled: `dbg()` checks the enabled set before
 *   touching its varargs, so callers can pass expensive values safely as
 *   long as those values aren't produced by separate function calls.
 *   (If you need to skip expensive computation, gate with
 *   `dbg.isEnabled('drag') && ...`.)
 *
 * Subsystems are free-form strings; the project standardises on:
 *   drag, selection, attach, render, sync, input
 * but any name works — first use registers it implicitly.
 */

const STORAGE_KEY = 'ctDebugSubsystems';

export interface DbgApi {
  /** Enable one or more subsystems.  Persists to localStorage. */
  enable: (...subsystems: string[]) => void;
  /** Disable one or more subsystems.  Persists to localStorage. */
  disable: (...subsystems: string[]) => void;
  /** Disable all subsystems.  Persists. */
  disableAll: () => void;
  /** Return the set of currently enabled subsystems. */
  list: () => string[];
  /** Check whether a subsystem is enabled (for gating expensive work). */
  isEnabled: (subsystem: string) => boolean;
}

/**
 * Module-level state.  Module singleton so `dbg()` from any call site
 * hits the same set.  Exposed as `window.__dbg` in dev builds.
 */
const enabled: Set<string> = new Set();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...enabled]));
  } catch {
    // localStorage can throw (private mode, quota).  Logging is
    // best-effort; silently ignore.
  }
}

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string' && item.length > 0) {
          enabled.add(item);
        }
      }
    }
  } catch {
    // Corrupt state; ignore and start clean.
  }
}

/**
 * Normalise a single argument into a list of subsystem names by
 * splitting on `,` and trimming whitespace.  Shared by `enable`,
 * `disable`, and the `?debug=` URL param so all three paths behave
 * identically — i.e. `enable('a,b,c')`, `enable('a, b , c')`, and
 * `enable('a', 'b', 'c')` all produce the same result as
 * `?debug=a,b,c`.
 */
function splitAndTrim(arg: string): string[] {
  return arg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function loadFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get('debug');
  if (!debugParam) return;
  for (const name of splitAndTrim(debugParam)) {
    enabled.add(name);
  }
}

/**
 * Log a message for a subsystem.  No-op when the subsystem is not
 * enabled.  First argument is the subsystem tag; remaining arguments
 * are forwarded to `console.log`.
 *
 * Project convention: a single `[DEBUG]` prefix across all files so the
 * user can filter with one search term (see CLAUDE.md / MEMORY.md).
 */
export function dbg(subsystem: string, ...args: unknown[]): void {
  if (!enabled.has(subsystem)) return;
  console.log(`[DEBUG][${subsystem}]`, ...args);
}

/** Gate expensive work: `if (dbg.isEnabled('drag')) { ... }` */
dbg.isEnabled = (subsystem: string): boolean => enabled.has(subsystem);

export const dbgApi: DbgApi = {
  enable(...subsystems) {
    for (const arg of subsystems) {
      for (const s of splitAndTrim(String(arg))) {
        enabled.add(s);
      }
    }
    persist();
  },
  disable(...subsystems) {
    for (const arg of subsystems) {
      for (const s of splitAndTrim(String(arg))) {
        enabled.delete(s);
      }
    }
    persist();
  },
  disableAll() {
    enabled.clear();
    persist();
  },
  list() {
    return [...enabled].sort();
  },
  isEnabled(subsystem) {
    return enabled.has(subsystem);
  },
};

/**
 * Install `window.__dbg` and seed the enabled set from localStorage +
 * URL params.  Idempotent.
 */
export function installDbg(): void {
  if (!import.meta.env.DEV && !import.meta.env.VITE_E2E) return;
  if (window.__dbg) return;
  loadFromStorage();
  loadFromUrl();
  // URL params take precedence; persist the merged result.
  persist();
  window.__dbg = dbgApi;
  const current = dbgApi.list();
  if (current.length > 0) {
    console.log(`[DEBUG] subsystems enabled:`, current.join(', '));
  }
}

/** Test-only helper to reset module state between tests. */
export function __resetDbgForTests(): void {
  enabled.clear();
  delete window.__dbg;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
