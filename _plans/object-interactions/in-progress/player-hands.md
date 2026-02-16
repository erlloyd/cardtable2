# Player Hands Feature Plan

## Context

Cardtable 2.0 currently has no concept of a player's "hand" — all cards exist as objects on the shared board canvas. For card games, players need a private area to hold cards they've drawn. The MVP explicitly deferred this ("No private hands" in non-goals). This plan adds a hand panel UI at the bottom of the screen where players can manage cards separate from the board, with support for multiple named hands (e.g., controlling two heroes in solo Marvel Champions).

## User Requirements Summary

- **Bottom-of-screen panel** (React DOM, not PixiJS canvas)
- **Fan layout** with horizontal overlap; hover lifts card + shows preview
- **Collapsible** (visible by default, toggle to collapse)
- **Switchable hands** with tabs (e.g., "Hero 1", "Hero 2")
- **Card movement**: drag-and-drop AND context menu between board and hand
- **Drag to reorder** cards within hand
- **Separate `hands` Y.Map** in Y.Doc (cards leave the objects map when entering a hand)
- **Manual hand creation** (player creates/names hands, not scenario-defined)
- **Multiplayer privacy** (future): honor-system, per-hand public/private toggle

---

## Stage 1: Data Model + Hand Panel + Context Menu Actions

**PR-releasable outcome**: Player can create a hand, add cards via context menu, see them in a panel at the bottom, and play them back to the board.

### 1.1 Yjs Data Model

**`app/src/store/YjsStore.ts`** — Add `hands` Y.Map alongside existing `objects` and `metadata`:

```
hands: Y.Map<string, Y.Map>
  "hand-uuid": Y.Map
    "name": string        // "Hero 1"
    "cards": string[]     // Ordered card IDs ["01020", "01021"]
    "visibility": string  // "public" (scaffold for Stage 4)
```

New YjsStore methods (follow existing zero-allocation patterns):
- `createHand(name: string): string` — returns hand ID
- `deleteHand(handId: string): void`
- `getHandCards(handId: string): string[]`
- `addCardToHand(handId, cardId, index?): void`
- `removeCardFromHand(handId, cardIndex): string` — returns card ID
- `onHandsChange(callback): () => void` — deep observer like `onObjectsChange()`

No migration needed — `this.doc.getMap('hands')` is additive; existing tables get an empty map.

**`shared/src/index.ts`** — Add `HandData` interface for type safety.

### 1.2 Hand Actions (board <-> hand transfers)

**`app/src/store/YjsHandActions.ts`** (new) — Atomic transaction functions following `YjsActions.ts` patterns:

- `moveCardToHand(store, stackId, cardIndex, handId, handInsertIndex?)` — Extracts card from stack's `_cards` array (deletes stack if last card), appends to hand. Single Yjs transaction.
- `moveCardToBoard(store, handId, cardIndex, pos, faceUp)` — Removes card from hand, creates new StackObject via `createObject()`. Returns new stack ID.

Reuses: `createObject()` from `YjsActions.ts`, `generateTopSortKey()`, `getDefaultProperties()` from `ObjectDefaults.ts`.

### 1.3 Layout Change

**`app/src/index.css`** — Change `.board-fullscreen` from fixed positioning to flex:

```css
/* FROM: position: fixed; top/left/right/bottom: 0; width: 100vw; height: 100vh */
/* TO: */
.board-fullscreen {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;  /* allow flex shrinking */
}
```

The `.table` parent already has `display: flex; flex-direction: column; height: 100%`. Board takes remaining space; hand panel sits below with fixed height.

Canvas resize is handled automatically — `useCanvasLifecycle.ts` uses a `ResizeObserver` on the container element that fires when flex layout changes.

Fixed-position overlays (GlobalMenuBar z:40, ContextMenu z:99, CommandPalette z:50) are unaffected since they use viewport-relative `position: fixed`.

### 1.4 Hand Panel Component

**`app/src/components/HandPanel.tsx`** (new) — React component:

- **Collapsed state**: Thin bar with toggle chevron + hand name
- **Expanded state**: ~160px tall, shows card thumbnails in a horizontal row (simple row for Stage 1, fan in Stage 2)
- Card images loaded via `use-image` hook (same as `CardPreview.tsx`)
- Image URLs resolved: `gameAssets.cards[cardId].face`
- "Play" button on each card → calls `moveCardToBoard()` placing at center of viewport
- "+" button to create a new hand
- Subscribe to `store.onHandsChange()` for reactive updates

**`app/src/hooks/useHandPanel.ts`** (new) — Manages activeHandId, isCollapsed, hand list state.

### 1.5 Context Menu Action

**`app/src/actions/handActions.ts`** (new) — Register with `ActionRegistry`:

