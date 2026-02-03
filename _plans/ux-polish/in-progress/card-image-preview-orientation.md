# Card Image Preview & Orientation System

## Status
🚧 **In Progress** - Phase 1: Adding orientation to content types

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

#### Desktop Hover (onHover handler)

```typescript
// In stack event handlers
export const StackEventHandlers: Partial<EventHandlers> = {
  onHover: (obj: StackObject, isHovered: boolean) => {
    if (!obj._faceUp) return; // Only preview face-up cards

    if (isHovered) {
      // Start hover delay timer (300ms default)
      startHoverTimer(() => {
        showPreview(obj, 'hover');
      });
    } else {
      // Cancel timer and hide preview
      cancelHoverTimer();
      hidePreview();
    }
  }
};
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

### Phase 1: Content Type Extensions
**Files:**
- `shared/src/content-types.ts` - Add `orientation` to CardType and Card

**Tasks:**
- Add `orientation?: 'portrait' | 'landscape' | 'auto'` to CardType
- Add `orientation?: 'portrait' | 'landscape' | 'auto'` to Card
- Update JSDoc comments to explain inheritance
- Run type checks to ensure no breaking changes

**Testing:**
- Verify TypeScript compilation
- Confirm existing content still loads

### Phase 2: Preview Settings System
**Files:**
- `app/src/types/settings.ts` (new) - PreviewSettings interface
- `app/src/hooks/usePreviewSettings.ts` (new) - Settings hook with localStorage
- `app/src/constants/previewSizes.ts` (new) - Size presets

**Tasks:**
- Define PreviewSettings interface
- Create hook for loading/saving preview preferences
- Define size presets (small/medium/large dimensions)
- Add localStorage persistence

**Testing:**
- Test settings persistence across page reloads
- Verify default values applied correctly

### Phase 3: Orientation Resolution Utility
**Files:**
- `app/src/content/utils.ts` - Add getCardOrientation function

**Tasks:**
- Implement getCardOrientation with inheritance logic
- Handle 'auto' by defaulting to 'portrait' (future: aspect ratio detection)
- Add comprehensive unit tests

**Testing:**
- Test card-level orientation override
- Test CardType default orientation
- Test fallback to 'portrait'
- Test 'auto' handling

### Phase 4: CardPreview React Component
**Files:**
- `app/src/components/CardPreview.tsx` (new) - Main preview component
- `app/src/components/CardPreview.test.tsx` (new) - Component tests
- `app/src/styles/CardPreview.css` (new) - Preview styles

**Tasks:**
- Create CardPreview component with hover/modal modes
- Implement rotation transform for landscape cards
- Add backdrop and close button (modal mode)
- Position logic for hover mode (avoid covering source card)
- Keyboard shortcuts (ESC to close)
- Click-outside to dismiss (modal mode)

**Testing:**
- Test portrait card rendering
- Test landscape card rendering with rotation
- Test hover positioning
- Test modal centering
- Test dismiss behaviors (ESC, click-outside, close button)
- Test disabled rotation mode

### Phase 5: Desktop Hover Preview
**Files:**
- `app/src/renderer/objects/stack/events.ts` - Add onHover handler
- `app/src/hooks/useHoverPreview.ts` (new) - Hover timer management
- `app/src/pages/Board.tsx` - Integrate preview state

**Tasks:**
- Implement onHover handler for StackObject
- Add hover delay timer (configurable, default 300ms)
- Only trigger for face-up cards
- Pass card data and position to CardPreview
- Auto-dismiss on mouse leave
- Cancel timer if user moves away before delay

**Testing:**
- Test hover delay timing
- Test auto-dismiss on mouse leave
- Test face-down cards don't trigger preview
- Test preview positioning doesn't cover source card
- Test cancellation when mouse moves before delay

### Phase 6: Mobile Double-Tap Preview
**Files:**
- `app/src/renderer/objects/stack/events.ts` - Update onClick handler
- `app/src/hooks/useDoubleTap.ts` (new) - Double-tap detection

**Tasks:**
- Implement double-tap detection in onClick handler
- Track tap timing per-object (prevent cross-object double-tap)
- Only trigger for touch pointerType
- Show modal preview on double-tap
- Prevent touch default behavior on double-tap
- Reset timer after successful double-tap

**Testing:**
- Test double-tap detection with various timing
- Test single tap still works normally
- Test cross-object taps don't trigger
- Test mouse clicks don't trigger double-tap
- Test touch-specific behavior
- Test modal dismissal

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
5. **Multiple stacks**: Each tracks its own tap timing
6. **Rotated stacks**: Preview shows upright card image (not rotated with stack)
7. **Face-down privacy**: Never preview face-down cards
8. **Touch vs mouse**: Only touch triggers double-tap, not mouse double-click

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
