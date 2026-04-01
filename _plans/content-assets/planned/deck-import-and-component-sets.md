# Deck Import & Component Sets

## Context

Many card games have online deckbuilding sites (MarvelCDB, ArkhamDB, RingsDB) where players create and share decks. Cardtable v1 supported importing decks by ID from these APIs. Cardtable v2 currently has no external API integration — all content comes from static plugin JSON.

This plan introduces **Component Sets** — a reusable, always-additive collection of game objects (stacks, tokens, counters, mats, zones). Component sets are the shared building block for:

1. **Scenario layouts** — A scenario clears the table, loads packs, and instantiates a component set
2. **Standalone loadable sets** — Defined in plugin JSON, loaded additively by the user (e.g. "Rhino Encounter Set")
3. **API deck imports** — Fetched from an external API, parsed by plugin code in a Web Worker sandbox, producing a component set

**Key design decisions:**
- **One schema, multiple contexts**: Component sets use the same JSON structure whether inline in a scenario, standalone in a plugin, or returned from an API worker
- Plugin asset packs already contain all possible cards for the game
- API parsers run in a **Web Worker sandbox** (no DOM/cookie access); core handles fetching
- Worker receives **full GameAssets** so parsers can reference any asset type
- Static component sets are **pure JSON** — no code required from plugin authors
- Initial API scope: Marvel Champions, Arkham Horror LCG, Lord of the Rings LCG
- Direct browser fetch to external APIs (no server proxy)
- Command palette triggers a modal listing all available component sets + API imports

---

## Architecture Overview

### Concept hierarchy

```
Scenario (ct-scenario@2)
  ├── packs: string[]               — which asset packs to load
  ├── componentSet: ComponentSet     — objects to place on table
  └── (name, version, etc.)          — scenario-level metadata

Plugin Manifest (index.json)
  ├── assets: string[]               — asset pack filenames
  ├── scenarios: string[]            — scenario filenames
  └── componentSets: ComponentSetEntry[]  — standalone loadable sets
        ├── Static: { id, name, ...ComponentSet }
        └── API:    { id, name, apiImport: { endpoints, parserModule, labels } }
```

### Loading flows

```
Scenario load:     clear table → load packs → instantiate componentSet → position → store
Static set load:   (packs already loaded)   → instantiate componentSet → position → store
API import:        fetch → worker parse     → instantiate componentSet → position → store
                                                     ↑
                                              shared from here down
```

### Component Set schema (`ComponentSet`)

```typescript
interface ComponentSet {
  stacks?: ComponentSetStack[];
  tokens?: ComponentSetToken[];
  counters?: ComponentSetCounter[];
  mats?: ComponentSetMat[];
  zones?: ComponentSetZone[];
}

interface ComponentSetStack {
  label: string;           // "Main Deck", "Nemesis", "Hero"
  faceUp: boolean;
  row?: number;            // Layout row hint (0-based, same-row = side-by-side)
  // Card source — one of:
  deck?: DeckDefinition;   // For static sets: { cardSets?, cards?, shuffle? }
  cards?: string[];        // For API results: pre-expanded card codes
}

interface ComponentSetToken {
  ref: string;             // Key in asset pack's `tokens`
  label?: string;
  row?: number;
}

interface ComponentSetCounter {
  ref: string;             // Key in asset pack's `counters`
  label?: string;
  value?: number;          // Override starting value
  row?: number;
}

interface ComponentSetMat {
  ref: string;             // Key in asset pack's `mats`
  label?: string;
  row?: number;
}

interface ComponentSetZone {
  ref?: string;            // Key in asset pack, or inline dimensions
  label?: string;
  width?: number;
  height?: number;
  row?: number;
}
```

Stacks have either `deck` (static, needs expansion via `expandDeck()`) or `cards` (pre-expanded, from API worker). A `resolveComponentSet()` function normalizes both forms before instantiation.

---

## Task 1: Shared Types — ComponentSet and related contracts

**Files:** `shared/src/content-types.ts`

Define the `ComponentSet` schema and all sub-types. Define the plugin manifest additions and worker communication contract.

### Types to add:

