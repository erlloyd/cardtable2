# Card Image Preview & Orientation System

## Status
🚧 **In Progress** - Phase 7: Settings UI Integration

**Completed Phases:**
- ✅ Phase 1: Content Type Extensions
- ⏭️ Phase 2: Preview Settings System (partially skipped, defaults used)
- ✅ Phase 3: Orientation Resolution Utility
- ✅ Phase 4: CardPreview React Component
- ✅ Phase 4.5: Canvas Card Rotation (bonus feature)
- ✅ Phase 5: Desktop Hover Preview (all 3 sub-phases complete)
- ✅ Phase 6: Mobile Double-Tap Preview (with portal fix and zoom threshold)

**Next Up:** Phase 7 - Settings UI Integration (localStorage + settings panel)

## Overview
Add ability for users to view card images at larger size with proper orientation handling for landscape/portrait cards. Desktop users hover over cards to preview; mobile users double-tap to see a centered preview modal.

## Prerequisites
- Current rendering architecture (PixiJS, object registry pattern)
- Stack object behaviors and event handlers
- Content system (Card, CardType interfaces, GameAssets)

## Goals
1. **Desktop hover preview**: Show larger card image when hovering over face-up cards/stacks
2. **Mobile double-tap preview**: Show centered modal preview on double-tap for face-up cards/stacks
3. **Orientation support**: Properly display landscape vs portrait cards with rotation
4. **Configurable preview size**: User-adjustable preview dimensions
5. **Type inheritance**: CardType defines default orientation, cards can override

## Non-Goals
- Previewing face-down cards (security/privacy)
- Animated transitions between orientations
- Plugin function API for orientation (keep it declarative)
- Previewing multiple cards from a stack simultaneously

## Architecture

### Content Type Extensions (shared/src/content-types.ts)

Add `orientation` field to both `CardType` and `Card` interfaces:

```typescript
export interface CardType {
  back?: string;
  size?: CardSize;
  orientation?: 'portrait' | 'landscape' | 'auto'; // NEW - defaults to 'portrait'
}

export interface Card {
  type: string;
  face: string;
  back?: string;
  size?: CardSize;
  orientation?: 'portrait' | 'landscape' | 'auto'; // NEW - overrides CardType
}
```

**Inheritance logic:**
1. Check if card has explicit `orientation` → use it
2. Else, check if card's type has `orientation` → use it
3. Else, default to `'portrait'`

**Auto behavior:**
- `'auto'` means infer from image aspect ratio (future enhancement)
- For now, treat `'auto'` as `'portrait'`

### Preview Size Configuration

Add to user settings/preferences:

```typescript
export interface PreviewSettings {
  enabled: boolean; // Master toggle for previews (default: true)
  size: 'small' | 'medium' | 'large' | 'custom'; // Preset sizes
  customWidth?: number; // For 'custom' size
  customHeight?: number; // For 'custom' size
  hoverDelay: number; // Desktop hover delay in ms (default: 300)
  rotationEnabled: boolean; // Whether to rotate landscape cards (default: true)
}
```

**Default dimensions (portrait reference):**
- Small: 200x280px
- Medium: 280x392px (default)
- Large: 360x504px
- Landscape: Swap width/height when orientation is landscape

### Component Architecture

#### CardPreview Component (React)

```tsx
<CardPreview
  card={card}              // Card data from GameAssets
  orientation={orientation} // 'portrait' | 'landscape'
  position={position}       // { x, y } for desktop positioning
  mode="hover" | "modal"    // Desktop hover vs mobile modal
  settings={previewSettings}
  onClose={() => {}}        // Dismiss handler
/>
```

**Desktop hover mode:**
- Position near cursor (avoid covering the hovered card)
- Auto-dismiss on mouse leave
- Show above other UI (high z-index)
- Semi-transparent backdrop (optional)

**Mobile modal mode:**
- Centered in viewport
- Full overlay with dark backdrop (80% opacity)
- Tap outside or close button to dismiss
- Prevent body scroll while open

