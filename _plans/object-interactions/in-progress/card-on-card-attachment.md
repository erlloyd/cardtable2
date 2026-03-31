# Card-on-Card Attachment System

## Context

Many card games require attaching cards to other cards — upgrades on a hero (Marvel Champions), resources beneath a base (Star Wars Unlimited), enchantments on creatures (Magic). Cardtable 2.0 currently has no way to express this relationship. Cards can only be stacked (merged into a single deck) or placed freely on the board.

This plan adds a card attachment system where:
- Any stack can be a "parent" that receives attached cards
- Attached cards are single cards, but attaching a multi-card stack attaches all its cards individually
- Attached cards fan out from the parent in a configurable direction (below, above, left, right)
- Layout direction is specified per-game in the manifest, with a user override per-card
- Dragging the parent moves all attachments; dragging an attached card detaches it
- The attach vs stack gesture is distinguished by **drop zones** on the target card

---

## Data Model

### Shared types (`shared/src/index.ts`)

Add two optional properties to `TableObjectProps` / `StackObject`:

```typescript
_attachedCardIds?: string[];  // On parent: ordered list of attached card stack IDs
_attachedToId?: string;       // On child: ID of parent stack this card is attached to
```

Both stored at the `_` property level (same as `_cards`, `_faceUp`), not in `_meta`, since they're core structural data that affects position, hit-testing, and rendering.

### Position management

Attached cards are **independent StackObjects** in the Yjs doc. Their `_pos` is kept in sync with the parent:
- When the parent moves (drag end / `moveObjects`), all attached cards' positions are updated in the same Yjs transaction
- Visual positions during drag are computed from the parent's current position + fan offsets
- During multiplayer drag awareness, attached cards are included as `secondaryOffsets` (existing infrastructure)

### Game definition (`shared/src/content-types.ts`)

Add to `AssetPack` or a new top-level config:

```typescript
attachmentLayout?: {
  direction: 'below' | 'above' | 'left' | 'right';  // Fan direction
  revealFraction: number;  // 0-1, portion of attached card visible (default: 0.25)
  maxBeforeCompress?: number;  // Compress spacing beyond this count (default: 5)
};
```

Fallback when no game definition: `{ direction: 'below', revealFraction: 0.25 }`.

---

## Drop Zone Mechanics (Attach vs Stack)

When dragging a card over another card, the target card is split into **two halves**:

- **Stack zone** (top half): Drop here merges cards into a stack (existing behavior)
- **Attach zone** (bottom half): Drop here attaches the card

The split is always top/bottom regardless of the fan direction. The fan direction only controls where attachments lay out after the drop, not where you drop. This keeps the gesture consistent and learnable across all games.

**Text labels during hover:** When the dragged card enters either zone, a text label appears on the target card confirming the action — "Stack" in the top half, "Attach" in the bottom half. Labels are semi-transparent, centered in their respective zone, and disappear when the dragged card leaves the target. This removes all ambiguity about what will happen on drop.

**Ghost preview:** When hovering over the attach zone, a ghost preview (50% opacity) appears showing where the attached card would fan out. This teaches the fan direction at the moment the user needs it.

**Modifier key overrides:**
- Hold **Alt/Option** while dropping -> force attach (entire card becomes attach zone, "Attach" label shown)
- Hold **Shift** while dropping -> force stack (entire card becomes stack zone, "Stack" label shown)

**Visual feedback summary during drag:**
- Hovering over stack zone: existing red border highlight (`STACK_BORDER_COLOR_TARGET = 0xef4444`) + "Stack" text label
- Hovering over attach zone: amber/gold border + "Attach" text label + ghost preview of attachment position

The zone detection extends the existing `detectStackTarget()` in `pointer.ts` — same hit-test, but with an additional local-space coordinate check (reusing the `isPointInUnstackHandle()` pattern) to determine which zone the pointer is in. The check is simple: if the pointer's local-space Y coordinate is in the top half of the card, it's the stack zone; if it's in the bottom half, it's the attach zone.

---

## UI Treatment: Peeking Fan

Attached cards fan out from the parent with each card partially visible (like a hand of cards laid on the table). The parent card is always on top.

```
+-----------+
|  Parent   |
|  Card     |
|           |
+-----------+
  +-----------+  <- 25% of card 1 visible
  | Attach 1  |
  +-----------+  <- 25% of card 2 visible
  | Attach 2  |
  +-----------+  <- 25% of card 3 visible
  | Attach 3  |
  +-----------+
```

