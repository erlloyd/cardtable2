# Milestone 3.5.1 — UI Action System Architecture

## Overview
Build the foundational event system and UI components for actions, WITHOUT implementing the actual game actions themselves. This provides the architecture that M3.5 (flip, rotate, stack, unstack) will plug into.

## Prerequisites
- M3 completed (Local Yjs, selection system)
- M2 completed (Rendering, hit-testing)

## Goal
Create a comprehensive, multi-modal action system that allows users to trigger actions through:
1. **Keyboard shortcuts** (e.g., F to flip, R to rotate)
2. **Command Palette** (⌘K searchable list)
3. **Context menus** (right-click on objects)
4. **Floating action bar** (appears above selection)
5. **Global menu bar** (top-right toolbar)

All UI components integrate with a central **Action Registry** that manages action metadata, availability, and execution.

## Architecture

### Core Concepts

**Action Registry:**
- Single source of truth for all available actions
- Actions registered with metadata: id, label, icon, keyboard shortcut, availability checker, executor
- UI components query registry to build menus/shortcuts dynamically
- Actions are context-aware (adapt to selection state)

**Selection Context:**
- Centralized system for tracking what's selected
- Provides aggregate info: count, types, permissions, lock status
- Powers UI component visibility and action availability

**Multi-Input Redundancy:**
- Same action accessible via multiple paths (keyboard, menu, palette)
- Progressive disclosure (common actions visible, advanced actions discoverable)
- Consistent behavior across all input methods

### Component Hierarchy

```
┌─────────────────────────────────────────────────┐
│  GlobalMenuBar (top-right)                      │
│    - Pan/Select toggle                          │
│    - Command Palette button                     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Board Canvas                                   │
│                                                 │
│                                          [⚡]   │ ← ActionHandle (collapsed)
│                                    [Selected]   │   Click/hover to expand
│                                                 │
│  Right-click → ContextMenu                     │
│                                                 │
│  ActionHandle expands on click/hover:           │
│     ┌─────────────────────┐                    │
│     │  [🔄] [↻] [⋮]      │                    │
│     └─────────────────────┘                    │
│              ↑                                  │
│        [Selected Card]                          │
└─────────────────────────────────────────────────┘

⌘K → CommandPalette (modal overlay)

Errors → Toast (bottom-left corner)
```

### Data Flow

```
User Input (keyboard/click/menu)
    ↓
ActionRegistry.execute(actionId, context)
    ↓
Action availability check (isAvailable)
    ↓
Action executor function
    ↓
YjsActions (flipCards, rotateObjects, etc.) [M3.5]
    ↓
YjsStore updates
    ↓
Renderer updates + Animations
    ↓
Toast feedback (errors only)
```

## Tasks

### M3.5.1-T0: Full-Screen Board Layout
**Objective:** Clean up board layout and make it full-screen by default.

**Dependencies:** None

**Spec:**
- **Refactor Board component to accept optional debug UI:**
  - Add `showDebugUI?: boolean` prop to Board component
  - Conditionally render debug elements (messages, buttons, status) based on prop
  - Keep all Board logic in single component (zero duplication)

- **Create two routes using the same Board component:**
  - **Default route** (`/table/:id`):
    - Renders `<Board showDebugUI={false} />`
    - Full-screen layout (100vw × 100vh)
    - No debug UI, no chrome
  - **Debug route** (`/dev/table/:id`):
    - Renders `<Board showDebugUI={true} />`
    - Current layout with debug UI
    - Useful for development

- **Architecture approach:**
  ```tsx
  // Option 1: Single component with conditional rendering
  function Board({ showDebugUI = false, ...props }) {
    return (
      <div className={showDebugUI ? "board-debug" : "board-fullscreen"}>
        <canvas ref={canvasRef} />
        {showDebugUI && (
          <div className="debug-ui">
            {/* messages, buttons, status */}
          </div>
        )}
      </div>
    );
  }

  // Option 2: Composition with wrapper component
  function BoardDebugWrapper({ children }) {
    return (
      <div className="board-debug">
        {children}
        <div className="debug-ui">{/* debug UI */}</div>
      </div>
    );
  }
  ```

