# Attachment UI Proposals

Three UI approaches for displaying attached cards, to be prototyped in parallel worktrees.

---

## Proposal A: Spine + Slide-Out + Fan

**Three-tier progressive disclosure.**

### Resting State
- Full-width "spine" strips behind the parent, one per card
- Spine width: `max(12px, 40px / sqrt(count))` — shrinks logarithmically
- Total overhang stays bounded (40px for 1 card, ~180px for 15+)
- Count badge at 8+ cards
- Subtle shadow layering between spines (1-2px, 10% opacity)
- Spines at 90% brightness, brighten to 100% on hover

### Quick Inspect (Slide-Out)
- Hover a spine (120ms delay) → that card slides out **perpendicular** to the attachment axis
- Slides out ~80% visible, 20% stays tucked to maintain visual connection
- 180ms ease-out spring animation
- Elevated shadow on slid-out card (8px blur, 20% opacity)
- Other spines dim to 80% brightness
- Spine-to-spine transition: crossfade (one slides back while next slides out, 150ms)

### Full Inspect (Fan-Out)
- Trigger: **Scroll wheel** on parent card, or **double-click** parent
- Cards spread into semicircular arc on attachment side
- Arc radius scales with count, min 30-degree separation between cards
- Cards overlap ~20% in the arc
- Center card on top, edges progressively underneath
- 15% dark overlay dims rest of table
- 300ms ease-out-back animation with 30ms stagger per card
- Dismiss: click outside, Escape, or scroll up

### Detach
- From spine: "Peel" interaction — card resists for first 10px (0.3x cursor speed), then snaps to 1:1 tracking
- 3-5 degree tilt in drag direction during drag
- Gap closes smoothly (200ms ease-in-out, 20ms stagger)
- From fan: card lifts (1.08x scale), pulls free, remaining cards redistribute
- Fan stays open during drag from fan state

### Direction Handling
- Below: spines extend below, slide-out goes right
- Above: spines extend above, slide-out goes right
- Left: spines extend left, slide-out goes down
- Right: spines extend right, slide-out goes down
- Slide-out flips direction if it would go off-screen

---

## Proposal B: Orbital Bloom

**Clean two-state model with peek strips and orbital expansion.**

### Resting State
- Peek strips behind parent, decreasing offset per card
- Peek depth: `max(16px, availableSpace / count)` where availableSpace = cardHeight * 0.6
- 2px horizontal stagger between peeks for subtle depth
- Compression at 10+ cards: shows first 3 + last 2 peeks with "..." indicator between
- Count badge (circular pill, 4+ cards): dark semi-transparent background, white bold text, 24px min
- Subtle colored edge tint per peek (derived from card art dominant color)

### Inspect (Orbital Bloom)
- Trigger: Hover parent 400ms, OR hover any peek (immediate)
- Cards bloom into curved orbital arc: 65% scale, rotated to follow arc
- Arc radius: `cardHeight * 1.2 + (count * 8)`
- Angular spread: `min(count * 6, 60)` degrees
- Connection lines: thin semi-transparent curves (1.5px, 15% opacity) from each orbital card to parent
- 350ms spring animation (damping 0.7, stiffness 180), 30ms stagger per card
- Double arc at 10+ cards: inner arc (cards 1-8, 65% scale), outer arc (remaining, 55% scale)
- Close: mouse leaves region for 300ms
- Only one orbital open at a time

### Inspect Individual Card
- Hover orbital card → scales from 65% to 70%, brightness 1.08x
- Other orbital cards dim to 95% brightness
- Existing preview tooltip activates on continued hover
- 120ms ease-out transition

### Detach
- From peek (quick): hover peek → tooltip shows card name → drag to detach
- Card animates from peek position to full size under cursor
- From orbital (deliberate): press orbital card → lifts (scale 0.9, shadow increase)
- Drag > 20px from fan position → detaches, orbital collapses
- Count badge decrements immediately

### Direction Handling
- All four directions supported
- Orbital arc emanates from the attachment edge
- Peek strips extend in the specified direction
- If orbital would exceed viewport, flips to opposite direction

---

## Proposal C: Stacked Peek + Fan Arc

**Simplest model with physical "deck" feel.**

### Resting State
- Cards stacked behind parent with decreasing offset AND 2px lateral stagger
- Offset per card: `max(8px, 40px / sqrt(count))`
- Total max footprint: `cardHeight + min(80px, totalOffset)`
- Lateral offset capped at 20px total — creates "deck thickness" visual
- Count badge: rounded rectangle, 24x20px min, inset 8px from corner
- Attachment edge glow: warm amber/gold (#D4A04A, 40% opacity, 3px soft glow)

### Inspect (Fan Arc)
- Trigger: Hover badge or peek area (180ms delay)
- Cards fan into curved arc at 55% scale
- Arc radius: `cardHeight * 1.2`
- Angular spread: `min(140deg, count * 20deg)`
- Per-card angle: max 20 degrees
- 280ms cubic-bezier(0.34, 1.56, 0.64, 1) with 25ms stagger — slight overshoot for spring feel
- Double arc at 10+ cards: inner arc (first 9), outer arc (remaining)
- Close: mouse leaves for 250ms, or 220ms reverse animation

### Inspect Individual Card
- Hover fan card → scales from 55% to 85%
- Neighboring cards shift apart 15px (120ms ease-out)
- Existing preview tooltip activates
- Z-order lifts above other fan cards

### Detach
- From fan: press card → scale to 0.9, shadow increase → drag > 20px → detaches
- Fan closes behind dragged card (220ms)
- From peek: direct drag on topmost visible peek card
- No magnetic resistance, clean 20px threshold

### Attach Feedback
- Drop target: amber glow brightens to 80% opacity, 5px width
- Snap preview: dragged card shrinks to 55% and previews position
- "Thunk" bounce on attach: scale 1.0 → 0.95 → 1.0 over 150ms

### Direction Handling
- All four directions supported
- Left/right: lateral offset becomes vertical stagger
- Fan arc emanates from attachment edge
- If fan would exceed viewport, reduces arc radius and card scale
- Below 0.35x scale: falls back to scrollable horizontal strip
