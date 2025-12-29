# Toast Notification System

## Overview
Implement a user-facing toast notification system to provide feedback for operations, errors, and important events. Currently, operation failures (like stack/unstack errors) are only logged to the console, making them invisible to users.

## Status
📋 **Planned** - Not yet started

## Priority
**Medium-High** - Essential for production user experience, but not blocking core functionality

## Motivation
**Problem:** Users have no visual feedback when operations fail or succeed:
- Stack operations fail silently (console only)
- Unstack operations return null without user notification
- No confirmation for successful bulk operations
- Errors are invisible to users unless they check browser console

**Solution:** Lightweight toast notification system for transient messages

## Goals
1. Provide immediate visual feedback for user actions
2. Surface errors and warnings that are currently console-only
3. Confirm successful operations (optional, user-configurable)
4. Maintain minimal UI disruption (non-blocking, auto-dismiss)
5. Support multiple simultaneous toasts (stacked or queued)
6. Accessible (screen reader support, keyboard dismissal)

## Non-Goals
- Full notification center / history
- Persistent notifications (use modal dialogs for critical errors)
- Complex notification types (only success/error/warning/info)
- Rich media (images, videos, interactive buttons)

## Design Decisions

### Visual Design
**Position:** Bottom-right corner (configurable via settings later)

