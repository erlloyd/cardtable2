# On-Card Attachments: Tokens, Status, Modifiers & Icons

## Overview
Implement visual attachments system for cards: tokens (quantity badges), status effects (keywords), modifiers (stat changes), and icons (game symbols). All render as overlays on card faces, prioritizing information visibility over artwork.

## Status
📋 **PLANNED** - Ready for implementation

## Key Design Decisions

### Layout Strategy
- **Center-first**: Use center area liberally (artwork is least important)
- **Corners clear**: Keep all 4 corners empty (critical game stats like cost, power)
- **Full coverage**: Let attachments stack vertically, covering artwork as needed
- **No truncation**: Show all attachments, no "+X more" overflow badges
- **Always full detail**: No zoom-dependent simplification

### Visual Layout
```
┌─────────────────────────────────────┐
│  [Count:5]            [Unstack]     │ ← Existing decorations
│                                     │
│            ┌─────────┐             │
│            │ STUNNED │             │ ← Status (top-center)
│            ├─────────┤             │
│            │CONFUSED │             │
│            └─────────┘             │
│            ┌─────────┐             │
│            │ THW +1  │             │ ← Modifiers (below status)
│            ├─────────┤             │
│            │ ATK -1  │             │
│            └─────────┘             │
│               ⚡                   │
│                3                   │ ← Tokens (below modifiers)
│               💔                   │   Images with count text
│                5                   │
│               🎯                   │
│                                    │ ← Icons (bottom-center)
│               ⚔️                   │   Small game symbols
└─────────────────────────────────────┘

Vertical stack priority (top to bottom):
1. Status (most gameplay-critical)
2. Modifiers (important stat changes)
3. Tokens (quantity indicators)
4. Icons (least critical)
```

### Data Model
- **Storage**: Single `_meta.attachments` object (not array)
- **Structure**: Separate maps per type using enums (no strings)
```typescript
_meta: {
  attachments: {
    tokens: { [TokenType.Threat]: 3, [TokenType.Damage]: 5 },
    status: [StatusType.Stunned, StatusType.Confused],
    modifiers: { [ModifierStat.THW]: 1, [ModifierStat.ATK]: -1 },
    icons: [IconType.Retaliate, IconType.Guard]
  }
}
```

### Rendering Approach
- **Tokens**: Load PNG image from game assets (transparent background), overlay count text
- **Status**: Draw rounded rectangle badge, render text label
- **Modifiers**: Draw colored bar background, render stat + value text
- **Icons**: Load PNG image from game assets (transparent background)

### Interaction
- **Action-driven only** - Context menu actions to add/remove
- **No drag-and-drop** - Attachments are not draggable objects
- **Top card only** - Attachments apply to stack, not individual cards

## Implementation Tasks

### 1. Type Definitions (shared/src/index.ts)

**Objective**: Define TypeScript enums and types for attachment system

**Deliverables**:
- Add `AttachmentType` enum (Token, Status, Modifier, Icon)
- Add `TokenType` enum (game-specific types like Threat, Damage, AllPurpose)
- Add `StatusType` enum (game-specific keywords like Stunned, Confused, Tough)
- Add `ModifierStat` enum (stats like THW, ATK, DEF, HP)
- Add `IconType` enum (game-specific icons like Retaliate, Guard)
- Add TypeScript helper types for `_meta.attachments` structure
- Document attachment data model in comments

**Technical Notes**:
- Use enums instead of string literals
- All enums should be extensible for game-specific types
- Helper types should provide type safety for `_meta.attachments`

---

### 2. Asset Pack Extensions (shared/src/content-types.ts)

**Objective**: Extend content type system to support attachment definitions