- **Responsive behavior:**
  - Board resizes on window resize events
  - Update canvas dimensions and DPR
  - Handle mobile orientation changes
  - No scrollbars in either mode

- **CSS updates:**
  - `.board-fullscreen`: `width: 100vw; height: 100vh`
  - `.board-debug`: Current debug layout
  - Handle safe areas on mobile (notches, etc.)
  - Single set of Board styles, different wrapper styles

- **Zero duplication principle:**
  - Board component logic remains in single file
  - Renderer communication unchanged
  - Store integration unchanged
  - Only conditional rendering and CSS differences

**Deliverables:**
- ✅ Updated `app/src/components/Board.tsx` with `showDebugUI` prop
- ✅ New route: `app/src/routes/dev.table.$id.tsx` (renders Board with debug UI)
- ✅ Updated route: `app/src/routes/table.$id.tsx` (renders Board full-screen)
- ✅ CSS updates: `.board-fullscreen` and `.board-debug` classes
- ✅ Responsive resize handling (unchanged, works in both modes)
- ✅ **Additional:** Created `useTableStore` hook to eliminate route duplication
  - Extracted 104 lines of duplicated store initialization code
  - Routes reduced from 452 to 434 lines total (18 lines saved)
  - `table.$id.tsx` reduced 68% (109→35 lines)
  - `dev.table.$id.tsx` reduced 20% (343→275 lines)
  - Zero duplication, single source of truth for store logic
- ✅ **Additional:** Fixed TanStack Router type generation workflow
  - Installed `@tanstack/router-cli` package
  - Added `generate-routes` script using `tsr generate`
  - Updated `typecheck` to run route generation first
  - Updated CI to use proper CLI command
- ✅ Updated Board tests to pass `showDebugUI={true}`
- E2E tests for both routes (deferred - manual testing verified)

**Test Plan:**
- E2E: Navigate to `/table/:id` shows full-screen board (no debug UI)
- E2E: Navigate to `/dev/table/:id` shows debug board with buttons
- E2E: Both routes use same Board component (verify via React DevTools)
- E2E: Resize window updates board dimensions in both modes
- E2E: No scrollbars appear at any viewport size
- E2E: Mobile viewport shows full-screen board correctly
- Unit: Board component accepts `showDebugUI` prop correctly
- Unit: Debug UI elements only render when `showDebugUI={true}`
- Visual: Board fills entire viewport with no gaps in full-screen mode
- Visual: Debug UI layout unchanged in debug mode

**Rationale:**
- Clean slate for new UI components (full-screen mode)
- Debug tools still accessible via `/dev/table/:id` for development
- Zero code duplication - single Board component with conditional rendering

---

### M3.5.1-T1: Action Registry System ✅ COMPLETE
**Objective:** Core architecture for registering and executing actions.

**Dependencies:** M3.5.1-T0

**Status:** ✅ Complete (commit c43cf5a)

**Spec:**
- Action definition interface:
  ```typescript
  interface Action {
    id: string;              // 'flip-cards', 'rotate-objects'
    label: string;           // 'Flip Cards'
    icon: string;            // '🔄' or icon name
    shortcut?: string;       // 'F', 'Cmd+R', 'Shift+D'
    category: string;        // 'Card Actions', 'Selection', 'View'
    description?: string;    // For tooltips/help
    isAvailable: (context: ActionContext) => boolean;
    execute: (context: ActionContext) => void | Promise<void>;
  }
  ```
- `ActionContext` type:
  ```typescript
  interface ActionContext {
    store: YjsStore;
    selection: {
      ids: string[];
      objects: TableObject[];
      count: number;
      hasStacks: boolean;
      hasTokens: boolean;
      hasMixed: boolean;
      allLocked: boolean;
      allUnlocked: boolean;
      canAct: boolean; // owned by current actor
    };
    actorId: string;
  }
  ```
- `ActionRegistry` class:
  - `register(action: Action): void`
  - `unregister(actionId: string): void`
  - `getAction(actionId: string): Action | undefined`
  - `getAvailableActions(context: ActionContext): Action[]`
  - `getActionsByCategory(category: string): Action[]`
  - `execute(actionId: string, context: ActionContext): Promise<void>`