- **"Add to Hand"**: Available when selection has stacks. Moves top card of selected stack to active hand. If no hand exists, auto-creates one named "Hand 1".

**`app/src/actions/types.ts`** — Add `activeHandId?: string` to `ActionContext`.
**`app/src/actions/buildActionContext.ts`** — Accept and pass through `activeHandId`.

### 1.6 Table Route Integration

**`app/src/routes/table.$id.tsx`** — Add HandPanel below Board in the JSX, manage hand state (`activeHandId`, `isCollapsed`), pass `activeHandId` into `buildActionContext`.

### 1.7 Testing

- **Unit**: `YjsHandActions.test.ts` — moveCardToHand, moveCardToBoard atomicity
- **Component**: `HandPanel.test.tsx` — render, collapse/expand, card display
- **E2E**: `e2e/hand-panel.spec.ts` — create hand, add card via context menu, see in panel, play back

---

## Stage 2: Fan Layout + Hover Preview + Drag-and-Drop

**PR-releasable outcome**: Cards display in a polished overlapping fan. Hover shows preview. Drag cards between board and hand.

### 2.1 Fan Layout

**`app/src/components/HandPanel.tsx`** — Replace simple row with fan algorithm:

```typescript
// If cards fit without overlap: space evenly
// If cards need overlap: overlap = (totalCardWidth - availableWidth) / (count - 1)
// Each card: left = startOffset + index * (cardWidth - overlap)
// Minimum visible portion: ~30% of card width
```

Cards rendered as absolutely-positioned `<img>` elements within a relatively-positioned container. Each card gets `z-index: index` so later cards overlap earlier ones.

### 2.2 Hover Animation + Preview

- CSS transition: `transform: translateY(-20px) scale(1.05)` on hover
- Hovered card gets elevated z-index
- Show `CardPreview` component (reuse existing from `app/src/components/CardPreview.tsx`) in hover mode, positioned above the hovered card

### 2.3 Drag: Board -> Hand

A normal board drag that detects drop over the hand panel:

- Board already exposes drag state via `object-drag-started` / `object-drag-ended` messages
- Table route tracks `isBoardDragging` state, passes to HandPanel
- While board is dragging, hand panel shows drop target styling (border glow)
- On `pointerup` over hand panel while `isBoardDragging`: call `moveCardToHand()` with the dragged stack's top card
- Board's drag ends normally (position updates ignored since the card moved to hand)

**`app/src/hooks/useBoardToHandDrop.ts`** (new) — Coordinates drag state between Board and HandPanel via the Table route parent. Listens for `pointerup` on the hand panel element.

### 2.4 Drag: Hand -> Board (Phantom Drag)

**Design principle**: The card must feel and function identically to dragging any board card. This means full board interactions (stack target highlighting, grid snap ghosts) must work during the drag.

**Approach**: DOM ghost for the visual + "phantom drag" messages to the renderer for board interactions. No board object is created until drop.

**Flow**:

1. `pointerdown` + move exceeding slop on a hand card → create a **DOM drag ghost** (absolutely-positioned card image at high z-index) that follows the pointer. The card animates out of the fan (shrink/fade).

2. On each `pointermove`, convert viewport coordinates to world coordinates and send the renderer a new message:
   ```typescript
   { type: 'phantom-drag-move', worldX, worldY }
   ```

3. The renderer's pointer handler processes `phantom-drag-move`:
   - Runs `detectStackTarget()` at (worldX, worldY) — shows stack target highlighting
   - If grid snap enabled, calculates snap position and renders ghost preview
   - Sends feedback to main thread: `{ type: 'phantom-drag-feedback', snapPos?, stackTargetId? }`

4. If grid snap is active, the DOM ghost snaps to the snap position (converted back to viewport coords) for visual consistency.

5. On `pointerup` over the canvas:
   - Use the final world position (or snapped position if grid snap active)
   - If over a stack target: call `moveCardToBoard()` at the target's position, then immediately `stackObjects()` to merge
   - Otherwise: call `moveCardToBoard()` at the drop position
   - Send `{ type: 'phantom-drag-end' }` to renderer to clear feedback
   - Remove DOM ghost

6. On `pointerup` back over the hand panel: cancel, card returns to fan. Send `{ type: 'phantom-drag-end' }` to clean up.

**New renderer messages** (add to `shared/src/index.ts`):

| Direction | Message | Purpose |
|-----------|---------|---------|
| Main → Renderer | `phantom-drag-start` | Begin phantom drag mode |
| Main → Renderer | `phantom-drag-move` | Update phantom position (worldX, worldY) |
| Main → Renderer | `phantom-drag-end` | Clean up phantom drag state |
| Renderer → Main | `phantom-drag-feedback` | Snap position, stack target ID |