**Deliverables**:
- Extend `AssetPack` interface with attachment type definitions:
  ```typescript
  export interface AssetPack {
    // ... existing fields
    tokenTypes?: Record<string, TokenTypeDef>;
    statusTypes?: Record<string, StatusTypeDef>;
    modifierStats?: Record<string, ModifierStatDef>;
    iconTypes?: Record<string, IconTypeDef>;
  }

  export interface TokenTypeDef {
    name: string;
    image: string;  // URL to PNG with transparent background
    size?: number;  // Optional size override
  }

  export interface StatusTypeDef {
    name: string;
    label: string;        // Display text
    color?: number;       // Badge background color (hex)
    textColor?: number;   // Text color (hex)
  }

  export interface ModifierStatDef {
    code: string;         // "THW", "ATK", etc.
    name: string;         // "Thwart", "Attack", etc.
    positiveColor: number; // Color for positive modifiers
    negativeColor: number; // Color for negative modifiers
  }

  export interface IconTypeDef {
    name: string;
    image: string;  // URL to PNG with transparent background
    size?: number;  // Optional size override
  }
  ```

**Technical Notes**:
- Games define valid attachment types in their asset packs
- Image URLs can be relative (to pack baseUrl) or absolute
- Colors use hex format (0xRRGGBB)

---

### 3. Rendering Constants (app/src/renderer/objects/stack/constants.ts)

**Objective**: Define sizing and spacing constants for attachments

**Deliverables**:
```typescript
// Attachment Sizes
export const ATTACHMENT_TOKEN_SIZE = 24;      // Token image base size
export const ATTACHMENT_STATUS_HEIGHT = 18;   // Status badge height
export const ATTACHMENT_MODIFIER_HEIGHT = 16; // Modifier bar height
export const ATTACHMENT_ICON_SIZE = 16;       // Icon image size

// Attachment Spacing
export const ATTACHMENT_VERTICAL_SPACING = 4;  // Gap between attachments
export const ATTACHMENT_TYPE_SPACING = 8;      // Gap between types
export const ATTACHMENT_START_Y = -100;        // Start position (from card top)

// Attachment Text
export const ATTACHMENT_COUNT_FONT_SIZE = 12;
export const ATTACHMENT_LABEL_FONT_SIZE = 10;
export const ATTACHMENT_TEXT_COLOR = 0xffffff;

// Attachment Colors (defaults)
export const STATUS_BADGE_COLOR = 0x2d3748;
export const STATUS_BADGE_ALPHA = 0.9;
export const MODIFIER_BAR_ALPHA = 0.85;
```

---

### 4. Rendering Implementation (app/src/renderer/objects/stack/behaviors.ts)

**Objective**: Render all 4 attachment types on card stacks

**Spec**:
- Add `renderAttachments()` function called from main `render()` method
- Position attachments in vertical column down center of card
- Render order: Status → Modifiers → Tokens → Icons (top to bottom)
- Skip rendering if `ctx.minimal === true` (ghost previews)

**Rendering Functions**:

1. **`renderStatus(container, attachments, startY, ctx)`**
   - Draw rounded rectangle badges
   - Render status text (uppercase)
   - Use colors from game assets or defaults
   - Return next Y position

2. **`renderModifiers(container, attachments, startY, ctx)`**
   - Draw colored bar backgrounds
   - Render stat code + value (e.g., "THW +1")
   - Use ▲ for positive, ▼ for negative
   - Return next Y position

3. **`renderTokens(container, attachments, startY, ctx)`**
   - Load token images via `ctx.textureLoader`
   - Create Sprite for each token type
   - Overlay count text at bottom-right
   - Return next Y position

4. **`renderIcons(container, attachments, startY, ctx)`**
   - Load icon images via `ctx.textureLoader`
   - Create Sprite for each icon
   - Stack vertically
   - Return next Y position