```typescript
// The core reusable type
ComponentSet
ComponentSetStack, ComponentSetToken, ComponentSetCounter, ComponentSetMat, ComponentSetZone

// Plugin manifest entry for standalone component sets
ComponentSetEntry         // { id, name, ...ComponentSet } | { id, name, apiImport }
PluginApiImport           // { apiEndpoints, parserModule, labels }

// Worker communication
DeckImportRequest         // { apiResponse: unknown, gameAssets: GameAssets }
// Worker returns: ComponentSet (same type)
```

### Acceptance criteria:
- [ ] All types exported from `@cardtable2/shared`
- [ ] `ComponentSet` supports all five object types (stacks, tokens, counters, mats, zones)
- [ ] `ComponentSetStack` supports both `deck` (DeckDefinition) and `cards` (string[]) sources
- [ ] `ComponentSetEntry` discriminates between static and API-backed sets
- [ ] Types compile cleanly (`pnpm run typecheck`)

---

## Task 2: Refactor scenario schema to use ComponentSet

**Files:** `shared/src/content-types.ts`, `app/src/content/instantiate.ts`, `app/src/content/loader.ts`

Update the scenario schema (`ct-scenario@2`) so its layout is expressed as a `ComponentSet`. Maintain backward compatibility with `ct-scenario@1`.

### Changes:
- Scenario type gains a `componentSet: ComponentSet` field
- Existing `layout.objects` + `decks` fields map to the new `ComponentSet` structure
- `instantiateScenario()` refactored to operate on `ComponentSet` (shared with standalone loading)
- `ct-scenario@1` files still load correctly (migration/adapter in loader)

### Acceptance criteria:
- [ ] `ct-scenario@2` schema uses `ComponentSet` for its layout
- [ ] `ct-scenario@1` files continue to load (backward compatible adapter)
- [ ] `instantiateScenario()` delegates to a shared `instantiateComponentSet()` function
- [ ] Existing scenario loading (including testgame) still works end-to-end
- [ ] Existing unit tests pass; new tests for the adapter layer

---

## Task 3: ComponentSet resolution and instantiation

**Files:** `app/src/content/componentSet.ts` (new), refactored from `instantiate.ts`

Extract and generalize the instantiation logic so it operates on `ComponentSet`.

### Functions:
```typescript
// Expand deck references, normalize cards arrays
resolveComponentSet(set: ComponentSet, gameAssets: GameAssets): ResolvedComponentSet

// Convert resolved set to TableObjects with positions
instantiateComponentSet(set: ResolvedComponentSet, gameAssets: GameAssets, origin: Position): Map<string, TableObject>
```

### `resolveComponentSet()`:
- For stacks with `deck`: expand via `expandDeck()` → populate `cards`
- For stacks with `cards`: pass through
- Validate all refs (card codes, token/counter/mat/zone refs) exist in gameAssets
- Warn and skip missing refs

### `instantiateComponentSet()`:
- Convert each item to the appropriate `TableObject` subtype
- Position using row-based layout (see Task 4)
- Generate unique IDs, sort keys

### Acceptance criteria:
- [ ] `resolveComponentSet()` expands deck references correctly
- [ ] `resolveComponentSet()` passes through pre-expanded cards
- [ ] `resolveComponentSet()` validates refs and warns on missing
- [ ] `instantiateComponentSet()` creates correct TableObject subtypes
- [ ] Shared by scenario loading and standalone component set loading
- [ ] Unit tests: resolution with deck refs, pre-expanded cards, mixed, missing refs

---

## Task 4: Row-based layout positioning

**Files:** `app/src/content/componentSetLayout.ts` (new)

Position all objects from a component set using row hints.

### Design:
- Each item can specify a `row` number (0-based)
- Items with the same `row` placed side-by-side horizontally
- Rows stacked vertically
- No `row` specified → default to row 0 (single row)
- Position relative to an origin point (viewport center by default)
- Spacing based on object dimensions from assets

### Layout example:
```
Row 0: [Hero]  [Main Deck]  [Threat Counter]
Row 1: [Nemesis Deck]  [Obligation Deck]
```

### Acceptance criteria:
- [ ] Items without `row` default to row 0
- [ ] Same-row items spaced horizontally with padding
- [ ] Multiple rows spaced vertically
- [ ] Handles mixed object types in the same row
- [ ] Positions are world coordinates relative to origin
- [ ] Unit tests: single row, multi-row, mixed types, single item

---

## Task 5: Plugin manifest — componentSets field

**Files:** `shared/src/content-types.ts`, `app/src/content/pluginLoader.ts`