**Appearance:**
- Card-style with subtle shadow/elevation
- Color-coded by type:
  - Success: Green accent (#10b981)
  - Error: Red accent (#ef4444)
  - Warning: Amber accent (#f59e0b)
  - Info: Blue accent (#3b82f6)
- Icon prefix (✓ × ⚠ ℹ)
- Close button (×)
- Progress bar for auto-dismiss countdown
- Dark mode support (inherit from app theme)

**Animation:**
- Slide in from right (150ms ease-out)
- Slide out to right (150ms ease-in)
- Fade + slide for smooth appearance

**Stack Behavior:**
- Maximum 3 visible toasts
- Older toasts push up (stack vertically)
- New toasts appear at bottom of stack
- Excess toasts queued (FIFO)

### Technical Architecture

**Component Structure:**
```
ToastProvider (Context + State)
├── ToastContainer (Renders stack)
│   └── Toast (Individual notification)
└── useToast() hook (Add/remove toasts)
```

**State Management:**
- React Context + reducer pattern
- Toast queue in application state
- Auto-dismiss timers per toast
- Unique ID per toast (UUID)

**API Design:**
```typescript
interface ToastOptions {
  title: string;
  description?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number; // ms, default 4000, 0 = manual dismiss
  dismissible?: boolean; // default true
}

const toast = useToast();
toast.show({ title: 'Stack merged', type: 'success' });
toast.error('Failed to unstack card'); // Convenience method
toast.success('Objects moved');
toast.dismiss(toastId); // Manual dismiss
toast.dismissAll(); // Clear all toasts
```

### Integration Points

**Locations to Add Toast Notifications:**

1. **BoardMessageBus.ts** (Operation results):
   - `stack-objects` handler: Error feedback
   - `unstack-card` handler: Error/warning feedback
   - `objects-moved` handler: Optional success (configurable)

2. **YjsActions.ts** (Data layer errors):
   - Not directly - keep console logging
   - Let callers (BoardMessageBus) handle user notifications

3. **Future Integration Points:**
   - File upload/download operations
   - Network connection status changes
   - Autosave confirmation
   - Undo/redo feedback
   - Bulk operations (delete 20 objects)

## Implementation Plan

### Phase 1: Core Toast Component (Milestone: M6)
**Objective:** Build reusable toast component with basic functionality

**Tasks:**
1. Create `Toast.tsx` component
   - Visual design (card, colors, icons)
   - Close button
   - Progress bar for auto-dismiss
   - Accessibility attributes (role="alert", aria-live)

2. Create `ToastContainer.tsx`
   - Fixed positioning (bottom-right)
   - Stack layout (vertical)
   - Animation handling (Framer Motion or CSS transitions)

3. Write unit tests
   - Toast rendering
   - Auto-dismiss timing
   - Manual dismiss
   - Accessibility

**Deliverables:**
- `app/src/components/Toast/Toast.tsx`
- `app/src/components/Toast/ToastContainer.tsx`
- `app/src/components/Toast/Toast.test.tsx`
- Basic Storybook stories (optional)

**Dependencies:** None

### Phase 2: State Management & Context (Milestone: M6)
**Objective:** Implement toast state management with React Context

**Tasks:**
1. Create `ToastContext.tsx`
   - React Context + Provider
   - Toast queue state (reducer pattern)
   - Add/remove/dismiss actions
   - Auto-dismiss timer management

2. Create `useToast()` hook
   - Convenience methods (show, success, error, warning, info)
   - Toast ID generation (UUID)
   - Type-safe API

3. Write unit tests
   - Toast queue operations
   - Timer lifecycle
   - Multiple simultaneous toasts
   - Max queue size (FIFO eviction)

**Deliverables:**
- `app/src/components/Toast/ToastContext.tsx`
- `app/src/components/Toast/useToast.ts`
- `app/src/components/Toast/ToastContext.test.tsx`

**Dependencies:** Phase 1

### Phase 3: App Integration (Milestone: M6)
**Objective:** Wire toast system into application and add notifications

**Tasks:**
1. Add `ToastProvider` to app root
   - Wrap main `<RouterProvider>` in `ToastProvider`
   - Ensure context available to all routes

2. Update `BoardMessageBus.ts`
   - Import `useToast` hook (pass via context)
   - Add error toasts for stack/unstack failures
   - Add warning toasts for null returns

3. Add user settings (optional)
   - Toggle success notifications on/off
   - Adjust auto-dismiss duration
   - Persistent in localStorage

4. E2E tests
   - Trigger stack error, verify toast appears
   - Verify toast auto-dismisses
   - Verify multiple toasts stack correctly

**Deliverables:**
- Updated `app/src/main.tsx` or equivalent
- Updated `app/src/components/Board/BoardMessageBus.ts`
- `app/e2e/toast-notifications.spec.ts`

**Dependencies:** Phase 2

### Phase 4: Polish & Accessibility (Milestone: M6)
**Objective:** Refine UX and ensure accessibility compliance

**Tasks:**
1. Animation polish
   - Smooth slide + fade transitions
   - Stagger animations for multiple toasts
   - Reduce motion support (prefers-reduced-motion)

2. Accessibility audit
   - Screen reader testing (NVDA, VoiceOver)
   - Keyboard navigation (dismiss with Escape)
   - Focus management (don't trap focus)
   - ARIA labels and roles

3. Dark mode support
   - Theme-aware colors
   - Ensure contrast ratios (WCAG AA)

4. Performance testing
   - Verify no jank with 10+ rapid toasts
   - Memory leak check (timer cleanup)

**Deliverables:**
- Accessibility documentation
- Performance test results
- Design system integration (if applicable)

**Dependencies:** Phase 3

## Technical Specifications

### Toast Data Model
```typescript
interface Toast {
  id: string; // UUID
  title: string;
  description?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number; // ms, 0 = no auto-dismiss
  dismissible: boolean;
  createdAt: number; // timestamp
}

interface ToastState {
  toasts: Toast[];
  maxVisible: number; // default 3
}

type ToastAction =
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string } // toast ID
  | { type: 'DISMISS_ALL' };
```

### Context API
```typescript
interface ToastContextValue {
  toasts: Toast[];
  addToast: (options: ToastOptions) => string; // returns toast ID
  removeToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
```

### Convenience API
```typescript
// In useToast hook
return {
  ...contextValue,
  success: (title: string, description?: string) =>
    addToast({ title, description, type: 'success' }),
  error: (title: string, description?: string) =>
    addToast({ title, description, type: 'error' }),
  warning: (title: string, description?: string) =>
    addToast({ title, description, type: 'warning' }),
  info: (title: string, description?: string) =>
    addToast({ title, description, type: 'info' }),
};
```

## Testing Strategy

### Unit Tests
- Toast component rendering
- Auto-dismiss timer behavior
- Manual dismiss
- Toast queue FIFO
- Maximum visible limit
- Context provider/consumer

### E2E Tests
- Trigger operation error, verify toast appears
- Verify toast content accuracy
- Verify auto-dismiss after duration
- Verify manual dismiss (click X)
- Verify multiple toasts stack correctly
- Verify keyboard dismiss (Escape)
- Verify screen reader announcement

### Accessibility Tests
- ARIA attributes present
- Screen reader announces toasts
- Keyboard navigation works
- Focus management correct
- Color contrast meets WCAG AA

## UI/UX Considerations

### Animation Timing
- **Slide in:** 150ms ease-out
- **Slide out:** 150ms ease-in
- **Stagger delay:** 50ms between toasts
- **Auto-dismiss:** 4000ms default (success), 6000ms (error/warning)

### Responsive Design
- **Desktop:** Bottom-right, 360px width
- **Tablet:** Bottom-right, 320px width
- **Mobile:** Bottom-center, full width minus 16px margin

### Stack Behavior Example
```
[Toast 3 - oldest, top]
[Toast 2]
[Toast 1 - newest, bottom]
```

New toast pushes all up, oldest (4th) queued.

## Dependencies

### New Dependencies
- **UUID generation:** Use `crypto.randomUUID()` (built-in, no package needed)
- **Animation library:** Framer Motion (already in project?) or CSS transitions

### Existing Dependencies
- React 19 (Context API)
- TypeScript
- Tailwind CSS (styling)

## Success Criteria
1. ✅ Users see visual feedback for operation failures
2. ✅ Error messages are user-friendly (not technical jargon)
3. ✅ Toasts auto-dismiss without user action
4. ✅ Multiple toasts don't overlap or obscure UI
5. ✅ Accessible to screen reader users
6. ✅ Works in dark mode
7. ✅ No performance impact (smooth 60fps)

## Future Enhancements (Post-MVP)
- Notification history panel
- Persistent notifications for critical errors
- Action buttons in toasts ("Undo", "Retry", etc.)
- Custom positions (top-right, top-center, etc.)
- Sound effects (optional, muted by default)
- Rich content (markdown, links)
- Group similar toasts ("5 objects deleted")
- Toast templates for common messages

## References
- [Headless UI Notifications (future consideration)](https://headlessui.com/)
- [Radix UI Toast](https://www.radix-ui.com/primitives/docs/components/toast)
- [React Hot Toast](https://react-hot-toast.com/) - Similar pattern
- [ARIA: alert role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/alert_role)
- [WCAG 2.1 Success Criterion 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html)

## Notes
- Keep toast messages concise (< 2 lines)
- Avoid jargon in user-facing messages
- Test with screen readers early
- Consider user settings for notification preferences
- Don't use toasts for critical errors (use modals)
- Provide context in error messages ("Failed to merge stacks: Target stack not found")

## Open Questions
1. Should we use Headless UI Notification component or build from scratch?
   - **Decision pending:** Evaluate after Phase 1 prototype
2. Do we need toast persistence across page refreshes?
   - **Decision:** No, toasts are transient
3. Should success toasts be user-configurable (on/off)?
   - **Decision:** Yes, add to settings in Phase 3
4. What's the maximum queue size before we drop old toasts?
   - **Decision:** No hard limit, but max 3 visible, rest queued FIFO
