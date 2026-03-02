# Landing Page Redesign — Design Specification

**Status**: Completed
**Theme**: UX Polish
**Completed**: PR #74 (merged)
**Target files**:
- `app/src/routes/index.tsx` — page component
- `app/src/components/GameSelector.tsx` — new game selector (replaced `GameCombobox.tsx`)
- `app/src/index.css` — global styles

**Implementation notes**: The final implementation simplified the original two-step flow
(select game -> click "Open Table") into a direct-launch flow where clicking a game card
navigates immediately to the table. This removed the need for selected state, checkmark
indicators, the separate launch button, and the table name preview row. The `GameSelector`
component takes an `onGameLaunch` callback instead of `selectedGame`/`onGameSelect` props.

---

## Design Intent

The landing page is the first impression of the product. Currently it is a plain centered form with no visual atmosphere. The redesign establishes Cardtable as a premium, focused experience — a game launcher that feels inviting and intentional, not generic.

The design language follows three principles already present in the app:
1. **Dark glassmorphism** — surfaces float over deep backgrounds via `backdrop-filter: blur` and translucent fills
2. **Indigo accent** — `rgba(79, 70, 229, _)` is the primary action color throughout the app and should anchor the CTA here
3. **Restraint** — motion and decoration serve clarity; they do not perform for their own sake

---

## Color Tokens (reference throughout spec)

These are the exact values to use. Do not invent new colors; derive all surfaces from these.

```
--bg-base:          #0f0f14          /* deeper than the app's #242424 — creates contrast with glass panels */
--bg-surface:       rgba(255, 255, 255, 0.04)   /* card/panel background */
--bg-surface-hover: rgba(255, 255, 255, 0.07)
--bg-surface-selected: rgba(79, 70, 229, 0.18)

--border-subtle:    rgba(255, 255, 255, 0.08)
--border-accent:    rgba(79, 70, 229, 0.5)

--accent:           rgba(79, 70, 229, 1)         /* indigo-600 equivalent */
--accent-dim:       rgba(79, 70, 229, 0.9)
--accent-glow:      rgba(99, 102, 241, 0.35)     /* indigo-500 at low opacity for glow effects */

--text-primary:     rgba(255, 255, 255, 0.92)
--text-secondary:   rgba(255, 255, 255, 0.55)
--text-tertiary:    rgba(255, 255, 255, 0.35)
--text-on-accent:   #ffffff

--shadow-card:      0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)
--shadow-card-hover: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(79,70,229,0.3)
--shadow-cta:       0 0 40px rgba(79, 70, 229, 0.4), 0 4px 16px rgba(0,0,0,0.5)
```

---

## Layout Architecture

### Overall Page Structure

The page is a single full-viewport flex column. All content is centered both horizontally and vertically when there are few games; it transitions gracefully when there are many.

```
<div class="game-select">                    /* full-viewport, dark background, radial ambient glow */
  <div class="game-select__ambient" />       /* purely decorative background layer */
  <div class="game-select__content">         /* flex column, max-width 680px, centered, gap 3rem */
    <header class="game-select__hero">       /* branding section */
    <main class="game-select__main">         /* game selector + action area */
  </div>
</div>
```

### Viewport Centering

```css
.game-select {
  min-height: 100vh;
  display: flex;
  align-items: center;         /* vertically center when content is short */
  justify-content: center;
  padding: 2rem 1.5rem;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  background-color: #0f0f14;
}
```

When the game grid grows tall (many games), `align-items: center` naturally shifts to top-align once content overflows — this is the correct behavior, no breakpoint override needed.

### Content Column

```css
.game-select__content {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 3rem;
  position: relative;          /* above the ambient layer */
  z-index: 1;
}
```

---

## Section 1 — Hero / Branding

### Visual Structure

```
<header class="game-select__hero">
  <div class="game-select__logo-mark" />     /* decorative icon mark */
  <h1 class="game-select__title">Cardtable</h1>
  <p class="game-select__tagline">Your table. Any game. Play your way.</p>
</header>
```

### Logo Mark

A pure CSS decorative element — a rounded square with an indigo gradient and a subtle card-fan motif implied by layered pseudo-elements. This avoids any image dependency while giving the page a focal anchor.