- Category constants: `CARD_ACTIONS`, `SELECTION_ACTIONS`, `VIEW_ACTIONS`, `MANAGEMENT_ACTIONS`
- Singleton pattern or React context for global access

**Deliverables:**
- `app/src/actions/ActionRegistry.ts`
- `app/src/actions/types.ts` (Action, ActionContext interfaces)
- `app/src/actions/ActionRegistry.test.ts`

**Test Plan:**
- Register action and retrieve it
- Query available actions with mock context
- Execute action and verify executor called
- Handle duplicate registration (warn/error)
- Category filtering works correctly

---

### M3.5.1-T2: Keyboard Shortcut Manager ✅ COMPLETE
**Objective:** Global keyboard event handling with conflict detection.

**Dependencies:** M3.5.1-T1

**Status:** ✅ Complete (commit 043a4b6)

**Spec:**
- `KeyboardManager` class:
  - `registerShortcut(shortcut: string, actionId: string): void`
  - `unregisterShortcut(shortcut: string): void`
  - `handleKeyEvent(event: KeyboardEvent, context: ActionContext): boolean` (returns true if handled)
  - `getShortcutDisplay(shortcut: string): string` (e.g., 'F' → 'F', 'Cmd+R' → '⌘R')
- Shortcut parsing:
  - Support modifiers: `Cmd`, `Ctrl`, `Alt`, `Shift`
  - Cross-platform: `Cmd` on Mac, `Ctrl` on Windows/Linux
  - Examples: `'F'`, `'Cmd+K'`, `'Shift+R'`, `'Alt+Delete'`
- Conflict detection:
  - Warn if duplicate shortcut registered
  - Allow override with explicit flag
- Context-aware execution:
  - Only execute if action is available in current context
  - Prevent execution when typing in input fields
- Browser shortcut prevention:
  - Don't override critical shortcuts (F5, Cmd+T, etc.)
  - List of reserved shortcuts

**Deliverables:**
- `app/src/actions/KeyboardManager.ts`
- `app/src/actions/KeyboardManager.test.ts`
- Integration hook: `useKeyboardShortcuts()`

**Test Plan:**
- Register shortcut and trigger via simulated KeyboardEvent
- Verify modifiers work correctly (Cmd, Shift, etc.)
- Conflict detection warns on duplicate
- Context-aware: action not available → shortcut ignored
- Reserved shortcuts not intercepted

---

### M3.5.1-T3: Command Palette Component ✅ COMPLETE
**Objective:** ⌘K searchable action interface.

**Dependencies:** M3.5.1-T1, M3.5.1-T2

**Status:** ✅ Complete (commits d416af1, 81011a4, 400a2c3, e4f235b, 6db0087)

**Implementation Notes:**
- Observable pattern with subscription system for registry reactivity
- Fixed multiple bugs: actions not appearing, availability not updating, duplicate hover states, scroll issues
- Added "Commands" button for non-keyboard access (mobile/desktop)
- ESLint clean with no suppressions (proper observable pattern)
- 15 test actions demonstrating various features
- Fuzzy search, keyboard navigation, recently used actions (localStorage)

**Spec:**
- Modal overlay component (dark background, center-screen)
- Headless UI `Combobox` for search + keyboard nav
- Features:
  - Fuzzy search over action labels and descriptions
  - Keyboard navigation (↑↓ arrows, Enter to execute, Escape to close)
  - Show keyboard shortcuts next to actions (right-aligned)
  - Gray out unavailable actions (but still searchable for discovery)
  - Category headers with dividers
  - Recently used actions section at top
  - Empty state when no matches
- Styling:
  - Clean, minimal design (Tailwind CSS)
  - Highlighted text for search matches
  - Icon + label + shortcut layout
- Integration:
  - Query `ActionRegistry.getAvailableActions()` on open
  - Re-query on selection context change
  - Execute action on Enter, close on Escape
  - Track recently used actions in localStorage
- Global shortcut: `Cmd+K` / `Ctrl+K`

**Deliverables:**
- `app/src/components/CommandPalette.tsx`
- `app/src/components/CommandPalette.test.tsx`
- `app/src/hooks/useCommandPalette.tsx` (open/close state)
- Fuzzy search utility: `app/src/utils/fuzzySearch.ts`