**Coordinate conversion**: Board exposes a `viewportToWorld(clientX, clientY): {x, y}` method to the Table route (via callback ref or imperative handle). This reuses the existing `CoordinateConverter.screenToWorld()` logic in `app/src/renderer/managers/CoordinateConverter.ts`.

**Renderer changes** (`app/src/renderer/handlers/pointer.ts`):
- Add handler for `phantom-drag-move`: reuse existing `detectStackTarget()` and grid snap logic, but without a real dragged object in the scene. The phantom drag uses a synthetic "excluded IDs" list (empty, since the card doesn't exist on the board yet).

**Key files**:
- `app/src/components/HandPanel.tsx` — DOM ghost creation, pointer tracking
- `app/src/components/Board.tsx` — expose viewportToWorld, forward phantom messages
- `app/src/routes/table.$id.tsx` — coordinate between HandPanel and Board
- `app/src/hooks/useBoardToHandDrop.ts` (new) — drag state coordination
- `shared/src/index.ts` — new message types
- `app/src/renderer/handlers/pointer.ts` — phantom drag handlers

### 2.5 Testing

- **E2E**: `e2e/hand-drag.spec.ts` — drag from board to hand, drag from hand to board
- **E2E**: Verify stack targeting works during hand-to-board drag (drop onto existing stack)
- **E2E**: Verify grid snap works during hand-to-board drag
- **Visual**: Manual verification of fan layout at various card counts (1, 5, 15, 30)

---

## Stage 3: Multiple Hands + Tabs + Drag-to-Reorder

**PR-releasable outcome**: Multiple named hands with tab switching. Cards reorderable within hand.

### 3.1 Tab Bar

**`app/src/components/HandPanel.tsx`** — Add tab bar above the card fan:

```
[Hero 1] [Hero 2] [+]                    [v collapse]
[       fan of cards for active hand              ]
```

- Active tab highlighted (indigo accent, matching existing UI palette)
- "+" creates new hand (inline rename or prompt)
- Right-click tab → rename, delete (with confirmation if cards present)
- Clicking a tab switches `activeHandId`

### 3.2 Hand Management

**`app/src/store/YjsStore.ts`** — Add `renameHand(handId, newName)`.

### 3.3 Drag-to-Reorder

**`app/src/hooks/useHandReorder.ts`** (new) — Pointer event handlers for reordering:

- `pointerdown` on card starts reorder drag (after slop threshold)
- Card lifts and follows pointer horizontally
- Other cards animate to create insertion gap
- `pointerup` commits reorder via `reorderCardInHand(store, handId, fromIndex, toIndex)`

**`app/src/store/YjsHandActions.ts`** — Add `reorderCardInHand()` — splice operation on the `cards` array in a single transaction.

### 3.4 Context Menu Label Update

When multiple hands exist, "Add to Hand" label shows target: `"Add to Hand (Hero 1)"`. User switches active tab to target a different hand.

### 3.5 Testing

- **Unit**: `reorderCardInHand` test
- **E2E**: `e2e/hand-multi.spec.ts` — create multiple hands, switch between them, reorder cards

---

## Stage 4: Multiplayer Hand Privacy

**PR-releasable outcome**: Players can toggle their hands between public and private. Private hands show card backs to other players. Games can configure the default visibility.

### 4.1 Per-Hand Visibility Toggle

**`app/src/components/HandPanel.tsx`** — Add visibility toggle to the hand tab context menu:

- Right-click tab → "Make Private" / "Make Public" (toggles `visibility` field)
- Visual indicator on the tab when hand is private (lock icon or similar)
- Calls `store.setHandVisibility(handId, 'private' | 'public')`

**`app/src/store/YjsStore.ts`** — Add `setHandVisibility(handId, visibility)` method.

### 4.2 Rendering Other Players' Hands

**`app/src/components/HandPanel.tsx`** — When viewing another player's hand:

- **Public hand**: Cards shown face-up (same as your own hand)
- **Private hand**: Cards rendered using back images instead of face images
  - Back image resolved via: `gameAssets.cards[cardId].back ?? gameAssets.cardTypes[card.type].back`
  - Card count visible but card identities hidden
  - Cards not interactable (no drag, no context menu actions)

This requires knowing which player owns each hand. Add `ownerId` (actorId) to the hand data model:

**`shared/src/index.ts`** — Extend `HandData`:
```typescript
interface HandData {
  name: string;
  cards: string[];
  visibility: 'public' | 'private';
  ownerId: string;  // ActorId of the player who owns this hand
}
```

**`app/src/store/YjsStore.ts`** — `createHand()` sets `ownerId` to `this.actorId`.

### 4.3 Viewing Other Players' Hands

**`app/src/components/HandPanel.tsx`** — Add a way to view other players' hands:

- Additional tab section or dropdown showing other connected players
- Selecting another player's name shows their hand(s) in a read-only view
- Own hands shown in the primary tab row; other players' hands shown separately

### 4.4 Plugin-Configurable Default Visibility

**`shared/src/content-types.ts`** — Add optional `defaultHandVisibility` to the scenario or asset pack schema:

```typescript
// In Scenario or AssetPack:
handSettings?: {
  defaultVisibility: 'public' | 'private';
}
```

**`app/src/store/YjsStore.ts`** — `createHand()` reads default from `gameAssets.handSettings?.defaultVisibility ?? 'public'`.

**`app/src/content/loader.ts`** — Parse `handSettings` from asset packs/scenarios and include in `GameAssets`.

### 4.5 Awareness Integration

**`shared/src/index.ts`** — Extend `AwarenessState` with hand info so remote players can see who has hands and their visibility:

```typescript
// In AwarenessState:
hands?: {
  activeHandId: string | null;
  handIds: string[];  // This player's hand IDs
}
```

**`app/src/store/YjsStore.ts`** — Update awareness when hands change (create, delete, switch active).

### 4.6 Testing

- **Unit**: `setHandVisibility` test, `ownerId` set on creation
- **E2E**: `e2e/hand-privacy.spec.ts` — toggle visibility, verify card backs shown for private hands in a second browser context
- **E2E**: Verify default visibility from plugin/scenario settings

---

## Key Files Reference

| File | Stage | Action |
|------|-------|--------|
| `shared/src/index.ts` | 1 | Add `HandData` interface |
| `app/src/store/YjsStore.ts` | 1, 3 | Add `hands` Y.Map, hand methods, change observer |
| `app/src/store/YjsHandActions.ts` | 1, 3 | New file: moveCardToHand, moveCardToBoard, reorderCardInHand |
| `app/src/components/HandPanel.tsx` | 1, 2, 3 | New file: hand panel UI (row → fan → tabs) |
| `app/src/hooks/useHandPanel.ts` | 1 | New file: hand panel state management |
| `app/src/hooks/useBoardToHandDrop.ts` | 2 | New file: drag coordination |
| `app/src/hooks/useHandReorder.ts` | 3 | New file: drag-to-reorder |
| `app/src/actions/handActions.ts` | 1 | New file: "Add to Hand" context menu action |
| `app/src/actions/types.ts` | 1 | Add `activeHandId` to ActionContext |
| `app/src/actions/buildActionContext.ts` | 1 | Pass through activeHandId |
| `app/src/routes/table.$id.tsx` | 1, 2 | Integrate HandPanel, manage hand state, coordinate drags |
| `app/src/index.css` | 1, 2, 3 | Layout change (fixed → flex), hand panel styles |
| `app/src/components/Board.tsx` | 2 | Expose viewportToWorld, forward phantom drag messages |
| `app/src/renderer/handlers/pointer.ts` | 2 | Add phantom-drag-move/end handlers |
| `shared/src/index.ts` | 1, 2, 4 | Add HandData interface, phantom drag message types, AwarenessState hands |
| `shared/src/content-types.ts` | 4 | Add handSettings to asset pack / scenario schema |
| `app/src/renderer/managers/CoordinateConverter.ts` | — | Reuse screenToWorld() for coordinate conversion |
| `app/src/components/CardPreview.tsx` | — | Reuse as-is for hand hover previews |

## Reusable Existing Code

- **`createObject()`** in `app/src/store/YjsActions.ts` — Create stack when playing card from hand
- **`CardPreview`** in `app/src/components/CardPreview.tsx` — Hover/modal card preview (uses `use-image` hook)
- **`getCardOrientation()`** in `app/src/content/utils.ts` — Card orientation detection
- **`generateTopSortKey()`** in `app/src/store/YjsActions.ts` — Z-ordering for new stacks
- **`getDefaultProperties()`** in `app/src/store/ObjectDefaults.ts` — Default object properties by kind
- **`ActionRegistry`** in `app/src/actions/ActionRegistry.ts` — Register hand actions
- **`useImage`** hook (npm `use-image`) — Load card images in React DOM

## Verification

After each stage:
1. `pnpm run typecheck` — no type errors
2. `pnpm run lint` — no lint errors
3. `pnpm run test` — all unit tests pass
4. `cd app && pnpm run test:e2e` — all E2E tests pass (including new hand tests)
5. `pnpm run dev` — manual verification:
   - Stage 1: Create hand, add card via context menu, see in panel, play back, collapse/expand
   - Stage 2: Fan layout looks good at various card counts, drag works both directions, hover preview appears
   - Stage 3: Multiple tabs, switch between them, reorder cards by dragging
   - Stage 4: Toggle hand private/public, verify card backs shown to other players, verify plugin default visibility