```css
.game-select__logo-mark {
  width: 72px;
  height: 72px;
  margin: 0 auto 1.5rem;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.9) 0%, rgba(99, 102, 241, 0.7) 50%, rgba(139, 92, 246, 0.8) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.12),
    0 8px 32px rgba(79, 70, 229, 0.45),
    0 2px 8px rgba(0, 0, 0, 0.4);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Card-fan pseudo-elements — two rotated rectangles suggesting a deck */
.game-select__logo-mark::before,
.game-select__logo-mark::after {
  content: '';
  position: absolute;
  width: 28px;
  height: 38px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.game-select__logo-mark::before {
  transform: rotate(-12deg) translateX(-4px);
  background: rgba(255, 255, 255, 0.75);
}

.game-select__logo-mark::after {
  transform: rotate(6deg) translateX(2px);
  background: rgba(255, 255, 255, 0.95);
}
```

### Title

```css
.game-select__title {
  font-size: clamp(2rem, 5vw, 3rem);   /* fluid: 2rem on mobile, 3rem on desktop */
  font-weight: 700;
  letter-spacing: -0.025em;
  margin: 0 0 0.5rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.1;

  /* Subtle gradient shimmer on the text */
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(199, 210, 254, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

Note: The version string (`CARDTABLE_VERSION`) should be rendered as a small badge beside or below the title, not inline in the `<h1>` text. This keeps the headline clean while preserving the version reference.

```
<h1 class="game-select__title">Cardtable</h1>
<span class="game-select__version">v{CARDTABLE_VERSION}</span>
```

```css
.game-select__version {
  display: block;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}
```

### Tagline

```css
.game-select__tagline {
  font-size: clamp(0.9375rem, 2vw, 1.0625rem);
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
  margin: 0;
  letter-spacing: 0.01em;
  line-height: 1.5;
}
```

Suggested tagline copy: "Your table. Any game. Play your way."
Alternative: "Solo-first card table with multiplayer support." (current copy — acceptable but functional rather than evocative)

---

## Section 2 — Ambient Background

This is a purely decorative layer that gives the dark background visual depth without distracting from content.

```css
.game-select__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

/* Central indigo radial glow — the primary ambient source */
.game-select__ambient::before {
  content: '';
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 600px;
  background: radial-gradient(
    ellipse at center,
    rgba(79, 70, 229, 0.12) 0%,
    rgba(79, 70, 229, 0.04) 40%,
    transparent 70%
  );
  border-radius: 50%;
}

/* Secondary violet/purple glow — bottom right for depth */
.game-select__ambient::after {
  content: '';
  position: absolute;
  bottom: -10%;
  right: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(
    ellipse at center,
    rgba(139, 92, 246, 0.07) 0%,
    transparent 60%
  );
  border-radius: 50%;
}
```

**Performance note**: These are static CSS gradients — zero JavaScript, zero canvas, zero animation cost. They render in a single composite layer.

---

## Section 3 — Game Selector

This is the most complex section. It has three distinct display modes:

- **Loading state**: Skeleton shimmer
- **Single game** (1 game): Compact single-card display, no grid needed
- **Multi-game** (2+ games): Scrollable card grid with search

### Shared Panel Wrapper

All three modes share the same outer glass panel:

```css
.game-select__main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.game-selector-panel {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  overflow: hidden;

  /* Subtle top-edge highlight to sell the glass effect */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgba(0,0,0,0.4),
    0 8px 32px rgba(0,0,0,0.3);
}
```

### 3a. Search Bar (multi-game mode only)

Shown at the top of the panel when `games.length > 1`.

```
<div class="game-selector-search">
  <span class="game-selector-search__icon">⌕</span>    /* or SVG magnifier */
  <input
    class="game-selector-search__input"
    placeholder="Search games..."
    value={query}
    onChange={...}
  />
  {query && (
    <button class="game-selector-search__clear" onClick={() => setQuery('')}>×</button>
  )}
</div>
```

```css
.game-selector-search {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.game-selector-search__icon {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  line-height: 1;
}

.game-selector-search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.9);
  caret-color: rgba(99, 102, 241, 1);
}

.game-selector-search__input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.game-selector-search__clear {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.35);
  font-size: 1.125rem;
  line-height: 1;
  padding: 0.125rem;
  border-radius: 0.25rem;
  transition: color 120ms ease;
}