**Test Plan:**
- E2E: Open with ⌘K, search for action, execute with Enter
- E2E: Navigate with arrows, execute highlighted action
- E2E: Escape closes palette
- Unit: Fuzzy search matches expected results
- E2E: Unavailable actions grayed out but searchable
- E2E: Recently used actions appear at top

---

### M3.5.1-T4: Context Menu Component
**Objective:** Right-click menu system.

**Dependencies:** M3.5.1-T1, M3.5.1-T2

**Spec:**
- Headless UI `Menu` component
- Position at cursor/touch point
- Features:
  - Render action list from `ActionRegistry`
  - Category dividers (horizontal lines)
  - Keyboard shortcut hints (right-aligned, gray)
  - Nested menus support (for future use, not MVP)
  - Disabled state for unavailable actions
  - Icons for actions
- Viewport boundary handling:
  - If menu would clip off right edge, flip to left
  - If menu would clip off bottom, flip to top
  - Calculate position based on menu size + cursor position
- Keyboard navigation:
  - ↑↓ arrows to navigate
  - Enter to execute
  - Escape to close
  - First letter jumps to action (e.g., 'F' jumps to "Flip")
- Integration:
  - Query `ActionRegistry.getAvailableActions()`
  - Execute action on click
  - Close on outside click or Escape

**Deliverables:**
- `app/src/components/ContextMenu.tsx`
- `app/src/components/ContextMenu.test.tsx`
- `app/src/hooks/useContextMenu.tsx` (position, open/close state)

**Test Plan:**
- E2E: Right-click shows menu at cursor
- E2E: Click action executes it
- E2E: Escape closes menu
- E2E: Outside click closes menu
- Unit: Viewport boundary detection (flip left/top when needed)
- E2E: Keyboard navigation works
- E2E: Unavailable actions disabled

---

### M3.5.1-T5: Global Menu Bar
**Objective:** Top-right persistent toolbar.

**Dependencies:** M3.5.1-T3 (Command Palette)

**Spec:**
- Fixed position: top-right corner of viewport
- Components:
  - **Pan/Select toggle:** Two-button group, active mode highlighted
    - Pan mode: `🖐️ Pan` button
    - Select mode: `🔲 Select` button
    - Integrate with existing interaction mode state
  - **Command Palette button:** `⌘K Commands` button
    - Opens Command Palette on click
    - Shows keyboard shortcut hint
  - **Settings button:** `⚙️` gear icon (placeholder, no functionality yet)
- Styling:
  - Compact, minimal design
  - Semi-transparent background (backdrop blur)
  - Responsive layout (stack vertically on small screens)
- Keyboard integration:
  - `V` key: Switch to select mode
  - `Space` hold: Temporary pan mode (release to return)
  - `Cmd+K`: Open command palette

**Deliverables:**
- `app/src/components/GlobalMenuBar.tsx`
- `app/src/components/GlobalMenuBar.test.tsx`
- Integration with existing `interactionMode` state in Board.tsx

**Test Plan:**
- E2E: Click Pan button switches mode
- E2E: Click Select button switches mode
- E2E: Command Palette button opens palette
- E2E: `V` key switches to select mode
- E2E: `Space` hold temporarily enables pan mode
- E2E: Responsive layout on mobile viewport

---

### M3.5.1-T6: Action Handle (Progressive Disclosure Action Bar)
**Objective:** Context-sensitive action handle that expands into action bar on demand.

**Dependencies:** M3.5.1-T1, M3.5.1-T8 (Selection Context)

**Design Rationale:**
Auto-appearing action bars are intrusive in card game contexts where selection is high-frequency but actions are lower-frequency. The Action Handle uses progressive disclosure: a minimal handle appears on selection, expanding to full action bar only when explicitly requested.

**Spec:**

**Collapsed State (Default):**
- Small action handle (28px rounded pill) appears at top-right of selection bounds (+8px margin)
- Icon adapts to selection context:
  - Single stack: `🎴` (cards icon)
  - Multi-select: Badge with count (e.g., `3`)
  - Mixed objects: `⚡` (generic actions icon)
- Visual design:
  - Semi-transparent background (80% opacity)
  - Subtle shadow for depth
  - Hover increases opacity to 100%