**Rationale:** Most familiar to card game players (LOTRLCG, SWU, Arkham). Easy to see how many cards are attached and identify each one. Works well with the card preview on hover.

**Compression:** Progressive compression needed at 5+ cards — reduce `revealFraction` proportionally so total fan length stays bounded.

**Visual indicator:** Subtle shared drop shadow encompassing parent + fan. Small attachment count badge on parent (reuses existing badge pattern from stack count).

---

## Attach/Detach Interactions

### Attaching

1. **Drag-to-attach (primary):** Drag a card over the attach zone of a target card. See amber highlight + ghost. Release to attach.
2. **Context menu (secondary):** Select source card(s), right-click target card -> "Attach Selected Cards". Works on mobile via long-press.
3. **Multi-card attach:** Dragging a stack onto the attach zone attaches all cards from the stack individually (stack is dissolved, each card becomes a separate attachment).

### Detaching

1. **Drag away (primary):** Click and drag an individual attached card. It immediately begins detaching — the card becomes a free-floating drag ghost that can be placed anywhere on the board, into a hand, or onto another card.
2. **Context menu (secondary):** Right-click an attached card -> "Detach". Right-click parent -> "Detach All".

### Moving the group

- Dragging the **parent card** moves the entire group (parent + all attachments)
- Leverages existing `secondaryOffsets` in DragManager — when a drag starts on a parent that has `_attachedCardIds`, those cards are automatically included as secondaries
- Multiplayer awareness shows ghosts for the whole group

---

## Rendering

### Fan layout computation

New utility: `computeAttachmentPositions(parentPos, attachmentCount, layout)` -> returns world positions for each attached card.

- For `direction: 'below'`: each card offset by `(0, cardHeight * revealFraction * (i + 1))` from parent
- Progressive compression: when `count > maxBeforeCompress`, reduce `revealFraction` proportionally so total fan length stays bounded
- Counter-rotation: attachment positions respect parent's rotation (rotate offset vector by parent's `_pos.r`)

### Stack render changes (`app/src/renderer/objects/stack/behaviors.ts`)

- **New layer in render():** After existing on-card attachments (tokens/status/modifiers), render a visual indicator for card attachments:
  - Attachment count badge (when attachments exist)
  - Attach zone highlight (when `ctx.isAttachTarget`)
- **New RenderContext flag:** `isAttachTarget: boolean` (parallel to existing `isStackTarget`)
- **Bounds expansion:** `getBounds()` does NOT expand for attachments — attached cards have their own bounds as independent objects

### Attached card rendering

Attached cards render themselves at their own `_pos` via the normal render pipeline — no special rendering needed. Their positions are just kept in sync with the parent.

The visual association comes from:
- Precise positioning (fan layout)
- Shared drop shadow or subtle connector line between parent and first attachment
- Attachment count badge on parent

---

## Store Actions (`app/src/store/YjsActions.ts`)

### `attachCards(store, sourceIds, targetId)`

Single Yjs transaction:
1. For each source stack: if it has multiple cards, split each card into individual stacks first
2. Set `_attachedToId = targetId` on each new single-card stack
3. Append each card's ID to target's `_attachedCardIds` array
4. Compute fan positions from target's `_pos` + layout config
5. Set `_pos` for each attached card
6. Delete original multi-card source stacks (cards were split out)

### `detachCard(store, cardId)`

Single Yjs transaction:
1. Read `_attachedToId` from card -> find parent
2. Remove card ID from parent's `_attachedCardIds`
3. Clear `_attachedToId` on card
4. Card keeps its current `_pos` (already correct from fan layout)
5. Recompute remaining attachment positions (close gap)

### `detachAllCards(store, parentId)`

Single Yjs transaction:
1. For each card in parent's `_attachedCardIds`: clear `_attachedToId`, keep `_pos`
2. Clear parent's `_attachedCardIds`

### `moveObjects` extension

When moving objects that have `_attachedCardIds`:
- Also move all attached cards by the same delta in the same transaction
- This keeps positions in sync without the renderer needing special logic

---

## Actions & Context Menu

### New actions (`app/src/actions/`)