Update plugin manifest to support an optional `componentSets` array.

### Plugin manifest addition:
```json
{
  "componentSets": [
    {
      "id": "rhino-encounter",
      "name": "Rhino Encounter Set",
      "stacks": [
        { "label": "Encounter Deck", "deck": { "cardSets": ["rhino-cards"], "shuffle": true }, "faceUp": false }
      ]
    },
    {
      "id": "marvelcdb-import",
      "name": "Import from MarvelCDB",
      "apiImport": {
        "apiEndpoints": { "public": "https://marvelcdb.com/api/public/decklist/{deckId}" },
        "parserModule": "deckImport.js",
        "labels": { "siteName": "MarvelCDB", "inputPlaceholder": "Enter deck ID" }
      }
    }
  ]
}
```

### Acceptance criteria:
- [ ] `PluginManifest` type includes optional `componentSets: ComponentSetEntry[]`
- [ ] `loadPlugin()` reads and returns component set entries
- [ ] Plugins without `componentSets` continue to work unchanged
- [ ] Static entries validated for required fields; API entries validated for endpoint + parser
- [ ] Unit tests for manifest loading with/without componentSets

---

## Task 6: Web Worker sandbox for API parsers

**Files:** `app/src/content/deckImportWorker.ts` (new), `app/src/content/DeckImportSandbox.ts` (new)

Build the Web Worker loading and communication layer for API-backed component sets.

### Design:
- `DeckImportSandbox` class manages Worker lifecycle
- Loads plugin's parser module via `importScripts()` inside the worker
- Sends `{ apiResponse, gameAssets }` via `postMessage`
- Receives `ComponentSet` back from worker
- Enforces timeout (10s) to prevent hung workers
- Terminates worker after each import

### Worker contract (what plugin authors implement):
```typescript
// Plugin exports this function (runs in Worker context)
function parseDeckResponse(
  apiResponse: unknown,
  gameAssets: GameAssets
): ComponentSet
```

### Acceptance criteria:
- [ ] Worker loads plugin JS from URL via `importScripts()`
- [ ] Worker sends/receives typed messages (DeckImportRequest → ComponentSet)
- [ ] Timeout terminates worker after 10s with error
- [ ] Worker terminated after each import completes
- [ ] Errors in plugin code caught and reported (not silent)
- [ ] Unit tests verify message passing with mock parser

---

## Task 7: DeckImportEngine — API import orchestration

**Files:** `app/src/content/DeckImportEngine.ts` (new)

Orchestrates the API import flow: fetch → worker → resolve → instantiate → store.

### API:
```typescript
async function importFromApi(options: {
  deckId: string;
  isPrivate: boolean;
  apiImport: PluginApiImport;
  pluginBaseUrl: string;
  gameAssets: GameAssets;
  store: YjsStore;
}): Promise<{ name?: string; objectCount: number } | { error: string }>
```

### Flow:
1. Build API URL: replace `{deckId}` in template
2. `fetch()` the endpoint, handle errors
3. Create `DeckImportSandbox`, send response + gameAssets
4. Receive `ComponentSet` from worker
5. `resolveComponentSet()` — validate refs (shared with static path)
6. `instantiateComponentSet()` — create TableObjects (shared with static path)
7. Add to YjsStore inside a transaction
8. Return summary

### Acceptance criteria:
- [ ] Fetches correct endpoint (public vs private)
- [ ] Handles fetch errors gracefully (network, 404, invalid JSON)
- [ ] Uses shared `resolveComponentSet()` and `instantiateComponentSet()`
- [ ] Returns error messages (not throws) for UI to display
- [ ] Unit tests with mocked fetch and worker

---

## Task 8: Standalone component set loading

**Files:** `app/src/content/componentSetLoader.ts` (new)

Load a static component set from the plugin manifest onto the table.

### API:
```typescript
async function loadStaticComponentSet(options: {
  entry: ComponentSetEntry;   // The static entry from plugin manifest
  gameAssets: GameAssets;
  store: YjsStore;
}): Promise<{ objectCount: number } | { error: string }>
```