**Token Rendering Example**:
```typescript
async function renderTokens(
  container: Container,
  tokens: Record<TokenType, number>,
  startY: number,
  ctx: RenderContext
): Promise<number> {
  let currentY = startY;

  for (const [tokenType, count] of Object.entries(tokens)) {
    const tokenDef = ctx.gameAssets?.tokenTypes?.[tokenType];
    if (!tokenDef?.image) continue;

    // Load token image
    const texture = await ctx.textureLoader.load(tokenDef.image);
    const sprite = new Sprite(texture);
    sprite.scale.set(ATTACHMENT_TOKEN_SIZE / texture.width);
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(0, currentY);
    container.addChild(sprite);

    // Overlay count text
    const text = ctx.createText({
      text: count.toString(),
      style: {
        fontSize: ATTACHMENT_COUNT_FONT_SIZE,
        fill: ATTACHMENT_TEXT_COLOR,
        fontWeight: 'bold'
      }
    });
    text.anchor.set(1, 1); // Bottom-right
    text.position.set(
      ATTACHMENT_TOKEN_SIZE / 2 - 2,
      currentY + ATTACHMENT_TOKEN_SIZE / 2 - 2
    );
    container.addChild(text);

    currentY += ATTACHMENT_TOKEN_SIZE + ATTACHMENT_VERTICAL_SPACING;
  }

  return currentY;
}
```

**Deliverables**:
- `renderAttachments()` main function
- Four sub-rendering functions
- Proper Y-position tracking and spacing
- Image loading with error handling
- Text overlays with proper positioning

**Test Plan**:
- Visual: Attachments render in correct order
- Visual: Corners remain clear
- Visual: Text is readable on all backgrounds
- Unit: Rendering with missing game assets
- Unit: Rendering with no attachments (no-op)

---

### 5. Action Implementation (app/src/actions/attachmentActions.ts)

**Objective**: Create context menu actions for managing attachments

**Actions to Implement**:

1. **Add Token**
   - ID: `add-token`
   - Label: "Add Token"
   - Category: CARD_ACTIONS
   - Available: Single stack selected
   - Execution: Show modal to select token type and quantity

2. **Remove Token**
   - ID: `remove-token`
   - Label: "Remove Token"
   - Available: Stack has tokens
   - Execution: Show modal to select token type and decrement

3. **Add Status**
   - ID: `add-status`
   - Label: "Add Status"
   - Available: Single stack selected
   - Execution: Show modal to select status type

4. **Remove Status**
   - ID: `remove-status`
   - Label: "Remove Status"
   - Available: Stack has status effects
   - Execution: Show modal to select status to remove

5. **Add Modifier**
   - ID: `add-modifier`
   - Label: "Add Modifier"
   - Available: Single stack selected
   - Execution: Show modal to select stat and value

6. **Remove Modifier**
   - ID: `remove-modifier`
   - Label: "Remove Modifier"
   - Available: Stack has modifiers
   - Execution: Show modal to select modifier to remove

7. **Add Icon**
   - ID: `add-icon`
   - Label: "Add Icon"
   - Available: Single stack selected
   - Execution: Show modal to select icon type

8. **Remove Icon**
   - ID: `remove-icon`
   - Label: "Remove Icon"
   - Available: Stack has icons
   - Execution: Show modal to select icon to remove

**Action Implementation Pattern**:
```typescript
registry.register({
  id: 'add-token',
  label: 'Add Token',
  icon: '🎯',
  category: CARD_ACTIONS,
  isAvailable: (ctx) => {
    return ctx.selection.count === 1 && ctx.selection.hasStacks;
  },
  execute: async (ctx) => {
    const stackId = ctx.selection.ids[0];
    const yMap = ctx.store.getObjectYMap(stackId);
    if (!yMap) return;

    // TODO: Show modal to get tokenType and quantity
    const tokenType = TokenType.Threat;
    const quantity = 1;

    ctx.store.getDoc().transact(() => {
      const meta = yMap.get('_meta') as Record<string, unknown> || {};
      const attachments = meta.attachments || {};
      const tokens = attachments.tokens || {};

      tokens[tokenType] = (tokens[tokenType] || 0) + quantity;

      yMap.set('_meta', {
        ...meta,
        attachments: {
          ...attachments,
          tokens
        }
      });
    });
  }
});
```

