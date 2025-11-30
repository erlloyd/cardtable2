# Cardtable 2.0 Planning Documents

This directory contains active planning documents for ongoing and upcoming work.

## Directory Structure

- **Active Plans** - Current and upcoming milestone plans (this directory)
- **completed/** - Completed milestone and refactor plans

## Active Milestones

### In Progress

#### M5 - Multiplayer Server
**File:** `M5_multiplayer_server.md`
**Status:** In Progress (1/3 tasks complete)
- ✅ M5-T1: WS Server Scaffold (with Railway deployment)
- ⏸️ M5-T2: Persistence Adapter (LevelDB integration)
- ⏸️ M5-T3: TTL Sweeper (30-day room cleanup)

**Next:** Implement LevelDB persistence adapter for document storage

### Planned (Upcoming)

#### M3.5 - Additional Functionality
**File:** `M3.5_additional_functionality.md`
**Status:** Planned
**Description:** Additional object manipulation actions
- Flip cards
- Rotate objects
- Stack objects
- Unstack objects

#### M4 - Set Loader & Assets
**File:** `M4_set_loader_and_assets.md`
**Status:** Planned
**Description:** Game content loading system

#### M6 - Frontend Multiplayer
**File:** `M6_frontend_multiplayer.md`
**Status:** Planned
**Description:** Connect frontend to multiplayer server

#### M7 - Offline Support
**File:** `M7_offline.md`
**Status:** Planned
**Description:** Progressive Web App features

#### M8 - Mobile & Input Polish
**File:** `M8_mobile_and_input_polish.md`
**Status:** Planned
**Description:** Touch optimization and mobile UX

#### M9 - Performance & QA
**File:** `M9_perf_and_qa.md`
**Status:** Planned
**Description:** Performance profiling and quality assurance

#### M10 - Packaging & Documentation
**File:** `M10_packaging_and_docs.md`
**Status:** Planned
**Description:** Production builds and documentation

## Architecture Documents

### Games System (Future)
**File:** `cardtable_games_system.md`
**Description:** Long-term vision for game plugin architecture
- Phase 1: Content-only games (JSON + images)
- Phase 2: Automation & rules enforcement
- Phase 3: Custom actions & UI extensions

### Original Planning
**File:** `cardtable2_mvp_plan_and_wireframes.md`
**Description:** Original MVP specification and wireframes

**File:** `cardtable2_agent_task_plans.md`
**Description:** Original task breakdown for agent-assisted development

## Milestone Completion Order

**Completed:** M0 → M0.5 → M1 → M2 (all tasks) → M3 (all tasks) → M5-T1

**Current Priority:** M5-T2 (Persistence Adapter)

**Reordered (2025-11-17):** M5 prioritized before M3.5 and M4 to enable real multiplayer testing

## See Also

- `completed/README.md` - Documentation of completed work
- `CLAUDE.md` (project root) - Current project status and context for Claude
