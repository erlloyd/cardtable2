# Plugin Loading Architecture: 1:1 Game-to-Plugin, Eager Plugin Load

## Overview

Today, "game" and "plugin" are two related-but-misaligned concepts in the codebase, with separate indexes, mismatched IDs, and a loading lifecycle that defers all heavy work until the user explicitly triggers a "Load Scenario" action. This plan unifies the two concepts, moves plugin/asset loading to the moment a table is created, and leaves scenario loading as a pure data-instantiation step against already-resident assets.

This is a structural refactor of the content layer, not a feature addition. No user-visible workflow changes are intended beyond two side effects: (1) box art and descriptions are now sourced from a single place, and (2) opening an existing table is meaningfully faster because the plugin doesn't need to be fetched twice.

## Problem

### Two indexes, two IDs, two shapes

`app/public/gamesIndex.json` and `app/public/pluginsIndex.json` exist side-by-side. They describe overlapping things, but:

- IDs don't match. The game `marvel-champions` is served by the plugin `marvelchampions`. There's no enforcement.
- The shapes are different. `gamesIndex` carries display metadata (description, boxArt, manifestUrl). `pluginsIndex` carries delivery metadata (baseUrl, author).
- One field, `manifestUrl` in `gamesIndex`, is overloaded — for the testgame entry it points at a scenario JSON; for marvel-champions it points at a `manifest.json` path that may or may not exist.

The result: a developer (or agent) has to mentally reconcile two sources of truth and two ID spaces every time content loading is touched.

### Loading lifecycle is back-to-front

Today's flow:

1. User picks a game → `gameId` is written to Y.Doc metadata. Nothing else is loaded.
2. Table mounts. A fallback effect notices "no scenario yet, but there's a gameId" and lazily loads plugin assets.
3. User triggers Load Scenario from the action palette. **The whole plugin is fetched and merged a second time** by `loadPluginScenario`, alongside the scenario JSON.
4. On reload of an existing table, `reloadScenarioFromMetadata` re-fetches everything from scratch.

`loadPluginAssets` exists and works, but is positioned as a backstop rather than the primary path. The two code paths (mount-load vs scenario-load) duplicate the pack-fetch step.

## Target state

### One concept: a plugin

Every game in the UI corresponds to exactly one plugin. The plugin's manifest is the source of all game-facing metadata (name, description, version, box art, scenarios, asset packs). `pluginsIndex.json` is the single registry; `gamesIndex.json` is gone.

### Plugin assets live as long as the table

When a table is created (or a saved table is reopened), the plugin and its common assets are loaded immediately and cached. By the time the user can do anything on the table, `gameAssets` is in memory. This is true on cold load, on hot reload, and on a remote scenario push from another player.

A plugin cache (in-flight + completed, keyed by plugin ID) ensures that any subsequent caller — scenario load, multiplayer reload, action palette — gets the same already-loaded `GameAssets` rather than triggering a refetch.

### Scenario load is pure

`loadScenario(pluginId, scenarioFile)` fetches the scenario JSON and instantiates objects against the cached `GameAssets`. It does not fetch asset packs. If the cache is empty (defensive), it asks the loader to populate it; on the happy path, this is a single network request (the scenario JSON) plus a synchronous instantiation.

## Approach

The work breaks into four phases. The phases are sequential — each unblocks the next — but each phase is small enough to ship behind a single PR.

### Phase 1 — Unify the index

Make `pluginsIndex.json` the single source of truth. Extend `PluginRegistryEntry` with the user-facing fields (`displayName`, `description`, `version`, `boxArt`) currently sourced from `gamesIndex.json`. Update the game-select page to read the plugin registry. Delete `gamesIndex.json` and the `Game` / `GamesIndex` types. Rename plugin IDs where they currently differ from the legacy game IDs so user-facing IDs are stable.

