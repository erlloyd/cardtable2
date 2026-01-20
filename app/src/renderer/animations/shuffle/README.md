# Shuffle Animations

This directory contains modular shuffle animation variants that can be easily swapped for testing and comparison.

## How to Switch Animations

To change the active shuffle animation, edit the `ACTIVE_SHUFFLE_ANIMATION` constant in `index.ts`:

```typescript
export const ACTIVE_SHUFFLE_ANIMATION: ShuffleAnimationType = 'wobble'; // Change this!
```

## Available Animations

**Currently Active:** `burst-background-wobble` (see `index.ts:ACTIVE_SHUFFLE_ANIMATION`)

### 1. `wobble`

**File:** `wobble.ts`

Simple wobble + scale pulse animation.

- **Duration:** 360ms
- **Feel:** Subtle shake that indicates shuffling is happening
- **Visual:** Stack wobbles left/right with scale pulse
- **Pros:** Lightweight, doesn't obscure the card, fallback for errors
- **Cons:** Doesn't convey individual cards moving

### 2. `spin`

**File:** `spin.ts`

Face card spins rapidly (5 full rotations) while wobbling.

- **Duration:** 400ms
- **Feel:** Dynamic spinning motion
- **Visual:** Card rotates 1800° (5 × 360°) during shuffle
- **Pros:** More dramatic, shows "action" is happening
- **Cons:** Can be disorienting, doesn't show individual cards

### 3. `burst`

**File:** `burst.ts`

Cards "burst out" and back in with motion blur effect.

- **Duration:** 450ms
- **Feel:** Cards scattering and regathering
- **Visual:** Rapid position changes with alpha/scale creating motion blur
- **Pros:** Suggests cards moving around
- **Cons:** Simplified version (see "Future Enhancements")

### 4. `burst-ghost`

**File:** `burst-ghost.ts`

Variant of `burst` that emphasizes motion with ghosted card visuals.

- **Duration:** 450ms
- **Feel:** Lively scatter with trailing impressions of card motion
- **Visual:** Cards appear to leave faint "ghost" copies as they move
- **Pros:** Stronger sense of speed and direction
- **Cons:** Slightly busier visual, can be more distracting

### 5. `burst-background`

**File:** `burst-background.ts`

Background-focused burst effect to highlight shuffling without moving the main card as much.

- **Duration:** 450ms
- **Feel:** Energetic shuffle implied through background motion
- **Visual:** Emphasizes background/stack movement rather than individual cards
- **Pros:** Keeps primary card more readable while still conveying action
- **Cons:** Motion may feel less literal than moving cards

### 6. `burst-background-wobble`

**File:** `burst-background-wobble.ts`

Combines the background burst effect with a wobble on the card stack.

- **Duration:** 450ms
- **Feel:** High-energy shuffle with both background and stack motion
- **Visual:** Background burst plus subtle stack wobble/scale for added impact
- **Pros:** Most dynamic of the burst variants, matches current default setting
- **Cons:** Heavier visual motion, may be too intense for some users

## Testing Workflow

1. Change `ACTIVE_SHUFFLE_ANIMATION` in `index.ts`
2. Reload the page (Vite will hot-reload)
3. Select a stack and press 'S' to shuffle
4. Compare the animations

## Future Enhancements

The `burst` animation is a simplified version using position + alpha. A more advanced implementation could:

1. **Add Temporary Child Visuals**
   - Render actual card rectangles as temporary children
   - Animate them flying out in different directions
   - Remove them after animation completes
   - Requires: Extending AnimationManager or creating custom animation system

2. **Multi-card "Fan" Effect**
   - Create 3-5 card visuals that spread out like a fan
   - Each card follows a different trajectory
   - Cards return to center and disappear

3. **Particle System**
   - Spawn small card-shaped particles
   - Particles scatter and converge
   - More like a "poof" effect

## Additional Animation Ideas

Here are more animation concepts that could be implemented:

### Riffle Shuffle

- Split the visual into two halves
- Interleave them back together
- Mimics real-world riffle shuffle technique

### Spread and Gather

- Cards fan out horizontally in an arc
- Brief pause
- Cards snap back together
- Creates a "checking the cards" feel

### Casino Dealer

- Quick horizontal slides (left-right-left)
- Slight vertical bounce
- Professional, fast-paced feel

### Blur Burst

- Rapid rotation with scale changes
- Add motion blur via alpha stepping
- Creates a "speed" impression

### Fountain Shuffle

- Cards arc upward and downward
- Like a fountain of cards
- Requires vertical position animation

### Shake and Settle

- Violent shaking (high frequency, small amplitude)
- Gradually settles down
- Like shaking a bag of cards

## Implementation Pattern

All animations follow the same signature:

```typescript
export function animateShuffle[Variant](
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration?: number,
  onComplete?: () => void,
): void {
  // Implementation
}
```

This allows easy swapping via the `SHUFFLE_ANIMATIONS` map in `index.ts`.

## Contributing New Animations

To add a new animation:

1. Create `my-animation.ts` in this directory
2. Implement the function matching `ShuffleAnimationFn` signature
3. Import it in `index.ts`
4. Add to `ShuffleAnimationType` union type
5. Add to `SHUFFLE_ANIMATIONS` map
6. Document it in this README

Example:

```typescript
// my-animation.ts
export function animateShuffleMyAnimation(
  animationManager: AnimationManager,
  visualId: string,
  objectVisuals: Map<string, Container>,
  duration = 300,
  onComplete?: () => void,
): void {
  // Your implementation here
}

// index.ts
import { animateShuffleMyAnimation } from './my-animation';

export type ShuffleAnimationType = 'wobble' | 'spin' | 'burst' | 'my-animation';

export const SHUFFLE_ANIMATIONS = {
  // ... existing
  'my-animation': animateShuffleMyAnimation,
};
```
