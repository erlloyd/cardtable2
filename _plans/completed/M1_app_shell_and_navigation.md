# Milestone 1 — App Shell & Navigation

## Overview
Set up the base application structure with routing and lazy loading for the board module.

## Prerequisites
- Milestone 0 completed (monorepo and tooling setup)

## Tasks

### M1-T1: Routes & Lazy Board
**Objective:** Implement `/` Game Select and `/table/:id` Table routes with lazy-loaded `Board` component.

**Dependencies:** M0 complete

**Spec:**
- `/` renders Game Select screen
- `/table/:id` renders Table screen
- `/table/adjective-adjective-animal` generated on "Open Table" (e.g., `/table/happy-clever-elephant`)
- Board module loaded via `import()` only when navigating to table
- Table IDs generated using `unique-names-generator` library

**Deliverables:**
- React Router setup
- Game Select component
- Table component shell
- Board component placeholder with lazy loading

**Test Plan:**
- Playwright: navigate between routes and verify Board placeholder renders
- Verify Board module only loads when navigating to `/table/:id`
- Check that table IDs follow `adjective-adjective-animal` format

### M1-T2: Game Index & Combobox
**Objective:** Create `gamesIndex.json` with Fake Game entry and implement game selection combobox.

**Dependencies:** M1-T1

**Spec:**
- `gamesIndex.json` contains available games
- Include "Fake Game" as default entry
- Combobox for game selection with proper styling
- Selection state management

**Deliverables:**
- `public/gamesIndex.json` file
- Game selection combobox component
- Game selection state management

**Test Plan:**
- Unit: options parse and render correctly
- Unit: selection state updates properly
- E2E: game can be selected and persists across navigation