- Behavior:
  - Appears immediately on selection
  - Follows selection with smooth tween (150ms ease-out)
  - Hidden during drag operations (reappears on pointer-up)
  - Viewport-aware positioning (flips to left/bottom if clipped)

**Expanded State:**
- Handle expands into full action bar on:
  - Click on handle
  - Hover over handle for 200ms
  - Press `E` keyboard shortcut (mnemonic: "Edit actions")
- Layout adapts to selection:
  - **Single stack:** `[🔄 Flip] [↻ Rotate] [⋮ More]`
  - **Multiple stacks:** `[3 Selected] [↻ Rotate All] [⋮ More]`
  - **Mixed objects:** `[↻ Rotate All] [🗑️ Delete] [⋮ More]`
  - **Locked objects:** `[🔒 Locked] [Unlock] [⋮ More]`
- Positioned above handle (handle becomes bottom edge)
- Animated expand/collapse (150ms ease)
- Collapses on:
  - Click outside
  - Press `Escape`
  - Execute an action
  - Deselect objects

**Viewport Boundary Handling:**
- If no room above selection: flip to below (+8px gap)
- If no room on right: flip to left side of selection
- If selection too close to edge: center on screen (fallback)
- Always keeps handle + expanded bar fully visible

**Follow Selection:**
- Position updates when selected objects move
- Smooth position updates (tween, 150ms ease-out)
- Temporarily hides during rapid movement, reappears on settle

**"More" Menu:**
- Dropdown with additional actions (uses ContextMenu component)
- Opens downward from More button
- Contains less-common actions beyond top 2-3

**Keyboard Integration:**
- `E`: Toggle expanded state
- `Escape`: Collapse (if expanded)
- `1-9`: When expanded, trigger actions 1-9 in order
- Works with existing action keyboard shortcuts

**Integration:**
- Query `ActionRegistry.getAvailableActions()`
- Filter to top 2-3 most relevant actions for main bar
- Remaining actions in "More" menu
- Execute action on click

**Deliverables:**
- `app/src/components/ActionHandle.tsx` (collapsed handle + expanded bar)
- `app/src/components/ActionHandle.test.tsx`
- Position calculation utility: `app/src/utils/selectionBounds.ts`

**Test Plan:**
- E2E: Select object → handle appears at top-right of bounds
- E2E: Click handle → bar expands with actions
- E2E: Hover handle for 200ms → bar expands
- E2E: Press `E` → bar toggles
- E2E: Press `Escape` when expanded → bar collapses
- E2E: Click action → executes and collapses
- E2E: Deselect → handle fades out
- E2E: Handle follows selection when moved
- E2E: Icon adapts to selection context (single/multi/mixed)
- E2E: Handle hidden during drag, reappears on pointer-up
- Unit: Position calculation handles viewport boundaries (flips correctly)
- E2E: "More" menu shows additional actions
- Unit: Keyboard shortcuts (E, Escape, 1-9) work correctly

---

### M3.5.1-T7: Toast Notification System
**Objective:** Error/warning feedback (bottom-left corner).

**Dependencies:** None

**Spec:**
- Position: bottom-left corner, 20px margins
- Stack multiple toasts vertically (max 5 visible)
- Auto-dismiss after 4 seconds
- Manual dismiss button (X icon)
- Variants:
  - **Error:** Red background, `🚫` icon
  - **Warning:** Yellow background, `⚠️` icon
  - **Info:** Blue background, `ℹ️` icon
- Animation:
  - Slide in from left (300ms)
  - Slide out to left on dismiss (200ms)
  - Stack shifts up when toast dismissed
- Queue system:
  - If more than 5 toasts, queue oldest for removal
  - New toasts push from bottom, old toasts slide up
- API:
  ```typescript
  toast.error('Cannot flip: locked by Player 2')
  toast.warning('Connection lost, reconnecting...')
  toast.info('Table saved')
  ```
- Integration:
  - Error boundary fallback
  - Action execution failures
  - Network errors

**Deliverables:**
- `app/src/components/Toast.tsx`
- `app/src/components/ToastContainer.tsx`
- `app/src/hooks/useToast.tsx` (imperative API)
- `app/src/components/Toast.test.tsx`

