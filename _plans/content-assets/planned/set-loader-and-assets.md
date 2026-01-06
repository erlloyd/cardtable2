# Milestone 4 — Set Loader & Assets

## Overview
Implement the content loading system for game sets, including JSON validation, asset management, and texture caching.

## Prerequisites
- Milestone 3 completed (Yjs local data model)

## Set JSON Format (v1)
```jsonc
{
  "schema": "ct-set@1",
  "id": "mygame-core-001",
  "name": "My Game — Core Set",
  "version": "1.0.0",
  "back": "https://.../backs/default.jpg",
  "cards": {
    "01020": { "face": "https://.../01020.jpg" },
    "01021": { "face": "https://.../01021.jpg", "back": "https://.../backs/alt.jpg" }
  },
  "tokens": {
    "damage": { "image": "https://.../tokens/damage.png", "size": [64, 64] }
  },
  "counters": {
    "round": { "label": "Round", "min": 0, "max": 99, "start": 1 }
  },
  "mats": {
    "table": { "image": "https://.../mats/cloth.jpg", "size": [1920, 1080] }
  },
  "decks": {
    "main": [
      { "id": "01020", "count": 3 },
      { "id": "01021", "count": 2 }
    ]
  },
  "zones": {
    "discard": { "rect": [1400, 300, 220, 320] }
  },
  "layout": {
    "objects": [
      { "type": "mat", "ref": "table", "pos": {"x": 0, "y": 0}, "z": -1000 },
      { "type": "stack", "id": "deckA", "label": "Deck", "pos": {"x": 240, "y": 420},
        "faceUp": false, "cards": ["01020","01020","01020","01021","01021"] }
    ]
  }
}
```

## Status
**Partially Complete** - Initial content loading system implemented (2026-01-03, PR #50)

## Completed Work

### Content Type System (shared/src/content-types.ts)
- ✅ AssetPack type (ct-assets@1): cards, tokens, counters, mats, card types
- ✅ Scenario type (ct-scenario@1): layout, decks, pack references
- ✅ Card type inheritance (shared back/size from cardType)
- ✅ Standard size enums with custom override support
- ✅ MergedContent and ResolvedCard types for runtime

### Content Loader (app/src/content/)
- ✅ loadAssetPack/loadScenario: Fetch and validate JSON from URLs
- ✅ mergeAssetPacks: Merge multiple packs (last-wins strategy)
- ✅ resolveCard: Apply type inheritance and URL resolution
- ✅ expandDeck: Expand cardSets and individual cards with counts
- ✅ instantiateScenario: Create TableObjects from layout definitions
- ✅ loadCompleteScenario: High-level API for full scenario loading

### Game Loading Integration
- ✅ Updated GameSelect to pass gameId via URL search params
- ✅ Updated Table route to load scenario when gameId present
- ✅ Auto-loads content on first table open (skips if table has objects)
- ✅ Loading/error states with user feedback

### Test Content
- ✅ testgame-core.json: 17 cards, 2 card sets, 1 token
- ✅ testgame-basic.json: Scenario with 2 decks
- ✅ Updated gamesIndex.json

## Remaining Work

### M4-T1: JSON Schema + Formal Validation
**Objective:** Add formal JSON Schema validation for content files.

**Spec:**
- JSON Schema v1 definition files (`ct-assets@1.schema.json`, `ct-scenario@1.schema.json`)
- Runtime validation function with detailed error messages
- Schema validation on load (development mode)

**Note:** Current implementation has TypeScript types but no runtime schema validation.

**Deliverables:**
- JSON Schema files
- `validateAssetPack()` and `validateScenario()` functions
- Error reporting utilities

**Test Plan:**
- Unit: valid fixtures pass validation
- Unit: invalid fixtures produce expected errors

### M4-T2: Namespacing & Instantiation
**Status:** ✅ **Complete** (mostly)

**Completed:**
- ✅ Namespace pattern: `<packId>/<cardCode>`
- ✅ Multi-pack merging (last-wins strategy)
- ✅ Layout instantiation to Y.Doc via `instantiateScenario()`
- ✅ Deterministic `_sortKey` generation
- ✅ Z-order handling for mats

**Remaining:**
- Additional testing for edge cases
- Performance profiling for large scenarios

### M4-T3: Asset Loader (Simplified)
**Objective:** Implement on-demand texture loading with extensible API for future enhancements.

**Dependencies:** M4-T2

**Design Decisions:**
- **gameId Storage**: Store in Y.Doc metadata map (`metadata.set('gameId', 'testgame')`)
- **gameId Transfer**: Use TanStack Router location state (not URL params, not sessionStorage)
- **Loading Strategy**: On-demand (Option B) - load textures as objects are rendered
- **Caching**: Rely on PixiJS internal texture cache and browser HTTP cache
- **Offline Support**: Deferred to future (background preloading + IndexedDB)

**Use Cases:**
1. **New Table**: GameSelect → store gameId in Y.Doc → load all asset packs → (wait for user to select scenario)
2. **Browser Refresh**: Y.Doc reconnects → read gameId from metadata → load all asset packs → (table already has objects or waiting for scenario)
3. **Load Scenario Action**: User triggers global action → instantiate first scenario → textures load as objects render
4. **Reset Table Action**: User triggers global action → clear all objects from Y.Doc
5. **Close Table Action**: User triggers global action → navigate back to GameSelect screen

**Spec (Phase 1 - Simple):**
```typescript
interface TextureLoader {
  // Load texture for immediate use
  requestTexture(url: string): Promise<Texture>;
}
```

**Implementation:**
- Simple fetch + `createImageBitmap` + PixiJS `Texture.from()`
- No reference counting (PixiJS handles it)
- No LRU eviction (browser memory pressure handles it)
- No background preloading (add later)

**Future Evolution Path:**
1. Add `preloadTextures(urls: string[], priority?: 'high' | 'low')` for background loading
2. Add priority queue (visible objects loaded first)
3. Add IndexedDB persistence for offline play
4. Add reference counting if memory issues arise
5. Add LRU eviction if needed

**Deliverables:**

**Pack & Scenario Management:**
- Store gameId in Y.Doc metadata on table creation
- Transfer gameId from GameSelect using TanStack Router location state
- Auto-load all asset packs when table opens (new or refresh, based on gameId in metadata)
- If pack loading fails: log error and leave table in current state (no toast UI yet)
- Do NOT auto-instantiate scenarios (games have multiple scenarios)
- Do NOT track scenarioId in metadata (deferred to future)

**Global Actions:**
- **"Load Scenario"**: Instantiates first scenario for current game (adds objects on top, no clearing)
- **"Reset Table"**: Clears all objects from Y.Doc (no confirmation for now)
- **"Close Table"**: Navigates back to GameSelect with confirmation prompt

**Texture Loading:**
- TextureLoader service with extensible API
- Integration with renderer (call requestTexture during sprite creation)
- Loading state handling (placeholders while textures load)

**Test Plan:**
- Unit: mock fetch and verify texture creation
- Unit: handle failed image loads gracefully
- Integration: textures load as objects appear on screen
- Manual: verify browser refresh reloads textures correctly