**Rotation logic:**
```tsx
const displayStyles = {
  width: isLandscape ? landscapeWidth : portraitWidth,
  height: isLandscape ? landscapeHeight : portraitHeight,
  transform: isLandscape && rotationEnabled ? 'rotate(90deg)' : 'none',
  transformOrigin: 'center center'
};
```

### Event Handling

#### Desktop Hover (Renderer Message)

The renderer already has HoverManager that detects hover state changes. When hover changes, the renderer posts a message to the main thread:

```typescript
// In app/src/renderer/handlers/pointer.ts (where hover changes)
if (context.hover.setHoveredObject(newHoveredId)) {
  // Hover state changed - notify main thread
  const obj = newHoveredId ? context.sceneManager.getObject(newHoveredId) : null;
  const isFaceUp = obj?._kind === ObjectKind.Stack && (obj as StackObject)._faceUp;

  context.postResponse({
    type: 'object-hovered',
    objectId: newHoveredId,
    isFaceUp: isFaceUp || false,
  });
}
```

Board component handles the message:

```typescript
// In app/src/pages/Board.tsx
function handleObjectHovered(objectId: string | null, isFaceUp: boolean) {
  if (!objectId || !isFaceUp) {
    cancelHoverTimer();
    setPreviewState({ isOpen: false, card: null });
    return;
  }

  // Start hover delay timer (300ms default)
  startHoverTimer(() => {
    const card = getCardFromObject(objectId);
    const position = getCursorPosition(); // Get current cursor position
    setPreviewState({
      isOpen: true,
      card,
      mode: 'hover',
      position,
    });
  });
}
```

#### Mobile Double-Tap (onDoubleClick handler)

```typescript
// Track tap timing for double-tap detection
let lastTapTime = 0;
const DOUBLE_TAP_THRESHOLD = 300; // ms

export const StackEventHandlers: Partial<EventHandlers> = {
  onClick: (obj: StackObject, event: PointerEventData) => {
    if (event.pointerType !== 'touch') return;
    if (!obj._faceUp) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;

    if (timeSinceLastTap < DOUBLE_TAP_THRESHOLD) {
      // Double-tap detected
      event.preventDefault();
      showPreview(obj, 'modal');
      lastTapTime = 0; // Reset
    } else {
      lastTapTime = now;
    }
  }
};
```

**Note:** Double-tap should NOT trigger on desktop (mouse) interactions, only touch.

### Preview State Management

Use React Context or local state in Board component:

```typescript
interface PreviewState {
  isOpen: boolean;
  card: Card | null;
  orientation: 'portrait' | 'landscape';
  mode: 'hover' | 'modal';
  position?: { x: number; y: number }; // For hover mode
}

const [previewState, setPreviewState] = useState<PreviewState>({
  isOpen: false,
  card: null,
  orientation: 'portrait',
  mode: 'hover'
});
```

### Orientation Resolution Utility

```typescript
/**
 * Get the display orientation for a card
 * Follows inheritance: card.orientation → cardType.orientation → 'portrait'
 */
export function getCardOrientation(
  card: Card,
  gameAssets: GameAssets
): 'portrait' | 'landscape' {
  // Check card-level override
  if (card.orientation && card.orientation !== 'auto') {
    return card.orientation;
  }

  // Check card type default
  const cardType = gameAssets.cardTypes[card.type];
  if (cardType?.orientation && cardType.orientation !== 'auto') {
    return cardType.orientation;
  }

  // Default to portrait
  return 'portrait';
}
```

## Implementation Plan

### Phase 1: Content Type Extensions ✅ **COMPLETED**
**Files:**
- `shared/src/content-types.ts` - Add `orientation` to CardType and Card

**Tasks:**
- ✅ Add `orientation?: 'portrait' | 'landscape' | 'auto'` to CardType
- ✅ Add `orientation?: 'portrait' | 'landscape' | 'auto'` to Card
- ✅ Update JSDoc comments to explain inheritance
- ✅ Run type checks to ensure no breaking changes

**Testing:**
- ✅ Verify TypeScript compilation
- ✅ Confirm existing content still loads

**Completed:** 2026-02-05
**Commit:** cad510b

