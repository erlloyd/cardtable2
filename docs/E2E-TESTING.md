# E2E Testing & Browser Verification

Reference for Playwright E2E tests and autonomous browser verification via Playwright MCP. Loaded on-demand — see CLAUDE.md for high-level rules.

## E2E Auto-Clean Convention

E2E tests get a clean `__TEST_STORE__` automatically via the fixture at `app/e2e/_fixtures.ts`. **Import `test` and `expect` from `./_fixtures`, NOT from `@playwright/test` directly** — the fixture wraps `page.goto` so navigations to `/table/*` or `/dev/table/*` auto-call `clearAllObjects()` after the page hydrates.

- Do NOT add a manual `clearAllObjects()` at test start; it's redundant.
- To opt out (e.g., a test that intentionally inherits prior state), call `skipNextAutoClear(page)` before the navigation.
- Mid-test clears for specific scenarios are still legitimate — see `state-persistence.spec.ts`.

This convention exists to fix the silent-fragility class where back-to-back runs on a long-running dev server inherit prior CRDT state.

## Pointer Events on Canvas

When writing E2E tests that interact with canvas elements (especially React components with `onPointerDown/Up/Move` handlers):

1. **Don't use `page.mouse`** — it dispatches `mousedown/mousemove/mouseup` events, which won't trigger React's `onPointer*` handlers.
2. **Use `canvas.dispatchEvent()`** instead:

   ```typescript
   await canvas.dispatchEvent('pointerdown', {
     bubbles: true,
     cancelable: true,
     composed: true,
     pointerId: 1,
     pointerType: 'mouse',
     isPrimary: true,
     clientX: viewportX,
     clientY: viewportY,
     screenX: viewportX,
     screenY: viewportY,
     pageX: viewportX,
     pageY: viewportY,
     button: 0,
     buttons: 1,
   });
   ```

3. **Coordinate systems matter:**
   - World coordinates: object positions in the game/scene space
   - Canvas-relative: `worldX + canvasWidth/2, worldY + canvasHeight/2`
   - Viewport-absolute: canvas-relative + canvas bounding box offset
   - `clientX/clientY` in pointer events are **viewport-absolute**, not canvas-relative

4. **Always query canvas position dynamically:**

   ```typescript
   const canvasBBox = await canvas.boundingBox();
   const viewportX = canvasBBox.x + canvasRelativeX;
   const viewportY = canvasBBox.y + canvasRelativeY;
   ```

5. **Why dynamic queries matter**: canvas position can change due to layout, responsive design, or viewport size.

See `e2e/selection.spec.ts:362` ("clicking on an unselected object selects it") for a complete example.

## Autonomous Browser Verification (Playwright MCP)

The project exposes dev-only helpers specifically so Claude can drive a real browser against the running dev server via Playwright MCP — without user-in-the-loop log copy/paste.

### When to use

Reach for browser verification when the change is user-visible or interaction-driven:

- UI regressions (layout, styling, visibility)
- Interaction bugs (drag, click, selection, keyboard)
- Render behavior (animations, z-ordering, hover previews)

**Do NOT** use it for pure logic (write a Vitest unit test), type safety (run `pnpm run typecheck`), or accessibility audits (out of scope).

### Session lifecycle

1. Ensure `pnpm run dev` is running (app on `:3000`, server on `:3001`).
2. Load the MCP tool schemas via `ToolSearch` before the first browser call — deferred tools aren't invocable until loaded:

   ```
   ToolSearch("select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_close")
   ```

3. Navigate to a fresh table. Use a unique ID so IndexedDB doesn't restore stale state. Combine with a seed (see below) for deterministic starting scenes:

   ```
   browser_navigate(url="http://localhost:3000/table/claude-verify-<timestamp>?seed=stack-of-5&debug=drag,attach")
   ```

4. `browser_snapshot()` yields the ARIA tree with clickable `ref`s — use this (not screenshots) to target DOM clicks. Screenshots are for visual regression, not interaction.
5. Iterate: interact, read console, adjust code, reload (navigate to a new unique ID rather than relying on hot reload — HMR sometimes leaves stale closures in the renderer).
6. `browser_close()` when done.

### Canvas interaction

`page.mouse` won't trigger React's `onPointer*` handlers on `<canvas>`. Use `window.__ctTest` (dev-only, installed in DEV builds — see `app/src/dev/ctTest.ts`):

