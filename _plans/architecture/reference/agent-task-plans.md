# Cardtable 2.0 — Agent‑Ready Development Task Plans (MVP)

_Atomic tasks with objectives, dependencies, specs, and test plans. No implementations._

**Target layout**
```
/app/
  src/
    app-shell/
    board/
    sets/
    y/
    ui/
  public/assets/fake-game/
  service-worker.ts
  vite.config.ts
/server/
  src/
    storage/
    index.ts
```
---

## Milestone 0 — Repo & Tooling

### M0‑T1: Initialize Monorepo + Toolchain
**Objective:** Create `app/` (Vite React TS) and `server/` (Node) workspaces.
**Deliverables:** PNPM workspaces, scripts (`dev/build/test`), ESLint+Prettier, TS strict.
**Test:** `pnpm -w run validate` passes; both packages build.

### M0‑T2: CI Pipeline
**Objective:** GitHub Actions running lint, type‑check, tests, builds.
**Deliverables:** `.github/workflows/ci.yml` with Node 20/22 matrix.
**Test:** CI artifacts for `app/dist`, `server/dist` uploaded.

### M0‑T3: Commit Hooks
**Objective:** Husky + lint‑staged; pre‑push typecheck.
**Test:** Bad formatting auto‑fixed; type errors block push.

---

## Milestone 1 — App Shell & Navigation

### M1‑T1: Routes & Lazy Board
**Objective:** `/` Game Select, `/table/:id` Table; `Board` via `import()`.
**Spec:** `/table/local-<uuid>` generated on “Open Table”.
**Test:** Playwright: navigate and see Board placeholder.

### M1‑T2: Game Index & Combobox
**Objective:** `gamesIndex.json` with Fake Game; combobox renders.
**Test:** Unit: options parse/render; selection state updates.

---

## Milestone 2 — Board Core

### M2‑T1: Pixi Mount + Worker Detection
**Objective:** OffscreenCanvas worker path with fallback.
**Contract:** Worker `postMessage({type:'init', canvas, width, height, dpr})`.
**Test:** Unit: feature detection; E2E: canvas renders bg in both modes.

### M2‑T2: Camera (pixi‑viewport) & Gestures
**Spec:** Zoom range [0.5,2.0]; slop touch 12, pen 6, mouse 3.
**Test:** E2E: pan/zoom changes world; smooth at 60fps with empty scene.

### M2‑T3: Scene Model + RBush Hit‑Test
**Spec:** Types for `_kind/_pos/_sortKey`; point/rect queries; topmost order.
**Test:** Unit: deterministic results; microbench O(log n + k).

---

## Milestone 3 — Yjs (Local)

### M3‑T1: Y.Doc Schema + IndexedDB
**Spec:** `objects` map with `_kind,_containerId,_pos,_sortKey,_locked,_selectedBy,_meta`.
**Test:** E2E: reload restores state offline.

### M3‑T2: Engine Actions
**Spec:** `createObject`, `moveObjects`, `flipCards`, `rotateObjects`, `stackObjects`, `unstack` (txn per action).
**Test:** Unit: apply to fresh doc; assert fields.

### M3‑T3: Selection Ownership + Clear All
**Spec:** `selectObjects`, `unselectObjects`, `clearAllSelections({excludeDragging:true})`.
**Test:** Unit: two actors contend; clear frees all non‑dragging.

### M3‑T4: Awareness (Cursors + Drag Ghosts)
**Spec:** 30Hz; payloads `{cursor:{x,y}}` and `{drag:{gid,ids,anchor,dx,dy,dr,ts}}`; lerp on receive.
**Test:** Two‑tab local loop; latency <150ms observed.

---

## Milestone 4 — Set Loader & Assets

### M4‑T1: JSON Schema + Types
**Spec:** `set-v1.schema.json`, `types.ts`, `validateSetJson()`.
**Test:** Unit: valid/invalid fixtures produce expected results.

### M4‑T2: Namespacing & Instantiation
**Spec:** Namespace `<setId>/<localId>`; materialize `layout.objects`; deterministic `_sortKey`.
**Test:** Unit: counts/ids/positions; E2E: persisted across reloads.

### M4‑T3: Asset Loader & LRU
**Spec:** `requestTexture(url)` / `releaseTexture(handle)`; `createImageBitmap` when available; destroy on eviction.
**Test:** Unit: mock decode; verify LRU and destruction; integration memory sanity.

---

## Milestone 5 — Multiplayer Server

### M5‑T1: WS Server Scaffold
**Spec:** `wss://host/ws?room=<roomId>`; `GET /health` returns `{ok:true}`.
**Test (API):** Two clients join same room and exchange y‑updates.

### M5‑T2: Persistence Adapter
**Spec:** `loadDoc`, `appendUpdate`, `deleteRoom`, `touch` (LevelDB default).
**Test (API):** Restart server → state restored; order preserved.

### M5‑T3: TTL Sweeper
**Spec:** Prune rooms with last activity > TTL (30 days default).
**Test:** TTL set small; verify deletion.

---

## Milestone 6 — Frontend Multiplayer

### M6‑T1: Promote to Multiplayer
**Spec:** Create `roomId` (ULID), connect to `/ws?room=...`, swap to `/table/<roomId>`, copy local state to server.
**Test (E2E):** Two browsers: promote + join → same state visible.

### M6‑T2: Awareness Bridge & Cursors
**Spec:** Color per actor; 30Hz throttling; drop late frames.
**Test (E2E):** Drag in one browser → ghost in the other within ~150ms.

---

## Milestone 7 — Offline

### M7‑T1: SW Precache (Shell + Board)
**Spec:** Precache HTML, main, board chunk; register SW.
**Test (E2E):** After first visit, offline reload works.

### M7‑T2: Runtime Cache (Sets & Images)
**Spec:** Cache‑first for `/sets/**` and `/assets/**`; size limits; offline “not cached” toast.
**Test (E2E):** Used set loads offline; new set fails with message.

---

## Milestone 8 — Mobile & Input Polish

### M8‑T1: Responsive Layout
**Spec:** Portrait + landscape; ≥44px targets; FAB stack on small screens.
**Test:** Device profiles (iPhone/Pixel) in Playwright.

### M8‑T2: Pointer Slop
**Spec:** Apply 12/6/3 px thresholds by pointer type.
**Test:** Unit: synthetic sequences; drag starts only beyond threshold.

---

## Milestone 9 — Perf & QA

### M9‑T1: Perf Scene Generator
**Spec:** Dev command: spawn N=300/500 objects with seed.
**Test:** Unit: deterministic output; manual FPS check.

### M9‑T2: Hit‑Test Microbench
**Spec:** Dev HUD shows avg/95p ms per event.
**Test:** Manual: ≤2ms avg on mid‑range mobile @ 300 items.

---

## Milestone 10 — Packaging & Docs

### M10‑T1: Server Container & Runbook
**Spec:** Dockerfile + compose; envs `PORT`, `STORAGE_PATH`, `ROOM_TTL_DAYS`.
**Test:** `docker compose up`; `/health` OK; WS connects.

### M10‑T2: Frontend Deploy Docs
**Spec:** `/docs/deploy.md` with steps for static hosts; server URL env.
**Test:** Follow doc to deploy preview; app connects to server.