### Phase 2: Preview Settings System ⏭️ **SKIPPED**
**Files:**
- `app/src/constants/previewSizes.ts` (implemented) - Size presets only

**Decision:** Skipped full settings system in favor of using reasonable defaults. Settings UI can be added later in Phase 7 if needed.

**What was implemented:**
- ✅ Size presets (small/medium/large) in constants file
- ✅ Default rotation enabled flag
- ⏭️ LocalStorage persistence (deferred to Phase 7)
- ⏭️ Settings hook (deferred to Phase 7)

### Phase 3: Orientation Resolution Utility ✅ **COMPLETED**
**Files:**
- `app/src/content/utils.ts` - getCardOrientation function
- `app/src/content/cardRotation.ts` (NEW) - shouldRotateCard utility

**Tasks:**
- ✅ Implement getCardOrientation with inheritance logic
- ✅ Handle 'auto' by defaulting to 'portrait'
- ✅ Add comprehensive unit tests
- ✅ **BONUS:** Created shouldRotateCard utility for canvas rotation

**Testing:**
- ✅ Test card-level orientation override
- ✅ Test CardType default orientation
- ✅ Test fallback to 'portrait'
- ✅ Test 'auto' handling
- ✅ Test rotation logic for landscape images

**Completed:** 2026-02-05
**Commit:** cad510b

### Phase 4: CardPreview React Component ✅ **COMPLETED**
**Files:**
- `app/src/components/CardPreview.tsx` - Main preview component
- `app/src/components/CardPreview.test.tsx` - Comprehensive tests (23 tests)
- `app/src/styles/CardPreview.css` - Preview styles (Tailwind classes)

**Tasks:**
- ✅ Create CardPreview component with hover/modal modes
- ✅ Implement rotation transform for landscape cards (+90° for preview)
- ✅ Add backdrop and close button (modal mode)
- ✅ Position logic for hover mode (handled in Board.tsx)
- ✅ Keyboard shortcuts (ESC to close)
- ✅ Click-outside to dismiss (via Headless UI Dialog)

**Testing:**
- ✅ Test portrait card rendering
- ✅ Test landscape card rendering with rotation
- ✅ Test hover positioning
- ✅ Test modal centering
- ✅ Test dismiss behaviors (ESC, click-outside, close button)
- ✅ Test disabled rotation mode
- ✅ Test all size presets (small/medium/large/custom)

**Completed:** 2026-02-05
**Commit:** cad510b

### Phase 4.5: Canvas Card Rotation ✅ **COMPLETED** (Bonus Feature)
**Files:**
- `app/src/content/cardRotation.ts` (NEW) - Rotation logic utility
- `app/src/renderer/objects/stack/behaviors.ts` - Canvas sprite rotation

**What was implemented:**
This feature ensures landscape card images are properly rotated on the canvas, not just in previews.

**Rotation Rules:**
- **Non-exhausted cards** (portrait container): Rotate if image is landscape (width > height)
- **Exhausted cards** (landscape container): NOT YET IMPLEMENTED - will rotate if image is portrait
- Canvas uses -90° (clockwise) rotation
- Preview uses +90° (counter-clockwise) rotation with metadata-based dimensions

**Implementation Details:**
```typescript
// In stack behaviors render function:
if (needsRotation) {
  sprite.width = STACK_HEIGHT;   // Swap dimensions
  sprite.height = STACK_WIDTH;
  sprite.rotation = -Math.PI / 2; // -90 degrees
}
```

**Testing:**
- ✅ Test landscape images rotate correctly on canvas
- ✅ Test portrait images don't rotate on canvas
- ✅ Test dimensions swap correctly when rotated
- ✅ Test rotation direction is -90° (clockwise)

**Completed:** 2026-02-05
**Commit:** cad510b

### Phase 5: Desktop Hover Preview ✅ **COMPLETED**
**Files:**
- `shared/src/index.ts` - Add `object-hovered` message type
- `app/src/renderer/handlers/pointer.ts` - Send hover messages to main thread
- `app/src/components/Board/BoardMessageBus.ts` - Wire up hover message handler
- `app/src/pages/Board.tsx` - Integrate CardPreview with hover state