The migration question this phase forces: existing tables in IndexedDB hold a `gameId` that may match the *old* plugin ID (e.g. `marvel-champions` matches the game-side ID, not the plugin-side `marvelchampions`). See [Open questions](#open-questions).

### Phase 2 — Eager plugin load on table creation

Move plugin loading from the "fallback" branch of the table-mount effect to the primary path. The mount effect always loads the plugin first, unconditionally, whether or not a scenario will subsequently be instantiated. Add an in-flight + completed cache to the plugin loader so concurrent callers share one fetch.

This is the conceptual shift: a plugin is a property of the table, not of a scenario. A table without a scenario is still a table-with-a-plugin.

Naming: `gameId` in Y.Doc metadata becomes `pluginId`. (See migration in Phase 4.)

### Phase 3 — Pure scenario load

Refactor `loadPluginScenario` so it consumes already-loaded `GameAssets` from the cache rather than re-fetching packs. The Load Scenario action becomes: fetch scenario JSON → call `instantiateScenario(scenario, gameAssets)`. The "set gameAssets a second time" anti-pattern goes away.

This phase is mostly a deletion: the redundant pack-fetch step in the existing scenario-load path comes out.

### Phase 4 — Reload, multiplayer, and migration paths

Three things settle out together:

1. The mount-effect orchestrates the load directly (plugin always, scenario optionally) instead of going through a single `reloadScenarioFromMetadata` helper. That helper either shrinks to just the scenario-instantiate part or disappears entirely.
2. The remote-scenario observer (when another player loads a scenario) only instantiates — plugin assets are already loaded locally.
3. Y.Doc metadata migrates from `gameId` to `pluginId`. Best-effort migration on mount: if `pluginId` is missing but `gameId` exists, copy and delete. Plus a console-accessible IndexedDB clear utility for debugging stale tables. See [Dev tools](#dev-tools).

### Dev tools (cross-cutting, can ship anytime)

A small `window.__ctDevTools` surface in `app/src/dev/` exposes `clearAllTables()` and `clearTable(tableId)` against IndexedDB. Useful generally for debugging stale CRDT state, and specifically for handling the rename in Phase 4 if the migration logic misses an edge case.

## Open questions

- **Plugin ID renames.** The cleanest end state is plugin IDs that match the game-facing IDs (`marvel-champions`, not `marvelchampions`). But existing tables in IndexedDB hold the *game-side* ID under the `gameId` key, so renaming the plugin to match is actually the migration-friendly direction — `pluginId = oldGameId` for free. Worth confirming this is the case for every entry before Phase 1 lands.

- **Display fields on the manifest.** Does the per-plugin `manifest.json` (served at the plugin's `baseUrl`) need to grow `displayName` / `description` / `boxArt`, or do those fields live only on the registry entry? Manifest-side is more portable across mirrors; registry-side is simpler. Default to registry-side and revisit only if a real use case appears.

- **Stale plugin references.** What happens if a saved table holds `pluginId: 'foo'` but `foo` is no longer in the registry? Today this fails silently somewhere in the load chain. Needs an explicit error path with a clear UI signal — out of scope for the refactor itself, but should be filed as a follow-up.

- **Cache scope.** Module-level (one cache for the whole app, persists across route changes) or store-scoped (one per `YjsStore`)? Module-level is simpler and fine because plugins are immutable; revisit if hot-reloading plugins becomes a thing.

- **`reloadScenarioFromMetadata` survival.** Does the function still exist after Phase 4, or does the mount effect compose `loadPluginAssets` + `instantiateScenario` directly? Lean toward deletion; the discriminated-union over `'plugin' | 'builtin' | 'local-dev'` was useful when those branches actually diverged, but after unification only `'plugin'` remains in practice (plus `'local-dev'` for plugin development).

## Risks

- **Cache correctness under concurrency.** Two near-simultaneous calls (e.g. mount effect + immediate Load Scenario click) must dedupe. The cache must store the in-flight Promise, not the resolved value. Standard pattern, easy to get subtly wrong.

- **Race between scenario JSON change and plugin load.** Existing code at `table.$id.tsx:349-372` compares `loadedAt` timestamps to discard stale assets when a scenario change races with a load. The simplification in Phase 4 needs to preserve this — though the race window shrinks because the plugin is no longer being fetched on every scenario change.

- **Migration breakage.** Best-effort `gameId → pluginId` migration on mount handles the common case. The dev-tools clear utility handles the rest. The combination should be sufficient, but worth at least one E2E test that opens a "pre-migration" table and confirms it loads.

## Out of scope

- Multi-plugin tables (one table referencing multiple plugins simultaneously). Not precluded by 1:1 mapping but explicitly not part of this work.
- Plugin versioning beyond what already exists. The current `version` field stays informational.
- Local-dev plugin loading via the file picker (`loadLocalPluginScenario`). Continues to work as-is; the unified index does not list local plugins.
- Scenario-discovery UX changes. The action-palette flow stays as-is; only the loading mechanics under it change.
- Plugin manifest schema changes beyond the registry-entry display fields named in [Phase 1](#phase-1--unify-the-index).

## What this plan does NOT prescribe

By design, this plan stops at the architectural level. It does not:

- Specify file-by-file edit lists.
- Name the test cases.
- Decide whether each phase is one PR or several.
- Pick an issue tracker layout.

Those choices belong to whoever picks up the work, informed by this plan and the relevant CLAUDE.md / `docs/` rules.
