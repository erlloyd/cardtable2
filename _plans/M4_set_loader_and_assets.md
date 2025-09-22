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

## Tasks

### M4-T1: JSON Schema + Types
**Objective:** Create JSON schema definition and TypeScript types for set format validation.

**Dependencies:** M3 complete

**Spec:**
- JSON Schema v1 definition (`set-v1.schema.json`)
- TypeScript types generated/aligned with schema
- Validation function with detailed error messages
- Support for all content types (cards, tokens, counters, mats, zones)

**Deliverables:**
- `set-v1.schema.json` schema file
- `types.ts` with Set type definitions
- `validateSetJson()` function
- Error reporting utilities

**Test Plan:**
- Unit: valid fixtures pass validation
- Unit: invalid fixtures produce expected errors
- Unit: all content types properly typed

### M4-T2: Namespacing & Instantiation
**Objective:** Load sets with proper namespacing and instantiate layout objects.

**Dependencies:** M4-T1

**Spec:**
- Namespace pattern: `<setId>/<localId>`
- Multi-set union: merge catalogs, concatenate layouts
- Materialize `layout.objects` into Y.Doc
- Deterministic `_sortKey` generation
- Z-order handling for mats

**Deliverables:**
- Set loading and merging logic
- Namespace utilities
- Layout instantiation to Y.Doc
- Sort key generation algorithm

**Test Plan:**
- Unit: verify counts, IDs, and positions
- Unit: multi-set loading produces correct union
- E2E: instantiated objects persist across reloads
- Unit: deterministic sort key generation

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