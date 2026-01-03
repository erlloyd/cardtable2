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

### M4-T3: Asset Loader & LRU
**Objective:** Implement efficient texture loading with LRU cache management.

**Dependencies:** M4-T2

**Spec:**
- `requestTexture(url)` / `releaseTexture(handle)` API
- Use `createImageBitmap` when available
- LRU eviction when cache full
- Proper texture destruction on eviction
- Reference counting for shared textures

**Deliverables:**
- Texture loader service
- LRU cache implementation
- Reference counting system
- Memory management utilities

**Test Plan:**
- Unit: mock decode and verify request/release
- Unit: LRU eviction behavior
- Unit: texture destruction on eviction
- Integration: memory usage stays within limits
- Performance: texture loading doesn't block main thread