| Action | Availability | Execute |
|--------|-------------|---------|
| Attach Selected Cards | 2+ stacks selected, or 1 selected + right-clicked different stack | `attachCards(store, selectedIds, targetId)` |
| Detach | Right-clicked card has `_attachedToId` | `detachCard(store, cardId)` |
| Detach All | Right-clicked card has `_attachedCardIds` with length > 0 | `detachAllCards(store, parentId)` |
| Change Attachment Layout | Right-clicked card has `_attachedCardIds` | Submenu: Below / Above / Left / Right -> updates `_meta.attachmentDirection` override |

---

## Implementation Order

### Phase 1: Data model + store actions ✅
1. `shared/src/index.ts` — add `_attachedCardIds`, `_attachedToId` to types
2. `shared/src/content-types.ts` — add `attachmentLayout` config type
3. `app/src/store/YjsActions.ts` — add `attachCards()`, `detachCard()`, `detachAllCards()`
4. `app/src/store/YjsActions.ts` — extend `moveObjects()` to move attachments
5. Unit tests for all store actions

### Phase 2: Rendering + drop zones ✅
6. `app/src/renderer/objects/stack/constants.ts` — attachment layout constants
7. `app/src/renderer/objects/stack/behaviors.ts` — attachment count badge, attach zone highlight
8. `app/src/renderer/objects/types.ts` — add `isAttachTarget` to RenderContext
9. `app/src/renderer/handlers/pointer.ts` — zone detection (attach vs stack zone)
10. `app/src/renderer/managers/VisualManager.ts` — attach target highlight management
11. Fan layout utility: `computeAttachmentPositions()`

### Phase 3: Drag integration ✅
12. `app/src/renderer/managers/DragManager.ts` — include attachments as secondaries when dragging parent
13. `app/src/renderer/handlers/pointer.ts` — dragging attached card = detach
14. Awareness: attached cards included in `secondaryOffsets` for multiplayer

### Phase 4: Actions + context menu ✅
15. `app/src/actions/` — register attach/detach/detach-all actions
16. New renderer message types: `attach-cards`, `detach-card` in shared types
17. `app/src/components/Board/BoardMessageBus.ts` — handlers for new messages

### Phase 5: Game definition support ✅
18. Content types — wire `attachmentLayout` through asset pack loading
19. Default layout fallback when no game definition

### Bug fixes (post-implementation)
- Parent visual z-order: `ensureAttachmentZOrder()` in objects handler moves parent above children after add/update
- Hit-testing: `SceneManager.hitTest()` filters attached children when parent is also a candidate
- Attached cards rejected as drop targets for stack/attach operations
- Known issue: `_sortKey` parsing broken for non-numeric prefixes (see GitHub issue #77)

---

## Key Files

| File | Change |
|------|--------|
| `shared/src/index.ts` | `_attachedCardIds`, `_attachedToId` on StackObject/TableObjectProps |
| `shared/src/content-types.ts` | `attachmentLayout` config type |
| `app/src/store/YjsActions.ts` | `attachCards()`, `detachCard()`, `detachAllCards()`, extend `moveObjects()` |
| `app/src/renderer/objects/stack/behaviors.ts` | Badge, attach zone highlight |
| `app/src/renderer/objects/stack/constants.ts` | Attachment layout constants |
| `app/src/renderer/objects/types.ts` | `isAttachTarget` in RenderContext |
| `app/src/renderer/handlers/pointer.ts` | Zone detection, detach-on-drag |
| `app/src/renderer/managers/DragManager.ts` | Include attachments as drag secondaries |
| `app/src/renderer/managers/VisualManager.ts` | Attach target highlight |
| `app/src/actions/` | New attach/detach actions |
| `app/src/components/Board/BoardMessageBus.ts` | New message handlers |

---

## Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run dev  # Manual testing below
```

### Manual test cases
- Drag card onto bottom edge of another card -> amber highlight -> release -> card attaches, fans below
- Drag card onto center of another card -> green highlight -> release -> cards stack (existing behavior)
- Hold Alt + drag onto any part of a card -> forces attach
- Hold Shift + drag onto any part of a card -> forces stack
- Drag parent card around -> all attachments move together
- Drag an attached card -> it detaches, becomes free object
- Right-click attached card -> "Detach" in context menu
- Right-click parent with attachments -> "Detach All" in context menu
- Right-click parent -> "Change Attachment Layout" -> select direction -> attachments reflow
- Attach 7+ cards -> verify progressive compression kicks in
- Multiplayer: attach cards on one client -> other client sees attachments correctly
- Multiplayer: drag parent -> other client sees whole group moving via awareness ghosts