**Test Plan:**
- Unit: Toast appears with correct variant styling
- Unit: Auto-dismiss after 4s
- Unit: Manual dismiss works
- Unit: Queue limits to 5 toasts
- E2E: Multiple toasts stack correctly
- E2E: Toast animations smooth

---

### M3.5.1-T8: Selection Context System
**Objective:** Centralized selection state management for UI.

**Dependencies:** None (can run parallel to other tasks)

**Spec:**
- React Context + Hook for accessing selection state
- Aggregate selection information:
  ```typescript
  interface SelectionContextValue {
    ids: string[];                    // Selected object IDs
    objects: TableObject[];           // Full objects
    count: number;                    // Quick count
    hasStacks: boolean;               // At least one stack
    hasTokens: boolean;               // At least one token
    hasMixed: boolean;                // Multiple object types
    allLocked: boolean;               // All selected are locked
    allUnlocked: boolean;             // All selected are unlocked
    canAct: boolean;                  // Current actor owns all selected
    center: { x: number; y: number }; // Selection center point (world coords)
    bounds: { x: number; y: number; width: number; height: number };
  }
  ```
- Efficient updates:
  - Only re-render components when selection changes
  - Use React.memo for child components
  - Debounce updates during drag operations
- Integration with YjsStore:
  - Subscribe to `_selectedBy` changes
  - Filter objects owned by current actor
  - Calculate bounds using SceneManager

**Deliverables:**
- `app/src/contexts/SelectionContext.tsx`
- `app/src/hooks/useSelection.tsx`
- `app/src/contexts/SelectionContext.test.tsx`

**Test Plan:**
- Unit: Selection context updates when objects selected
- Unit: Aggregate flags computed correctly (hasStacks, hasMixed, etc.)
- Unit: Center and bounds calculated correctly
- Unit: canAct flag respects ownership
- Integration: Context re-renders components on selection change

---

### M3.5.1-T9: Right-Click Event Integration
**Objective:** Wire context menu to canvas/board.

**Dependencies:** M3.5.1-T4 (ContextMenu), M3.5.1-T8 (Selection Context)

**Spec:**
- Detect right-click on canvas:
  - Pointer event with `button === 2`
  - Prevent default browser context menu (`event.preventDefault()`)
- Hit-testing:
  - Use existing SceneManager hit-test
  - If hit object: show object context menu
  - If miss: show canvas context menu (future: create token, etc.)
- Context menu content:
  - **Object menu:** Actions filtered by object type
    - Single stack: Flip, Rotate, Draw, Shuffle, Lock, Delete
    - Multiple objects: Rotate All, Lock All, Delete All, Stack (if all stacks)
    - Mixed: Rotate All, Delete All
  - **Canvas menu:** (placeholder for now)
    - Create Token
    - Create Zone
    - Paste (future)
- Selection integration:
  - If right-click on selected object: use current selection
  - If right-click on unselected object: select it first, then show menu
  - If right-click on empty space: clear selection, show canvas menu
- Renderer integration:
  - Add `context-menu` message type to renderer
  - Renderer sends `{ type: 'context-menu'; objectId?: string; x: number; y: number }`
  - Board component shows ContextMenu at viewport coordinates

**Deliverables:**
- Integration in `app/src/components/Board.tsx`
- Renderer message handling for context menu
- E2E tests in `app/e2e/context-menu.spec.ts`

**Test Plan:**
- E2E: Right-click on object shows menu
- E2E: Right-click on empty canvas shows canvas menu
- E2E: Right-click on unselected object selects it first
- E2E: Right-click on selected object preserves selection
- E2E: Browser context menu prevented
- E2E: Menu shows correct actions for object type

---

### M3.5.1-T10: PixiJS Animation System
**Objective:** Reusable animation utilities for future actions.

**Dependencies:** None (can run parallel)

**Spec:**
- `AnimationManager` class:
  - Manages animation queue per object
  - Integrates with PixiJS ticker
  - Supports interruption/cancellation
- Tween system:
  ```typescript
  animationManager.tween(object, {
    to: { x: 100, y: 200, rotation: Math.PI, alpha: 0.5 },
    duration: 300,
    easing: 'easeInOutQuad',
    onComplete: () => console.log('Done')
  })
  ```