**Modal UI** (Phase 2):
- For Phase 1, use simple prompt() or hardcoded values
- Phase 2: Implement proper React modals

**Deliverables**:
- 8 action functions in `attachmentActions.ts`
- Register all actions in `registerDefaultActions.ts`
- Context menu integration under "Attachments" submenu

**Test Plan**:
- E2E: Right-click card → Attachments → Add Token → Verify renders
- E2E: Add multiple tokens → Verify stacking
- E2E: Remove token → Verify disappears
- E2E: Multiplayer: Player A adds token → Player B sees it

---

### 6. Testing

**Unit Tests** (app/src/renderer/objects/stack/behaviors.test.ts):
- Rendering with no attachments
- Rendering each attachment type individually
- Rendering all attachment types together
- Rendering with missing game assets
- Y-position calculations

**E2E Tests** (app/e2e/attachments.spec.ts):
- Add token via context menu
- Add status via context menu
- Add modifier via context menu
- Add icon via context menu
- Multiple attachments stack correctly
- Remove attachments
- Multiplayer sync

---

## Integration Notes

### Multiplayer Considerations
- All attachment updates wrapped in Yjs transactions
- Yjs automatically handles concurrent modifications
- Renderer updates on `_meta` changes via message bus

### Performance
- Token/icon images loaded asynchronously via TextureLoader
- Images cached after first load
- Skip rendering when `ctx.minimal === true`

### Game Asset Loading
- Attachment type definitions loaded from AssetPack
- Missing definitions: Skip rendering that attachment type
- Invalid image URLs: Log warning, show placeholder

---

## Files to Create/Modify

### New Files
- `app/src/actions/attachmentActions.ts` - Action implementations
- `app/e2e/attachments.spec.ts` - E2E tests

### Modified Files
- `shared/src/index.ts` - Add enums and types
- `shared/src/content-types.ts` - Extend AssetPack interface
- `app/src/renderer/objects/stack/behaviors.ts` - Add rendering functions
- `app/src/renderer/objects/stack/constants.ts` - Add constants
- `app/src/actions/registerDefaultActions.ts` - Register new actions
- `app/src/renderer/objects/stack/behaviors.test.ts` - Add rendering tests

---

## Success Criteria

- [ ] All 4 attachment types render on cards
- [ ] Token images load from game assets with count overlays
- [ ] Status badges render with game-defined colors
- [ ] Modifier bars render with stat labels and values
- [ ] Icon images load from game assets
- [ ] Attachments stack vertically down center
- [ ] Corners remain clear at all times
- [ ] Add/remove actions work via context menu
- [ ] Multiplayer sync works (Yjs transactions)
- [ ] Unit tests pass (5+ tests)
- [ ] E2E tests pass (8+ scenarios)

---

## Estimated Effort

- **Type definitions**: 2-3 hours
- **Asset pack extensions**: 2-3 hours
- **Constants**: 1 hour
- **Rendering implementation**: 1-2 days (4 renderers + image loading + positioning)
- **Action implementation**: 1 day (8 actions + context menu integration)
- **Testing**: 1 day (unit + E2E)
- **Total**: 3-4 days for Phase 1 (basic functionality)

---

## Future Enhancements (Post-Phase 1)

- **Phase 2: UX Polish**
  - Animations on add/remove
  - Click attachment to edit/remove directly
  - React modals for add/edit (replace prompt())
  - Hover tooltips with attachment details

- **Phase 3: Advanced Features**
  - Touch gestures on mobile (swipe to remove)
  - Bulk operations (add status to multiple cards)
  - Attachment templates (save common combinations)
  - Color-blind mode support
  - Zoom-dependent simplification (optional)

---

## Notes

- This plan assumes Marvel Champions as the reference game
- Other games can define their own attachment types in asset packs
- Attachment system is game-agnostic at the core level
- Layout optimized for standard poker-sized cards (63x88mm)
