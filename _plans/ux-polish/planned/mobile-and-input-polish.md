# Milestone 8 — Mobile & Input Polish

## Overview
Optimize the user interface and input handling for mobile devices with responsive layouts and proper touch targets.

## Prerequisites
- Milestone 7 completed (offline support)

## Design Requirements
- Minimum touch target: 44×44px
- Support portrait and landscape orientations
- High contrast for outdoor visibility
- Smooth gesture handling with appropriate slop thresholds

## Tasks

### M8-T1: Responsive Layout
**Objective:** Implement responsive design that works well on all screen sizes and orientations.

**Dependencies:** M7 complete

**Spec:**
- Portrait and landscape layouts
- Minimum 44px touch targets
- FAB (Floating Action Button) stack on small screens
- Responsive header/toolbar
- Collapsible UI panels
- Screen breakpoints:
  - Mobile: <768px
  - Tablet: 768px-1024px
  - Desktop: >1024px

**Deliverables:**
- Responsive CSS/styled-components
- Media query system
- FAB component for mobile
- Collapsible panel system
- Orientation change handling
- Safe area insets for notched devices

**Test Plan:**
- Test on device profiles:
  - iPhone SE, 12, 14 Pro
  - Pixel 4a, 6, 7 Pro
  - iPad Mini, iPad Pro
- Verify touch targets ≥44px
- Test orientation changes
- Verify no UI cutoff on notched devices
- Test with browser dev tools

### M8-T2: Pointer Slop
**Objective:** Apply appropriate drag thresholds based on input device type.

**Dependencies:** M8-T1

**Spec:**
- Slop thresholds by pointer type:
  - Touch: 12px
  - Pen/stylus: 6px
  - Mouse: 3px
- Detect pointer type from events
- Apply threshold before drag starts
- Prevent accidental drags on scroll
- Handle multi-touch properly

**Deliverables:**
- Pointer type detection utility
- Slop threshold system
- Drag initiation logic
- Touch event normalization
- Gesture conflict resolution

**Test Plan:**
- Unit tests:
  - Synthetic event sequences
  - Verify drag only starts beyond threshold
  - Test each pointer type
- E2E tests:
  - Touch scrolling doesn't trigger drag
  - Quick taps don't move objects
  - Deliberate drags work smoothly
- Manual testing:
  - Test on real devices with touch/stylus
  - Verify thresholds feel natural