### Flow:
1. Read the `ComponentSet` from the entry (it's inline JSON)
2. `resolveComponentSet()` — expand deck refs, validate (shared)
3. `instantiateComponentSet()` — create TableObjects (shared)
4. Add to YjsStore inside a transaction

### Acceptance criteria:
- [ ] Resolves deck references via `expandDeck()`
- [ ] Uses same `resolveComponentSet()` and `instantiateComponentSet()` as API path
- [ ] Handles missing card/asset refs gracefully
- [ ] Unit tests with sample static component sets

---

## Task 9: Component Set Modal — React UI

**Files:** `app/src/components/ComponentSetModal.tsx` (new)

A modal triggered from the command palette showing all available component sets.

### Design:
- Built with Headless UI `Dialog`
- Lists all `componentSets` from the loaded plugin
- **Static sets**: Click to load immediately (or with confirmation)
- **API sets**: Click reveals deck ID input field, public/private toggle, submit button
- Loading spinner during import
- Error display inline
- Closes on success
- Extensible for future search/preview features

### Acceptance criteria:
- [ ] Modal lists all component sets with names
- [ ] Static sets load on click via `loadStaticComponentSet()`
- [ ] API sets show deck ID input + submit via `importFromApi()`
- [ ] Loading state shown during both static and API loading
- [ ] Error messages displayed inline on failure
- [ ] Accessible: focus trap, Escape to close, keyboard nav
- [ ] Private deck checkbox only shown when private endpoint exists

---

## Task 10: Dynamic action registration

**Files:** `app/src/actions/registerDefaultActions.ts`, `app/src/content/loadScenarioHelper.ts`

When a plugin with `componentSets` is loaded, register a "Load Components" command palette action.

### Design:
- After plugin content loads, check if `componentSets` exists and is non-empty
- Register action: `load-components-{pluginId}` with label "Load Components"
- Action opens `ComponentSetModal` with the plugin's component set entries
- Action only available when game assets are loaded
- Clear action on table reset / content unload

### Acceptance criteria:
- [ ] Action registered dynamically when plugin has componentSets
- [ ] Action opens ComponentSetModal with correct entries
- [ ] Action removed on table reset
- [ ] No action registered for plugins without componentSets

---

## Task 11: Marvel Champions plugin — component sets + API parser

**Files:** `/Users/erlloyd/Code/cardtable-plugin-marvelchampions/` (local repo)

Add `componentSets` to plugin manifest: encounter sets as static, MarvelCDB import as API.

### Static component sets (examples):
- "Rhino Encounter Set" — encounter deck + main scheme from cardSets
- "Klaw Encounter Set" — same pattern
- Other villain encounter sets

### API parser (`deckImport.js`):
Adapt from v1 source files:
- `cardtable/src/game-modules/marvel-champions/getMarvelCards.ts` — deck parsing, nemesis/obligation extraction
- `cardtable/src/game-modules/marvel-champions/MavelChampionsGameModule.ts` — `parseDecklist()` orchestration

The parser receives v2's `GameAssets` (not v1's `CardData`), so card lookups use the v2 asset pack structure (e.g. `gameAssets.cards[code]` with `type`, `extraInfo.setCode`, etc.). This type mapping from v1 → v2 is part of the porting work.

