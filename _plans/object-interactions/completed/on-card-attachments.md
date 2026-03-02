# On-Card Attachments: Tokens, Status, Modifiers & Icons

## Overview
Visual attachments system for cards: tokens (quantity badges), status effects (keywords/images), modifiers (stat changes), and icons (game symbols). All render as overlays on or around card faces, prioritizing information visibility over artwork. Fully plugin-driven — no hardcoded game-specific types.

## Status
🔨 **IN PROGRESS** - Tokens, status effects, and modifiers are complete. Icons deferred.

### What's Done
- [x] Type definitions (`AttachmentData` in shared, `StatusTypeDef`, `TokenTypeDef`, `ModifierStatDef`, `IconTypeDef`)
- [x] Asset pack extensions (all 4 attachment type defs in `content-types.ts`)
- [x] Rendering constants (`constants.ts`)
- [x] Token rendering (images with count overlay, plugin-defined ordering)
- [x] Status rendering (images hanging off right edge, configurable counts via `countable` flag)
- [x] Modifier rendering (colored stat bars below the card)
- [x] Icon rendering (images stacked vertically on card center)
- [x] Per-type add/remove actions for tokens, status, and modifiers
- [x] Keyboard shortcuts for tokens (Cmd+1-9 add, Shift+1-9 remove)
- [x] Counter-rotation (overlays stay upright when card is exhausted)
- [x] Plugin-defined ordering (display order matches asset pack key order)
- [x] Hover preview dismissed when menus open
- [x] Actions re-register on page reload
- [x] Content loading pipeline (pluginLoader, loader, index)

### What's Remaining
- [ ] Icon actions (add/remove icons — rendering exists, actions do not)
- [ ] Unit tests for attachment system
- [ ] E2E tests for attachment interactions

## Key Design Decisions

### Layout Strategy (Evolved from Original Plan)
- **Tokens**: Center of card, stacked vertically below badge area
- **Status effects**: Hang off the **right edge** of the card (not center — avoids covering artwork)
- **Modifiers**: Positioned **below the card** (not on the card face)
- **Icons**: Center of card below tokens (rendering exists, no actions yet)
- **Corners clear**: Keep all 4 corners empty
- **No truncation**: Show all attachments, no overflow badges
- **Counter-rotation**: All overlays rotate to stay upright when card is exhausted

### Visual Layout
```
                                    ┌─────────┐
┌─────────────────────────┐         │ STUNNED │ ← Status (right edge, hanging off)
│  [Count:5]    [Unstack] │         ├─────────┤
│                         │─────────│CONFUSED │
│             ⚡          │         └─────────┘
│              3          │ ← Tokens (center, with count overlay)
│             💔          │
│              5          │
│             🎯          │ ← Icons (center, below tokens)
│             ⚔️          │
└─────────────────────────┘
       ┌─────────┐
       │ THW ▲+1 │ ← Modifiers (below card)
       ├─────────┤
       │ ATK ▼-1 │
       └─────────┘
```

### Data Model
- **Storage**: Single `_meta.attachments` object
- **Structure**: Plugin-driven string keys (no enums — extensible by any game)
```typescript
_meta: {
  attachments: {
    tokens: { threat: 3, damage: 5 },          // Record<string, number>
    status: { stunned: 1, confused: 2 },        // Record<string, number> (count-based)
    modifiers: { THW: 1, ATK: -1 },            // Record<string, number>
    icons: ["retaliate", "guard"]               // string[]
  }
}
```

### Status Effects: Countable vs Toggle
- `StatusTypeDef.countable?: boolean` controls behavior
- **Non-countable** (default): Toggle on/off. Add action hidden when already present.
- **Countable**: Increment/decrement like tokens. Count overlay shown when count > 1.

### Rendering Approach
- **Tokens**: Load PNG via TextureLoader, contain-scale to `ATTACHMENT_TOKEN_SIZE` (20px), overlay count text centered
- **Status**: Load PNG via TextureLoader, contain-scale with 4:1 default ratio (48x12), hang off right edge
- **Modifiers**: Draw colored bar background (green positive, red negative), render stat code + value + ▲/▼
- **Icons**: Load PNG via TextureLoader, contain-scale to `ATTACHMENT_ICON_SIZE` (16px)

### Ordering
- Display order matches plugin asset pack key order (`Object.keys()`)
- `sortByPluginOrder()` and `sortArrayByPluginOrder()` helpers
- Entries not in plugin definition appear at the end

### Counter-Rotation
- When a card is exhausted (rotated 90°), overlays counter-rotate so text stays upright
- `counterRotation = (-obj._pos.r * Math.PI) / 180` passed through all render functions
- Each attachment wrapped in a Container with counter-rotation applied
- Animation of counter-rotation deferred (see GitHub issue #61)

### Keyboard Shortcuts
- Token add: Cmd+1 through Cmd+9 (based on plugin definition order slot)
- Token remove: Shift+1 through Shift+9
- `KeyboardManager` uses `event.code` with `/^Digit(\d)$/` for reliable digit detection
- Dynamic shortcut resolution scans action registry as fallback for late-registered actions

## Implementation Details

### Files Created
- `app/src/actions/attachmentActions.ts` — Dynamic action generation from plugin assets

### Files Modified
- `shared/src/index.ts` — `AttachmentData` interface
- `shared/src/content-types.ts` — `TokenTypeDef`, `StatusTypeDef`, `ModifierStatDef`, `IconTypeDef`
- `app/src/renderer/objects/stack/behaviors.ts` — Rendering functions + sorting helpers + counter-rotation
- `app/src/renderer/objects/stack/constants.ts` — Sizing, spacing, color constants
- `app/src/actions/KeyboardManager.ts` — Digit key handling, dynamic shortcut resolution
- `app/src/actions/registerDefaultActions.ts` — Integration point
- `app/src/components/Board.tsx` — `isMenuOpen` prop for hover preview dismissal
- `app/src/routes/table.$id.tsx` — Reload-time action registration
- `app/src/content/loadScenarioHelper.ts` — `registerAttachmentActions` on scenario load
- `app/src/content/index.ts` — Blob URL replacement for local plugin images
- `app/src/content/loader.ts` — Attachment type loading from asset packs
- `app/src/content/pluginLoader.ts` — Plugin attachment type extraction

## Integration Notes

### Multiplayer
- All attachment updates wrapped in Yjs transactions
- Yjs automatically handles concurrent modifications
- Renderer updates on `_meta` changes via message bus

### Performance
- Token/icon/status images loaded asynchronously via TextureLoader
- Images cached after first load
- Skip rendering when `ctx.minimal === true`

### Game Asset Loading
- Attachment type definitions loaded from AssetPack
- Missing definitions: Skip rendering that attachment type
- Invalid image URLs: Log warning, trigger re-render for fallback

## Future Enhancements

- **Icon actions**: Add/remove icon actions (rendering already works)
- **Animated counter-rotation**: Sync with card exhaust animation (GitHub issue #61)
- **Animations**: Smooth add/remove transitions
- **Direct interaction**: Click attachment to edit/remove
- **Touch gestures**: Swipe to remove on mobile
- **Bulk operations**: Add status to multiple cards
- **Attachment templates**: Save common combinations

## Notes

- Marvel Champions is the reference game but system is game-agnostic
- Layout optimized for standard poker-sized cards (63x88 at render scale)
- All types defined by plugins in their asset packs — no game-specific enums in core