- Easing functions:
  - Linear
  - EaseInOutQuad
  - EaseInOutCubic
  - Bounce (for card draw)
  - Elastic (for emphasis)
- Predefined animation helpers:
  - `flipAnimation(sprite, duration)`: 3D flip effect (scale.x: 1 → 0 → -1)
  - `slideAnimation(sprite, from, to, duration)`: Smooth slide with ease
  - `bounceAnimation(sprite, height, duration)`: Jump and land
  - `pulseAnimation(sprite, scale, duration)`: Scale up and down
- Integration with PixiJS ticker:
  - Start ticker when animation begins
  - Stop ticker when no active animations (performance)
- Animation chaining:
  ```typescript
  animationManager
    .tween(sprite, { to: { x: 100 }, duration: 200 })
    .then(() => animationManager.tween(sprite, { to: { y: 200 }, duration: 200 }))
  ```

**Deliverables:**
- `app/src/renderer/AnimationManager.ts`
- `app/src/renderer/animations/flip.ts`
- `app/src/renderer/animations/slide.ts`
- `app/src/renderer/animations/bounce.ts`
- `app/src/renderer/AnimationManager.test.ts`
- Integration in `RendererCore.ts`

**Test Plan:**
- Unit: Tween interpolates values correctly
- Unit: Easing functions produce expected curves
- Unit: Animation completes and calls onComplete
- Unit: Animation can be canceled mid-flight
- Unit: Multiple animations queue correctly
- Integration: Flip animation produces 3D flip effect
- Integration: Ticker starts/stops appropriately

---

### M3.5.1-T11: Mock Actions for Testing
**Objective:** Placeholder actions to test entire system end-to-end.

**Dependencies:** M3.5.1-T0 through M3.5.1-T10

**Spec:**
- Register 6 mock actions in `ActionRegistry`:
  1. **Test Flip**: Shows toast "Flipped 1 card"
     - Shortcut: `F`
     - Category: Card Actions
     - Available: Single stack selected
  2. **Test Rotate**: Logs "Rotated X objects" to console
     - Shortcut: `R`
     - Category: Card Actions
     - Available: Any object selected
  3. **Test Draw**: Shows toast "Drew 1 card"
     - Shortcut: `D`
     - Category: Card Actions
     - Available: Single stack selected
  4. **Test Multi-Select**: Logs "Multi-select action"
     - Shortcut: `M`
     - Category: Selection
     - Available: 2+ objects selected
  5. **Test Locked Action**: Shows error toast "Cannot act on locked object"
     - Shortcut: `L`
     - Category: Management
     - Available: Locked object selected
  6. **Test Animation**: Plays flip animation on selected object
     - Shortcut: `A`
     - Category: Testing
     - Available: Any object selected
- Verify all UI components work:
  - Command Palette shows all actions, executes on Enter
  - Context menus show appropriate actions
  - Floating action bar shows top actions
  - Keyboard shortcuts trigger actions
  - Toast notifications appear

**Deliverables:**
- `app/src/actions/mockActions.ts`
- E2E test: `app/e2e/action-system.spec.ts`
  - Open command palette, search, execute
  - Right-click object, execute action
  - Select object, press keyboard shortcut
  - Verify floating action bar appears and works

**Test Plan:**
- E2E: Command Palette → search "flip" → press Enter → toast appears
- E2E: Right-click stack → click "Test Flip" → toast appears
- E2E: Select stack → press F → toast appears
- E2E: Floating action bar → click Flip button → toast appears
- E2E: Select 2 objects → "Test Multi-Select" available
- E2E: Select locked object → "Test Locked Action" shows error toast
- E2E: "Test Animation" plays flip animation on selected object

---

### M3.5.1-T12: Documentation & Integration
**Objective:** Document system architecture and prepare for M3.5.

**Dependencies:** M3.5.1-T0 through M3.5.1-T11

**Spec:**
- Create architecture documentation:
  - System overview diagram
  - Action registration guide
  - UI component integration guide
  - Keyboard shortcut conventions
  - Animation system usage