.game-selector-search__clear:hover {
  color: rgba(255, 255, 255, 0.7);
}
```

### 3b. Game Card Grid

The grid of selectable game cards lives inside `.game-selector-grid`.

```
<div class="game-selector-grid" role="listbox" aria-label="Available games">
  {filteredGames.map(game => (
    <button
      class="game-card {selectedGame?.id === game.id ? 'game-card--selected' : ''}"
      role="option"
      aria-selected={selectedGame?.id === game.id}
      onClick={() => onGameSelect(game)}
      key={game.id}
    >
      <div class="game-card__header">
        <div class="game-card__icon">{/* first letter or placeholder */}</div>
        <div class="game-card__meta">
          <span class="game-card__name">{game.name}</span>
          <span class="game-card__version">v{game.version}</span>
        </div>
        <div class="game-card__check-icon" aria-hidden="true">✓</div>  /* visible only when selected */
      </div>
      <p class="game-card__description">{game.description}</p>
    </button>
  ))}
</div>
```

```css
.game-selector-grid {
  display: grid;
  grid-template-columns: 1fr;          /* single column by default */
  gap: 0;                              /* cards are separated by dividers, not gap */
}

/* 2-column grid when there are 4+ games and viewport is wide enough */
@media (min-width: 560px) {
  .game-selector-grid--multi {
    grid-template-columns: 1fr 1fr;
  }
}
```

### 3c. Individual Game Card

Each card is a `<button>` for full keyboard accessibility.

```css
.game-card {
  /* Reset button styles */
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  /* Layout */
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  width: 100%;

  /* Dividers between cards (not on last child) */
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  /* Transitions */
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease;

  position: relative;
}

.game-card:last-child {
  border-bottom: none;
}

/* 2-column grid: right column cards get a left border instead */
@media (min-width: 560px) {
  .game-selector-grid--multi .game-card:nth-child(even) {
    border-left: 1px solid rgba(255, 255, 255, 0.05);
  }
}

/* Hover state */
.game-card:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

/* Focus-visible (keyboard navigation) */
.game-card:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgba(79, 70, 229, 0.7);
}

/* Selected state */
.game-card--selected {
  background-color: rgba(79, 70, 229, 0.12);
}

.game-card--selected:hover {
  background-color: rgba(79, 70, 229, 0.16);
}

/* Selected: left-edge accent bar */
.game-card--selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: rgba(99, 102, 241, 1);
  border-radius: 0 2px 2px 0;
}
```

### Card Sub-elements

```css
.game-card__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Monogram icon — single colored letter as game avatar */
.game-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.6) 0%, rgba(139, 92, 246, 0.5) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  flex-shrink: 0;
  letter-spacing: -0.01em;
}

.game-card--selected .game-card__icon {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.85) 0%, rgba(139, 92, 246, 0.75) 100%);
  border-color: rgba(99, 102, 241, 0.4);
}

.game-card__meta {
  flex: 1;
  min-width: 0;
}

