# Cardtable 2.0 Planning Documents

This directory contains planning documents organized by theme and status.

## Understanding the Structure

**The folder structure IS the source of truth.**

Plans are organized by **theme** (what area of the project) with **status** subfolders (where the work stands):

```
_plans/
├── core-infrastructure/     # Repo, tooling, app shell, routing
├── board-rendering/         # Canvas, camera, gestures, hit-testing
├── data-layer/              # Yjs, store, persistence, sync
├── object-interactions/     # Card manipulation (flip, exhaust, stack, etc.)
├── multiplayer/             # Server, networking, awareness
├── content-assets/          # Game loading, manifests, images
├── ux-polish/               # Mobile, touch, input refinement
├── performance/             # Optimization, profiling, scaling
├── production/              # Packaging, deployment, documentation
└── architecture/            # Cross-cutting architectural docs, reference materials
```

Each theme contains status subfolders:
- **completed/** - ✅ Work is done and merged
- **in-progress/** - 🚧 Currently being worked on
- **planned/** - 📋 Designed and ready to start
- **future/** - 💡 Ideas for later consideration
- **reference/** - 📖 Reference materials and historical context (architecture theme only)

## How to Find Work Status

**To see what's completed:** Browse `{theme}/completed/` folders
**To see what's active:** Browse `{theme}/in-progress/` folders
**To see what's next:** Browse `{theme}/planned/` folders
**To see future ideas:** Browse `{theme}/future/` folders

The location of a plan file tells you its status. If it's in `planned/`, it's planned. If it's in `in-progress/`, it's being actively worked on. If it's in `completed/`, it's done. Simple.

**Note:** `in-progress/` folders may be empty when nothing is actively being worked on. That's normal and expected.

## Plan Lifecycle

A typical plan moves through these folders:

1. **`planned/`** - Initial planning, ready to implement
2. **`in-progress/`** - Currently being worked on (move here when you start coding)
3. **`completed/`** - Implementation finished and merged

Alternative paths:
- **`future/`** - Ideas that aren't ready for implementation yet
- **`planned/` → `future/`** - Deprioritized
- **`in-progress/` → `planned/`** - Paused or blocked

**Important:** Always move plans to `in-progress/` when you start working. This keeps the project state visible and prevents duplicate work.

## Workflow

### When Starting New Work
1. Browse the relevant theme folder (e.g., `object-interactions/`)
2. Look in `planned/` for work ready to implement
3. **Move the plan file to `in-progress/`** when you start
4. Update the plan's status badge: `🚧 **In Progress**`

**Example:**
```bash
# Moving stack-operations from planned to in-progress
mv object-interactions/planned/stack-operations.md \
   object-interactions/in-progress/stack-operations.md
```

This signals to everyone (including yourself) that this work is actively being developed.

### When Planning New Features
1. Create a new markdown file in the appropriate theme folder
2. Place it in `planned/` or `future/` based on priority
3. Use clear, descriptive filenames (kebab-case)
4. Include status badge in the file: `📋 **Planned**` or `💡 **Future**`

### When Completing Work
1. **Move the plan from `in-progress/` to `completed/`**
2. Update the plan with:
   - Final implementation notes
   - PR numbers
   - Test coverage summary
   - Lessons learned
3. Update status badge: `✅ **Completed**`

**Example:**
```bash
# Moving completed stack-operations plan
mv object-interactions/in-progress/stack-operations.md \
   object-interactions/completed/stack-operations.md
```

### When Abandoning/Deferring Work
- Move from `in-progress/` back to `planned/` or `future/`
- Add notes about why it was deferred
- Don't delete plans unless truly obsolete

## File Naming Conventions

Use kebab-case for filenames:
- ✅ `grid-snap-mode.md`
- ✅ `persistence-and-ttl.md`
- ✅ `flip-and-exhaust.md`
- ❌ `Grid_Snap_Mode.md`
- ❌ `PersistenceAndTTL.md`

Be descriptive but concise:
- ✅ `stack-operations.md`
- ✅ `yjs-performance-optimization.md`
- ❌ `feature.md`
- ❌ `M3.5-T3-implement-stacking-and-unstacking-of-cards.md`

## Status Badges in Plan Files

Each plan should include a status badge at the top:

```markdown
## Status
✅ **Completed** - Description of completion (PR #123)
🚧 **In Progress** - What's currently being worked on
📋 **Planned** - Ready to implement when needed
💡 **Future** - Ideas for later consideration
📖 **Reference** - Historical or reference material
```

The badge should match the folder location. If you move a file, update the badge.

## Don't Duplicate Status Information

**This README should NOT contain status summaries.**

If you want to know what's completed, look in `{theme}/completed/`. If you want to know what's being worked on, look in `{theme}/in-progress/`. If you want to know what's planned, look in `{theme}/planned/`.

**Examples:**
- What's being worked on in multiplayer? → Check `multiplayer/in-progress/`
- What's completed in object-interactions? → Check `object-interactions/completed/`
- What's planned for board-rendering? → Check `board-rendering/planned/`

The folder structure is self-documenting. Keep it that way.

## Theme Descriptions

**core-infrastructure** - Foundation: repository setup, tooling, app shell, navigation, upgrades

**board-rendering** - Canvas rendering, PixiJS, camera/gestures, hit-testing, drag/drop, architecture

**data-layer** - Yjs integration, store, persistence, IndexedDB, performance optimization

**object-interactions** - Card/object manipulation: flip, exhaust, stack, unstack, rotate, etc.

**multiplayer** - Server, WebSocket, y-websocket, persistence, room management, frontend integration

**content-assets** - Game loading, manifests, image assets, content management

**ux-polish** - UI/UX improvements, mobile optimization, touch input, polish

**performance** - Performance profiling, optimization, load testing, scaling

**production** - Deployment, offline support, packaging, documentation, distribution

**architecture** - Cross-cutting architectural decisions, reference materials, vision docs

## See Also

- `/CLAUDE.md` - Current project status and context for Claude
- Individual theme folders for detailed plans