```typescript
browser_evaluate(function=`async () => {
  const pts = window.__ctTest.probeObjects(2);       // first two objects
  await window.__ctTest.drag(pts[0].world, { x: 200, y: 100 }, { steps: 10 });
  return pts;
}`);
```

The helper handles world → viewport coord translation, dispatches real `PointerEvent`s, and supports modifier keys (`opts.modifiers = { altKey: true }` to force-attach, etc.). See `app/src/dev/ctTest.ts` for the full API and `app/e2e/selection.spec.ts:460` for the original pattern it mirrors.

### Reading logs without flooding context

Use the subsystem-scoped debug logger (`app/src/dev/dbg.ts`) rather than ephemeral `console.log` insertion:

1. Enable only the subsystems you care about. Either via URL (`?debug=drag,attach`) or at runtime:

   ```typescript
   browser_evaluate(function=`() => window.__dbg.enable('drag', 'selection')`);
   ```

2. Perform the interaction.
3. Filter output:

   ```
   browser_console_messages(level="info", filter="[DEBUG][drag]")
   ```

4. Disable when done: `window.__dbg.disableAll()`.

All logs share the `[DEBUG]` prefix (project convention) with a `[subsystem]` tag for narrower filtering. See `app/src/dev/dbg.ts` for the API and known subsystems.

### Scene seeds

Prefer URL-param seeds over manual setup clicks — the setup then can't drift. See `app/src/dev/seeds/index.ts`:

- `?seed=empty-table` — blank slate
- `?seed=single-card` — one face-up card at origin
- `?seed=stack-of-5` — five-card stack at origin
- `?seed=two-stacks` — two stacks spaced for drag/merge
- `?seed=attachment-pair` — two single-card stacks for attach testing

Seeds only apply to empty tables (won't clobber existing state) and are dev-only (tree-shaken from production). Add new ones under `SEED_REGISTRY` in `app/src/dev/seeds/index.ts` — ~10 lines per seed.

### Clearing IndexedDB (`__ctDevTools`)

Persisted table state lives in IndexedDB as `cardtable-<tableId>` databases (created by y-indexeddb in `YjsStore`). When stale CRDT state is interfering with a repro — or when an on-disk schema change makes old data unusable — clear it from the console. Helper installed in DEV only (tree-shaken from production); see `app/src/dev/ctDevTools.ts`:

```typescript
window.__ctDevTools.clearAllTables(): Promise<{ deleted: string[]; failed: string[] }>
window.__ctDevTools.clearTable(tableId: string): Promise<void>
```

`clearAllTables()` enumerates IDB via `indexedDB.databases()` (not implemented in Firefox — fall back to `clearTable` there) and deletes every database whose name starts with `cardtable-`. `clearTable(tableId)` deletes a single one. Both log a "RELOAD THE PAGE" instruction on completion — the in-memory `YjsStore` for the current table is divorced from persistence after clearing, so reload is the cheapest correct action.

### Verification discipline

- **Prefer state queries over screenshots.** `browser_evaluate(() => window.__TEST_STORE__.objects.size)` tells you more than a pixel diff. Reserve screenshots for genuine visual regressions.
- **New URL per iteration.** HMR sometimes preserves worker/renderer state across hot reloads. Navigating to a fresh `tableId` guarantees a clean slate.
- **Snapshot before click.** Element `ref`s in `browser_click` come from `browser_snapshot` — always snapshot first, don't guess refs.
- **One assertion per evaluate.** If you need multiple facts, return an object from `browser_evaluate`. Multiple sequential evaluates can interleave with other work.
- **Known gotcha:** the `/table/$id` route passes `showDebugUI={false}`, so `window.__TEST_BOARD__` (waitForRenderer, etc.) is **not** available there — only on the dev route `/dev/table/$id` or E2E builds. If you need `waitForRenderer`, prefer the dev route.

## Debug Logging Convention

Prefer the subsystem-scoped logger in `app/src/dev/dbg.ts` over ephemeral `console.log` insertion:

```typescript
import { dbg } from '@/dev/dbg';
dbg('drag', 'pointerdown at', x, y); // emits [DEBUG][drag] ... only when enabled
```

Enable subsystems via `window.__dbg.enable('drag')`, `?debug=drag,attach` URL param, or persistent localStorage. All messages share the `[DEBUG]` prefix so the user can filter console output with a single search term (per this project's historical convention); the `[subsystem]` tag lets you narrow further.

If you must insert an ephemeral `console.log`, still use the `[DEBUG-X]` single-prefix convention so the user can filter — never use different prefixes per file or per function.