.game-card__name {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.game-card--selected .game-card__name {
  color: rgba(255, 255, 255, 1);
}

.game-card__version {
  display: block;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.03em;
  font-weight: 400;
  margin-top: 1px;
}

/* Check mark — hidden unless selected */
.game-card__check-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(79, 70, 229, 1);
  border: 1.5px solid rgba(99, 102, 241, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  color: white;
  font-weight: 700;
  flex-shrink: 0;

  /* Hidden by default */
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.game-card--selected .game-card__check-icon {
  opacity: 1;
  transform: scale(1);
}

.game-card__description {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  line-height: 1.5;

  /* Clamp to 2 lines to keep cards uniform height */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.game-card--selected .game-card__description {
  color: rgba(255, 255, 255, 0.6);
}
```

### 3d. Empty Search State

When search produces no results:

```
<div class="game-selector-empty">
  <span class="game-selector-empty__icon">◇</span>
  <p class="game-selector-empty__text">No games match "<em>{query}</em>"</p>
</div>
```

```css
.game-selector-empty {
  padding: 2.5rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.game-selector-empty__icon {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.2);
}

.game-selector-empty__text {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
}

.game-selector-empty__text em {
  font-style: normal;
  color: rgba(255, 255, 255, 0.6);
}
```

---

## Section 4 — Action Area (Table Launch)

This section sits below the game selector panel and is always visible. It contains the table name preview and the launch button.

### Structure

```
<div class="table-launch">
  <div class="table-name-row">
    <div class="table-name-display">
      <span class="table-name-label">Table name</span>
      <span class="table-name-value">{tableName}</span>
    </div>
    <button
      class="table-name-refresh"
      onClick={regenerateName}
      aria-label="Generate new table name"
      title="Generate new name"
    >
      ↻
    </button>
  </div>

  <button
    class="launch-button"
    onClick={handleOpenTable}
    disabled={!selectedGame}
    aria-label={selectedGame ? `Open table for ${selectedGame.name}` : 'Select a game first'}
  >
    <span class="launch-button__label">Open Table</span>
    <span class="launch-button__arrow" aria-hidden="true">→</span>
  </button>
</div>
```

### State management change

The table name should be generated **once on mount** and stored in component state, so the user can see it before clicking. Currently it is generated at click time (`handleOpenTable`). Move it to state:

```tsx
const [tableName, setTableName] = useState(() => uniqueNamesGenerator(nameConfig));

const regenerateName = () => setTableName(uniqueNamesGenerator(nameConfig));

const handleOpenTable = () => {
  if (!selectedGame) return;
  void navigate({ to: '/table/$id', params: { id: tableName }, state: { gameId: selectedGame.id } });
};
```

### Table Name Row

```css
.table-launch {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.table-name-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 0.625rem;
}

.table-name-display {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.table-name-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  line-height: 1;
}

.table-name-value {
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.02em;
}

.table-name-refresh {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.5);
  transition:
    background-color 120ms ease,
    color 120ms ease,
    transform 200ms ease;
}

.table-name-refresh:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
}

/* Spinning animation triggered by JS: add class 'spinning' on click */
.table-name-refresh.spinning {
  transform: rotate(360deg);
  transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

Implementation note: The refresh button's spin is a one-shot animation. In React, toggle a `spinning` boolean in state to `true` on click, then set it back to `false` after 400ms via `setTimeout`. This drives the CSS class without a keyframe animation that would need to be reset.

### Launch Button

This is the primary CTA. It must be the most visually prominent interactive element on the page.

```css
.launch-button {
  /* Reset */
  appearance: none;
  -webkit-appearance: none;
  border: none;
  font-family: inherit;
  cursor: pointer;

  /* Layout */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.9375rem 1.5rem;

  /* Visual */
  background: linear-gradient(135deg, rgba(79, 70, 229, 1) 0%, rgba(99, 102, 241, 0.95) 50%, rgba(109, 40, 217, 0.9) 100%);
  border-radius: 0.75rem;
  color: #ffffff;

  /* Typography */
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;

  /* Depth */
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.3),
    0 4px 16px rgba(79, 70, 229, 0.4),
    0 1px 2px rgba(0, 0, 0, 0.3);

  /* Transitions */
  transition:
    background 150ms ease,
    box-shadow 150ms ease,
    transform 100ms ease,
    opacity 150ms ease;
}

.launch-button:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(99, 102, 241, 1) 0%, rgba(129, 120, 255, 0.95) 50%, rgba(139, 92, 246, 0.95) 100%);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.5),
    0 8px 32px rgba(79, 70, 229, 0.55),
    0 1px 2px rgba(0, 0, 0, 0.3);
  transform: translateY(-1px);
}

.launch-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.3),
    0 2px 8px rgba(79, 70, 229, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.3);
}

.launch-button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(79, 70, 229, 0.5),
    0 4px 16px rgba(79, 70, 229, 0.4);
}

/* Disabled state — no game selected */
.launch-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  background: rgba(79, 70, 229, 0.4);
}

.launch-button__label {
  /* No additional styles needed — inherits from button */
}

.launch-button__arrow {
  font-size: 1.125rem;
  transition: transform 150ms ease;
  display: inline-block;
}

.launch-button:hover:not(:disabled) .launch-button__arrow {
  transform: translateX(3px);
}
```

---

## Section 5 — Loading State

Replace the bare `<p>Loading games...</p>` with a skeleton that mirrors the shape of the real content.

### Structure

```
<div class="game-select">
  <div class="game-select__ambient" />
  <div class="game-select__content">
    <div class="skeleton-hero">
      <div class="skeleton skeleton--logo" />
      <div class="skeleton skeleton--title" />
      <div class="skeleton skeleton--tagline" />
    </div>
    <div class="skeleton-panel">
      <div class="skeleton skeleton--card" />
      <div class="skeleton skeleton--card" />
    </div>
    <div class="skeleton skeleton--button" />
  </div>
</div>
```

### Shimmer Animation

```css
@keyframes skeleton-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}

.skeleton {
  border-radius: 0.5rem;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.04) 0%,
    rgba(255,255,255,0.08) 40%,
    rgba(255,255,255,0.04) 80%
  );
  background-size: 600px 100%;
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
}

.skeleton--logo {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  margin: 0 auto 1.5rem;
}

.skeleton--title {
  width: 220px;
  height: 2.75rem;
  margin: 0 auto 0.5rem;
  border-radius: 0.5rem;
}

.skeleton--tagline {
  width: 280px;
  height: 1rem;
  margin: 0 auto;
  border-radius: 0.5rem;
}

.skeleton-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.skeleton-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 1rem;
  overflow: hidden;
}

.skeleton--card {
  height: 72px;
  border-radius: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.skeleton--card:last-child {
  border-bottom: none;
}

.skeleton--button {
  height: 52px;
  width: 100%;
  border-radius: 0.75rem;
}
```

---

## Section 6 — Error State

```
<div class="game-select">
  <div class="game-select__ambient" />
  <div class="game-select__content">
    <header class="game-select__hero">
      {/* same hero as normal state */}
    </header>
    <div class="error-panel">
      <div class="error-panel__icon">⚠</div>
      <h2 class="error-panel__title">Could not load games</h2>
      <p class="error-panel__message">{error}</p>
      <button class="error-panel__retry" onClick={retryLoad}>
        Try again
      </button>
    </div>
  </div>
</div>
```

Implementation note: Add a `retryLoad` handler that re-runs the fetch. This requires lifting the fetch into a callable function and keeping an `attemptCount` in state that the `useEffect` depends on (standard retry pattern).

```css
.error-panel {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 100, 100, 0.15);
  border-radius: 1rem;
  padding: 2rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 0 0 1px rgba(255, 100, 100, 0.08) inset;
}

.error-panel__icon {
  font-size: 1.75rem;
  color: rgba(251, 146, 60, 0.8);   /* warm amber, not harsh red */
}

.error-panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.error-panel__message {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.45);
  font-family: 'SF Mono', ui-monospace, monospace;
}

.error-panel__retry {
  appearance: none;
  -webkit-appearance: none;
  margin-top: 0.5rem;
  padding: 0.5rem 1.25rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.8);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.error-panel__retry:hover {
  background: rgba(255, 255, 255, 0.13);
}
```

---

## Section 7 — Entrance Animation

A subtle staggered fade-in that plays once on first load. This makes the page feel alive without being distracting. Use CSS `animation` rather than JavaScript animation libraries.

```css
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.game-select__hero {
  animation: fade-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: 80ms;
}

.game-selector-panel {
  animation: fade-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: 160ms;
}

.table-launch {
  animation: fade-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: 220ms;
}
```

Accessibility: Respect `prefers-reduced-motion`. Wrap these declarations:

```css
@media (prefers-reduced-motion: reduce) {
  .game-select__hero,
  .game-selector-panel,
  .table-launch {
    animation: none;
  }

  .table-name-refresh.spinning {
    transition: none;
  }

  .skeleton {
    animation: none;
    background: rgba(255,255,255,0.06);
  }
}
```

---

## Section 8 — Responsive Behavior

### Breakpoints

The design uses two breakpoints:

| Breakpoint | Value | Behavior |
|---|---|---|
| Mobile | default (< 480px) | Single column, tighter padding, logo-mark 56px |
| Tablet/Desktop | >= 480px | Standard layout |
| Wide | >= 560px | 2-column game grid (4+ games only) |

### Mobile Adjustments

```css
@media (max-width: 479px) {
  .game-select {
    padding: 1.5rem 1rem;
    align-items: flex-start;     /* top-align on very small screens */
    padding-top: 3rem;
  }

  .game-select__logo-mark {
    width: 56px;
    height: 56px;
    border-radius: 16px;
  }

  .game-select__logo-mark::before,
  .game-select__logo-mark::after {
    width: 22px;
    height: 30px;
  }

  .game-select__content {
    gap: 2rem;
  }

  .game-card {
    padding: 0.875rem 1rem;
  }

  .launch-button {
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }
}
```

---

## Section 9 — Component Hierarchy for Implementation

This section shows the full JSX tree with CSS class assignments for a developer implementing this spec.

### `GameSelect` page (`app/src/routes/index.tsx`)

```tsx
// Loading state
if (loading) {
  return (
    <div className="game-select">
      <div className="game-select__ambient" />
      <div className="game-select__content">
        <div className="skeleton-hero">
          <div className="skeleton skeleton--logo" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--tagline" />
        </div>
        <div className="skeleton-panel">
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
        </div>
        <div className="skeleton skeleton--button" />
      </div>
    </div>
  );
}

// Error state
if (error) {
  return (
    <div className="game-select">
      <div className="game-select__ambient" />
      <div className="game-select__content">
        <header className="game-select__hero">
          <div className="game-select__logo-mark" />
          <h1 className="game-select__title">Cardtable</h1>
          <span className="game-select__version">v{CARDTABLE_VERSION}</span>
          <p className="game-select__tagline">Your table. Any game. Play your way.</p>
        </header>
        <div className="error-panel">
          <div className="error-panel__icon">⚠</div>
          <h2 className="error-panel__title">Could not load games</h2>
          <p className="error-panel__message">{error}</p>
          <button className="error-panel__retry" onClick={retryLoad}>Try again</button>
        </div>
      </div>
    </div>
  );
}

// Normal state
return (
  <div className="game-select">
    <div className="game-select__ambient" />
    <div className="game-select__content">
      <header className="game-select__hero">
        <div className="game-select__logo-mark" />
        <h1 className="game-select__title">Cardtable</h1>
        <span className="game-select__version">v{CARDTABLE_VERSION}</span>
        <p className="game-select__tagline">Your table. Any game. Play your way.</p>
      </header>

      <main className="game-select__main">
        <GameSelector
          games={games}
          selectedGame={selectedGame}
          onGameSelect={setSelectedGame}
        />

        <div className="table-launch">
          <div className="table-name-row">
            <div className="table-name-display">
              <span className="table-name-label">Table name</span>
              <span className="table-name-value">{tableName}</span>
            </div>
            <button
              className={`table-name-refresh${isSpinning ? ' spinning' : ''}`}
              onClick={handleRegenerateName}
              aria-label="Generate new table name"
            >
              ↻
            </button>
          </div>

          <button
            className="launch-button"
            onClick={handleOpenTable}
            disabled={!selectedGame}
          >
            <span className="launch-button__label">Open Table</span>
            <span className="launch-button__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </main>
    </div>
  </div>
);
```

### `GameSelector` component (`app/src/components/GameCombobox.tsx` → rename to `GameSelector.tsx`)

The existing Headless UI `Combobox` is replaced by a plain scrollable list with an inline search input. Headless UI is not needed here because the full list is always visible (not a dropdown); accessibility is achieved via native `role="listbox"` / `role="option"` attributes on plain elements.

The search field (for multi-game mode) is a controlled `<input>` directly in this component. No library needed.

```tsx
function GameSelector({ games, selectedGame, onGameSelect }: GameSelectorProps) {
  const [query, setQuery] = useState('');

  const filteredGames = query === ''
    ? games
    : games.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));

  const isMulti = games.length > 1;

  return (
    <div className="game-selector-panel">
      {isMulti && (
        <div className="game-selector-search">
          <span className="game-selector-search__icon" aria-hidden="true">⌕</span>
          <input
            className="game-selector-search__input"
            placeholder="Search games..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search games"
          />
          {query && (
            <button
              className="game-selector-search__clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {filteredGames.length === 0 ? (
        <div className="game-selector-empty" role="status">
          <span className="game-selector-empty__icon" aria-hidden="true">◇</span>
          <p className="game-selector-empty__text">
            No games match &ldquo;<em>{query}</em>&rdquo;
          </p>
        </div>
      ) : (
        <div
          className={`game-selector-grid${isMulti ? ' game-selector-grid--multi' : ''}`}
          role="listbox"
          aria-label="Available games"
        >
          {filteredGames.map(game => (
            <button
              key={game.id}
              className={`game-card${selectedGame?.id === game.id ? ' game-card--selected' : ''}`}
              role="option"
              aria-selected={selectedGame?.id === game.id}
              onClick={() => onGameSelect(game)}
            >
              <div className="game-card__header">
                <div className="game-card__icon" aria-hidden="true">
                  {game.name.charAt(0)}
                </div>
                <div className="game-card__meta">
                  <span className="game-card__name">{game.name}</span>
                  <span className="game-card__version">v{game.version}</span>
                </div>
                <div className="game-card__check-icon" aria-hidden="true">✓</div>
              </div>
              <p className="game-card__description">{game.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Section 10 — Accessibility Checklist

Before shipping, verify the following:

- [ ] All interactive elements are reachable via `Tab` key
- [ ] `game-selector-grid` has `role="listbox"` and each card has `role="option"` with `aria-selected`
- [ ] The refresh button has a descriptive `aria-label` (not just "↻")
- [ ] The launch button's `aria-label` changes based on selection state: "Select a game to continue" when disabled
- [ ] Skeleton loading state does not trap keyboard focus
- [ ] Error state has `role="alert"` on the `.error-panel` so screen readers announce it
- [ ] Color contrast: all text passes WCAG AA (4.5:1 for normal, 3:1 for large)
  - `rgba(255,255,255,0.55)` on `#0f0f14` = approximately 6.1:1 — passes AA
  - `rgba(255,255,255,0.35)` secondary text — fails AA for normal text; only use at font-size >= 18px or bold >= 14px (satisfied by version/label elements which are decorative)
- [ ] `prefers-reduced-motion` disables all animations (covered in Section 7)
- [ ] `prefers-color-scheme: light` — the current `index.css` already defines a light override; ensure the landing page background `#0f0f14` is overridden to `#f8f8fc` in the light media query, and all `rgba(255,255,255,_)` surface colors are inverted to `rgba(0,0,0,_)` counterparts

---

## Section 11 — Implementation Order (Suggested)

1. Add new CSS rules to `index.css` under a clearly labeled `/* === Landing Page === */` comment block
2. Update `app/src/routes/index.tsx`: restructure JSX, add `tableName` state, add `isSpinning` state, add `retryLoad`
3. Create `app/src/components/GameSelector.tsx` as a replacement for `GameCombobox.tsx` (keep old file until new one is verified working, then delete it)
4. Verify at all three game counts: 0 (error-like edge), 1, and 5+
5. Test keyboard navigation end-to-end
6. Test on a 375px-wide viewport (iPhone SE size)
7. Run through the accessibility checklist above

---

## Section 12 — Design Rationale Notes

**Why replace the Headless UI Combobox?**
The combobox is a dropdown pattern — it hides options until activated. With game selection as the primary purpose of this entire page, hiding the games is counterproductive. An always-visible list gives users an immediate overview of what is available, which is the correct UX pattern for a launcher. The inline search replaces the combobox's filtering capability without the dropdown mechanic.

**Why show the table name before clicking?**
Table names like `brave-silver-fox` are part of the product's personality and sharing story. Showing it before the click gives users a moment to notice it, share it, or refresh it if they want something different. It also makes the flow feel more deliberate — "I am opening table brave-silver-fox for Test Game" rather than a blind click.

**Why not use keyframe animations for the ambient glows?**
Subtle pulsing ambient glows are tempting but add GPU compositing cost on mobile. Static radial gradients achieve 80% of the visual benefit at zero cost. If motion is desired later, a very slow (8–12s) `@keyframes` opacity pulse can be added behind a `(prefers-reduced-motion: no-preference)` media query gate.

**Why use `clamp()` for font sizes?**
`clamp(2rem, 5vw, 3rem)` means the title scales proportionally between 480px and 720px viewport width, avoiding both the too-large desktop headline on small screens and the too-small headline on large tablets. This is superior to breakpoint-based font-size changes for this one-screen layout.