**Implementation approach:**
The renderer already has HoverManager that detects hover (app/src/renderer/managers/HoverManager.ts).
We just need to:
1. Add new message type `object-hovered` to RendererToMainMessage
2. Post message when hover changes (in pointer.ts:510 where setHoveredObject is called)
3. Board component receives message with object ID and position
4. Board looks up card data and shows CardPreview component

**Tasks:**
- ✅ Add `object-hovered` message type with objectId and face-up status
- ✅ Send message when hover state changes in pointer handler
- ✅ Only show preview for face-up stacks
- ✅ Position CardPreview near cursor (avoid covering source card)
- ✅ Auto-dismiss on hover leave (when objectId becomes null)
- ✅ Only stack objects trigger preview (not zones/tokens)
- ✅ Hide preview when local user starts dragging a stack
  - ✅ Listen to drag start/end messages from renderer
  - ✅ Clear preview state on drag start
  - ✅ Re-enable on drag end (hover state may have changed)
- ✅ Ensure entire preview stays in viewport
  - ✅ Calculate available space in all directions from cursor
  - ✅ If preview would overflow right edge, position to left of cursor
  - ✅ If preview would overflow bottom edge, position above cursor
  - ✅ Default: position to right and below cursor (+20px offset)
- ✅ **BONUS:** Canvas card rotation for landscape images (-90° rotation)

**Testing:**
- ✅ Test auto-dismiss on mouse leave
- ✅ Test face-down cards don't trigger preview
- ✅ Test preview positioning doesn't cover source card
- ✅ Test only stack objects trigger preview (not zones/tokens)
- ✅ Test preview hides when user starts dragging
- ✅ Test preview doesn't reappear until drag completes and hover re-establishes
- ✅ Test preview positioning near right edge (flips to left of cursor)
- ✅ Test preview positioning near bottom edge (flips above cursor)
- ✅ Test preview positioning in corner (both axes flip)
- ✅ Test canvas rotation for landscape cards

**Completed:** 2026-02-05
**Commit:** cad510b

**Note:** No awareness updates - preview is local-only, not shown to other multiplayer users.

### Phase 6: Mobile Double-Tap Preview ✅ **COMPLETED**
**Files:**
- `app/src/renderer/handlers/pointer.ts` - Double-tap detection in handlePointerUp
- `shared/src/index.ts` - Added `show-card-preview-modal` message type
- `app/src/components/Board/BoardMessageBus.ts` - Wire up modal message handler
- `app/src/components/Board.tsx` - Modal state management with React portal

**Tasks:**
- ✅ Implement double-tap detection in pointer handler (300ms threshold)
- ✅ Track tap timing globally (not per-object for simpler UX)
- ✅ Only trigger for touch pointerType
- ✅ Show modal preview on double-tap via new message type
- ✅ Add `show-card-preview-modal` to RendererToMainMessage union
- ✅ Board receives message and displays modal with card preview
- ✅ Timing protection: ignore gestures in first 200ms after modal opens
- ✅ **FIX:** React portal implementation to escape stacking contexts
  - Modal rendered to `document.body` via `createPortal`
  - Fixes z-index issues with GlobalMenuBar buttons
  - Prevents backdrop clicks from activating underlying UI
- ✅ **FEATURE:** Zoom threshold to hide hover preview when unnecessary
  - Calculate card's rendered screen dimensions in pointer.ts
  - Extended `object-hovered` message with `cardScreenWidth` and `cardScreenHeight`
  - Board component checks if card >= 80% of preview size
  - Automatically hides hover preview when card is already large enough

**Testing:**
- ✅ Test double-tap detection with various timing
- ✅ Test single tap still works normally
- ✅ Test mouse clicks don't trigger double-tap (touch-only)
- ✅ Test modal dismissal (click backdrop, timing protection)
- ✅ Test modal renders above all UI elements
- ✅ Test backdrop clicks don't activate underlying buttons
- ✅ Test zoom threshold prevents preview when card is large