1. Extract `hero_code` from MarvelCDB API response
2. Extract `slots` → expand by quantity for main deck
3. Build hero stack (identity cards)
4. Build nemesis deck (encounter cards in hero's set, looked up via `gameAssets`)
5. Build obligation deck (obligation-typed cards in hero's set)
6. Return `ComponentSet` with stacks across rows + optional tokens

### Acceptance criteria:
- [ ] Plugin manifest has `componentSets` with static encounter sets
- [ ] Plugin manifest has API-backed set for MarvelCDB import
- [ ] Parser handles MarvelCDB public decklist response
- [ ] Parser extracts hero, main deck, nemesis, obligation stacks with row hints
- [ ] Parser handles edge cases (missing hero_code, empty slots)
- [ ] Tested with captured MarvelCDB API responses as fixtures

---

## Task 12: Arkham Horror LCG plugin — component sets + API parser

**Files:** In the Arkham plugin repo (external, may need to create)

Adapt from v1 source files:
- `cardtable/src/game-modules/arkham-horror-card-game/getArkhamCards.ts`
- `cardtable/src/game-modules/arkham-horror-card-game/ArkhamHorrorCardGameModule.ts`

Same v1→v2 type mapping work as Task 11 (parser uses v2 `GameAssets`, not v1 `CardData`).

### Acceptance criteria:
- [ ] Static encounter sets defined in manifest
- [ ] API import from ArkhamDB with parser
- [ ] Parser extracts investigator + main deck
- [ ] Tested with captured ArkhamDB fixtures

---

## Task 13: LOTR LCG plugin — component sets + API parser

**Files:** In the LOTR plugin repo (external, may need to create)

Adapt from v1 source files:
- `cardtable/src/game-modules/lotr-lcg/getLOTRCards.ts`
- `cardtable/src/game-modules/lotr-lcg/LOTRLCGGameModule.ts`

Same v1→v2 type mapping work as Task 11.

### Acceptance criteria:
- [ ] Static encounter/quest sets defined in manifest
- [ ] API import from RingsDB with parser
- [ ] Parser extracts heroes, main deck, sideboard
- [ ] Tested with captured RingsDB fixtures

---

## Testing Plan

### Unit Tests (Vitest)

| Area | What to test |
|------|-------------|
| `resolveComponentSet()` | Deck ref expansion, pre-expanded passthrough, mixed, missing refs |
| `instantiateComponentSet()` | Creates correct TableObject subtypes for all 5 object types |
| `componentSetLayout` | Row positioning: single/multi-row, mixed types, defaults |
| `DeckImportSandbox` | Worker message passing, timeout, error handling |
| `DeckImportEngine` | Full API flow with mocked fetch + worker; error cases |
| `loadStaticComponentSet()` | Static loading with deck refs; error cases |
| Scenario adapter | `ct-scenario@1` → `ct-scenario@2` migration |

### E2E Tests (Playwright) — deferred, not in initial scope

### Manual Testing

- [ ] Import a real Marvel Champions deck from MarvelCDB — all cards present
- [ ] Load a static encounter set — correct cards, shuffled if specified
- [ ] Import on a table with existing objects — no overlap
- [ ] Import in multiplayer — appears for both players (Yjs sync)
- [ ] Deck with cards missing from asset pack — warning shown
- [ ] `ct-scenario@1` testgame still loads correctly

---

## Implementation Order

1. **Task 1** — Shared types (foundation)
2. **Task 2** — Refactor scenario schema to use ComponentSet
3. **Task 3** — ComponentSet resolution + instantiation (shared core)
4. **Task 4** — Row-based layout positioning
5. **Task 5** — Plugin manifest componentSets field
6. **Task 6** — Web Worker sandbox
7. **Task 7** — API import engine
8. **Task 8** — Static component set loading
9. **Task 9** — Component Set Modal UI
10. **Task 10** — Dynamic action registration
11. **Task 11** — Marvel Champions plugin (first real integration)
12. **Tasks 12-13** — Arkham + LOTR plugins

Tasks 4 and 6 can be developed in parallel. Tasks 7 and 8 can be developed in parallel (both depend on Task 3).

---

## Files to Create/Modify (cardtable2 repo)

| File | Action |
|------|--------|
| `shared/src/content-types.ts` | Modify — add ComponentSet types, PluginApiImport, update Scenario |
| `app/src/content/componentSet.ts` | Create — resolveComponentSet, instantiateComponentSet |
| `app/src/content/componentSetLayout.ts` | Create — row-based positioning |
| `app/src/content/componentSetLoader.ts` | Create — static component set loading |
| `app/src/content/deckImportWorker.ts` | Create — Web Worker entry point |
| `app/src/content/DeckImportSandbox.ts` | Create — Worker lifecycle manager |
| `app/src/content/DeckImportEngine.ts` | Create — API import orchestration |
| `app/src/content/instantiate.ts` | Modify — refactor to delegate to componentSet.ts |
| `app/src/content/loader.ts` | Modify — ct-scenario@1 adapter, scenario@2 support |
| `app/src/content/pluginLoader.ts` | Modify — read componentSets from manifest |
| `app/src/components/ComponentSetModal.tsx` | Create — React modal UI |
| `app/src/actions/registerDefaultActions.ts` | Modify — dynamic action registration |
| `app/src/content/loadScenarioHelper.ts` | Modify — wire up action registration |

---

## Future Extensions (not in scope)

- Deck search by name within the modal
- Deck preview before importing
- Deck text/code import (paste mode)
- Deck URL parsing (extract ID from full URL)
- Save/recall previously imported decks
- Per-player deck slots in multiplayer
