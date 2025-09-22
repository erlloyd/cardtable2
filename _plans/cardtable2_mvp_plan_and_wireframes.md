# Cardtable 2.0 — MVP Project Plan & UI Wireframe Spec

_Last updated: 2025‑09‑21_

## TL;DR
Build a **solo‑first** card table that works offline, can be **promoted to multiplayer**, and renders **smoothly at 60 fps** on mid‑range mobile and desktops. Keep content **manifest‑only** (no rules), with **sets** as standalone JSON files. Multiplayer uses **Yjs + y‑websocket** with **server‑persisted docs (30‑day TTL)**. UI is **full‑bleed board** with minimal chrome, responsive for **portrait & landscape**.

---

## 1) MVP Goals & Non‑Goals

### Goals
- Smooth 2D board with cards/tokens; **60 fps target** across defined scenes.
- **Solo‑first** with optional **Start Multiplayer**.
- **Local‑first** tables; **promote** to server‑backed rooms.
- **Offline cold‑start** (shell + board) and play previously loaded sets.
- **Manifest‑only** content: **Set JSON v1** (catalog + optional layout).

### Non‑Goals (MVP)
- No authentication, discovery/lobbies, private hands, or code plugins.
- No complex prefetching/smart chunking beyond basic lazy imports.

---

## 2) Architecture (frozen)

### Frontend
- **React + TypeScript**
- **PixiJS v8** + **@pixi/react** for the board
- **pixi‑viewport** (camera/pan/zoom), **RBush** (spatial index)
- **OffscreenCanvas** renderer in a Web Worker (feature‑detected; fallback: main thread)
- **Vite** build; minimal code‑splitting: `App shell` → lazy `Board module` → per‑game set data
- **PWA SW**: precache **app shell + board module**; runtime cache for sets/assets on first use
- **IndexedDB**: local Y.Doc + cached sets

### Backend
- **y‑websocket** server
- **Server‑persisted Y.Doc** with **30‑day expiry** after last activity
- Minimal API: create/join room, WebSocket transport; no auth

### Data Model (Y.Doc)
- `objects`: Y.Map keyed by id → values are Y.Map with fields:
  - `_kind`: `"card" | "stack" | "token" | "zone" | "mat"`
  - `_containerId`: string | null
  - `_pos`: `{ x, y, r }` in **absolute world coordinates**
  - `_sortKey`: fractional index string for ordering
  - `_locked`: boolean
  - `_selectedBy`: `actorId | null` (**exclusive selection**, persisted)
  - `_meta`: Y.Map (freeform)
- **Awareness** (ephemeral):
  - Live drag ghosts for **all selected items** at **30 Hz**
  - Cursors, hovers, lasso rect, tool mode

### Multiplayer semantics
- **Promote** local table → server room (URL swap to `/table/<roomId>`)
- **Exclusive selection**: selection fails on objects owned by another user; **manual “Clear All Selections”**
- **Last‑write‑wins** for conflicts at field level (Yjs)

### Performance targets (v1)
- **60 fps** on mobile/desktop for common interactions
- **Worst‑case dips** ≥45 fps for ≤300 ms during heavy animations
- **Pointer‑to‑visual latency** ≤30 ms; **hit‑test** ≤2 ms/event on mid‑range mobile
- **Board sizes**: standard **300 items**; big‑board **500 items** upper limit

### Input fidelity
- **Drag slop**: touch **12 px**, pen **6 px**, mouse **3 px**
- **Gestures**: pan, pinch‑zoom, lasso select, drag/move, flip, rotate

---

## 3) Content Format — Set JSON v1 (locked)

Each set is a **single JSON file**; no JS transforms.

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
      { "type": "stack", "id": "deckA", "label": "Deck", "pos": {"x": 240, "y": 420}, "faceUp": false,
        "cards": ["01020","01020","01020","01021","01021"] },
      { "type": "token", "ref": "damage", "count": 10, "pos": {"x": 1100, "y": 420} },
      { "type": "counter", "ref": "round", "pos": {"x": 60, "y": 60} }
    ]
  }
}
```

**Multi‑set loading**
- Catalog sections unioned; ids namespaced `<setId>/<localId>`
- All layouts instantiated in load order (mats use z‑depth)

---

## 4) UI Wireframe Spec (MVP)

### Screens
1) **Game Select**
2) **Table**
3) **Start Multiplayer** (modal)

### Common
- Full‑bleed board; responsive portrait/landscape
- 44×44 px touch targets; high contrast; skeleton loaders

#### 4.1 Game Select
```
+-----------------------------------------------------------+
| Cardtable 2.0                                  [ About ]  |
+-----------------------------------------------------------+
|  Game                                                    v|
|  [ Fake Game ]                                            |
|                                                           |
|  [ Open Table ]                                           |
+-----------------------------------------------------------+
```

#### 4.2 Table
```
┌───────────────────────────────────────────────────────────┐
│ Cardtable 2.0                         [⋯]                 │
├───────────────────────────────────────────────────────────┤
│   (Full‑bleed Pixi board canvas)                          │
│                                         ○                 │
│                                        ○ ○                │
└───────────────────────────────────────────────────────────┘
```

#### 4.3 Start Multiplayer (Modal)
```
+---------------- Start Multiplayer ----------------+
| Anyone with the link can join this table.         |
|                                                   |
|  [ Start ]                          [ Cancel ]    |
+---------------------------------------------------+
```

---

## 5) Milestones (sequence)

1. Scaffold (Vite app + Node y‑websocket server)
2. Board core (Pixi in worker, camera, hit‑test)
3. Local Yjs (schema, IDB persistence, actions, selection, awareness)
4. Set loader + assets (schema, namespacing, textures/LRU)
5. Multiplayer (promotion flow, server persistence)
6. Offline (SW precache + runtime caching)
7. Mobile polish (responsive/touch)
8. MVP QA (perf matrix, memory, edge cases)