- "How to Add an Action" guide for M3.5:
  ```markdown
  # Adding a New Action

  1. Implement action function in `YjsActions.ts`:
     ```typescript
     export function flipCards(store: YjsStore, ids: string[]): string[] {
       // Implementation
     }
     ```

  2. Register action in `ActionRegistry`:
     ```typescript
     actionRegistry.register({
       id: 'flip-cards',
       label: 'Flip Cards',
       icon: '🔄',
       shortcut: 'F',
       category: CARD_ACTIONS,
       isAvailable: (ctx) => ctx.selection.hasStacks,
       execute: (ctx) => flipCards(ctx.store, ctx.selection.ids)
     });
     ```

  3. (Optional) Add animation in renderer
  4. (Optional) Add tests
  ```
- Update CLAUDE.md:
  - Mark M3.5.1 as complete
  - Add to Recent Changes
  - Document new architecture
- Clean up:
  - Remove mock actions from registry
  - Leave `mockActions.ts` for reference
  - Ensure no test code in production

**Deliverables:**
- `_plans/M3.5.1_ui_action_architecture.md` (this file, updated with completion notes)
- `app/src/actions/README.md` (architecture guide)
- `app/src/actions/ADDING_ACTIONS.md` (developer guide)
- Updated `CLAUDE.md`

**Test Plan:**
- Verify all unit tests pass
- Verify all E2E tests pass
- Verify documentation is accurate and complete

---

## Testing Strategy

### Unit Tests
- Run with every task completion
- Target: 80%+ coverage for new code
- Focus on business logic, edge cases, error handling

### E2E Tests
- Written during relevant tasks (T3, T4, T5, T6, T9, T11)
- Use Playwright
- Test user workflows:
  - Keyboard shortcuts
  - Command palette search and execution
  - Context menu interactions
  - Floating action bar clicks
  - Multi-step flows (right-click → menu → action → toast)

### Integration Tests
- Task 11 is the main integration test
- Verify all components work together
- Mock actions exercise full system

## Success Criteria

**M3.5.1 is complete when:**
1. ✅ All 13 tasks completed and tested (T0 through T12)
2. ✅ Board displays full-screen at `/table/:id`
3. ✅ Debug board accessible at `/dev/table/:id`
4. ✅ Mock actions work in all UI components:
   - Command Palette (⌘K)
   - Context menus (right-click)
   - Floating action bar
   - Keyboard shortcuts
5. ✅ Animation system functional (flip animation demo)
6. ✅ Toast notifications appear for errors
7. ✅ All tests passing (unit + E2E)
8. ✅ Documentation complete
9. ✅ Ready for M3.5 (actual game actions)

## What M3.5 Will Add

After M3.5.1 is complete, M3.5 will implement actual game actions:
- `flipCards(store, ids)` - Toggle face up/down
- `rotateObjects(store, updates)` - Rotate objects
- `unstackCard(store, stackId, cardIndex, pos)` - Draw card from stack
- `stackObjects(store, ids, targetId?)` - Merge stacks
- `lockObjects(store, ids)` / `unlockObjects(store, ids)` - Lock management
- `deleteObjects(store, ids)` - Delete objects
- `reorderObjects(store, updates)` - Z-order management

Each action will:
1. Implement function in `YjsActions.ts`
2. Register in `ActionRegistry`
3. Add renderer support (if needed)
4. Add animation (if applicable)
5. Write tests

The UI will automatically light up! 🎉

## Notes

- This milestone is purely UI/infrastructure - no game logic
- Mock actions are placeholders for testing
- Animation system is designed for snappy, playful animations (not slow transitions)
- Toast notifications are error-only (no success toasts for normal operations)
- Command Palette is inspired by VSCode, Raycast, Linear
- Floating Action Bar is inspired by Google Docs, Figma
- Context menus follow standard OS patterns

## Estimated Complexity
- **High complexity:** T6 (Floating Action Bar), T10 (Animation System)
- **Medium complexity:** T1 (Action Registry), T3 (Command Palette), T4 (Context Menu), T8 (Selection Context)
- **Low complexity:** T0 (Full-Screen Layout), T2 (Keyboard Manager), T5 (Global Menu Bar), T7 (Toast), T9 (Right-Click), T11 (Mock Actions), T12 (Docs)

## Status
⏸️ Not started — Branch: `feature/m3.5.1-ui-action-system`