**Completed:** 2026-02-06
**Commits:** (multiple commits during implementation)

### Phase 7: Settings UI Integration
**Files:**
- `app/src/components/SettingsPanel.tsx` - Add preview settings section

**Tasks:**
- Add preview settings section to settings panel
- Size preset selector (small/medium/large/custom)
- Custom size inputs (width/height)
- Hover delay slider
- Enable/disable toggle
- Rotation toggle
- Live preview of settings

**Testing:**
- Test all settings persist correctly
- Test preview updates when settings change
- Test validation on custom sizes

### Phase 8: E2E Testing
**Files:**
- `app/e2e/card-preview.spec.ts` (new) - End-to-end tests

**Tasks:**
- Test desktop hover preview workflow
- Test mobile double-tap preview workflow
- Test landscape card rotation
- Test face-down cards don't preview
- Test settings changes affect preview
- Test dismissal behaviors

## User Experience

### Desktop Flow
1. User loads a game with card images
2. User hovers over a face-up card/stack
3. After 300ms delay, larger preview appears near cursor
4. Preview shows proper orientation (landscape cards rotated 90°)
5. Moving mouse away dismisses preview

### Mobile Flow
1. User loads a game with card images
2. User double-taps a face-up card/stack
3. Preview appears centered with dark backdrop
4. Preview shows proper orientation (landscape cards rotated 90°)
5. Tap outside or close button to dismiss

### Plugin Author Experience
```json
{
  "cardTypes": {
    "villain": {
      "back": "villain-back.jpg",
      "orientation": "landscape"
    },
    "hero": {
      "back": "hero-back.jpg"
    }
  },
  "cards": {
    "mc01_rhino": {
      "type": "villain",
      "face": "rhino.jpg"
      // Inherits landscape from villain type
    },
    "mc01_spider_man": {
      "type": "hero",
      "face": "spiderman.jpg"
      // Defaults to portrait (hero type has no orientation)
    },
    "mc01_special_card": {
      "type": "hero",
      "face": "special.jpg",
      "orientation": "landscape"
      // Override: this hero card is landscape
    }
  }
}
```

## Edge Cases & Considerations

1. **No gameAssets loaded**: Don't show preview (gracefully handle)
2. **Missing card images**: Show placeholder or error state in preview
3. **Very small screens**: Adjust preview size to fit viewport
4. **Rapid hover/unhover**: Debounce to prevent flashing
5. **Multiple stacks**: Global double-tap timing (simpler UX than per-object)
6. **Rotated stacks**: Preview shows upright card image (not rotated with stack)
7. **Face-down privacy**: Never preview face-down cards
8. **Touch vs mouse**: Only touch triggers double-tap, not mouse double-click
9. **Modal z-index stacking**: Use React portal to `document.body` to escape stacking contexts
10. **Zoom threshold**: Hide hover preview when card >= 80% of preview size (already large enough)

## Performance Considerations

- Lazy-load CardPreview component (React.lazy)
- Use cached textures from TextureLoader (already loaded for canvas)
- Debounce hover events to prevent excessive re-renders
- Portal rendering for preview to avoid z-index issues
- Unmount preview when closed (free memory)

## Future Enhancements

- **'auto' orientation**: Detect from image aspect ratio
- **Stack preview**: Show multiple cards from stack in carousel
- **Zoom controls**: Pinch/scroll to zoom preview further
- **Comparison mode**: Preview multiple cards side-by-side
- **Animation**: Smooth fade-in/out transitions
- **Accessibility**: Screen reader support, keyboard navigation
- **Preview history**: Recently viewed cards list

## Success Metrics

- Preview shows within hover delay (300ms default)
- Landscape cards display correctly rotated
- No performance degradation during hover/preview
- Preview works on iOS Safari (double-tap vs zoom conflict)
- Settings persist across sessions
- Plugin authors can easily specify orientation

## References

- Original cardtable implementation (orientation by type metadata)
- PixiJS sprite rendering documentation
- React Portal for overlay rendering
- CSS transforms for rotation
- Touch event handling best practices
