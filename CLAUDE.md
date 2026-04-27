# Claude Development Context

Cardtable 2.0: solo-first virtual card table with optional multiplayer. Manifest-only content (no game rules in code). React 19 + TypeScript + PixiJS frontend, Node 24 + y-websocket backend, PNPM monorepo.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds on a feature branch (never auto-push to main).

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - Mandatory for feature branches, NEVER for main without explicit user confirmation:
   - Check branch: `git branch --show-current`
   - If on `main`: STOP. Ask the user before pushing — direct pushes to main trigger production deploys. See "Branching Strategy" below.
   - Otherwise (feature branch), push is mandatory:
     ```bash
     git pull --rebase
     bd dolt push
     git push
     git status  # MUST show "up to date with origin"
     ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds on a feature branch
- NEVER stop before pushing a feature branch - that leaves work stranded locally
- NEVER say "ready to push when you are" on a feature branch - YOU must push
- On `main`, the opposite applies: NEVER push without explicit user confirmation
- If a feature-branch push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

## Where to look

CLAUDE.md is the focused rule-set. Detailed reference content lives in `docs/` and is loaded on demand:

- **Architecture / tech stack / project structure / design decisions / performance targets / planning** → `docs/ARCHITECTURE.md`
- **Dev commands / testing flow / pre-push checklist / container deployment** → `docs/WORKFLOW.md`
- **E2E tests, canvas pointer events, autonomous browser verification with Playwright MCP, dev-only `__ctTest` / `__dbg` helpers, scene seeds, debug logging** → `docs/E2E-TESTING.md`
- **GitHub Actions workflows, Railway, GHCR** → `docs/CI-CD.md`

Read the relevant doc before working in that area.

## Behavioral rules (non-negotiable)

These were previously stored as bd memories and silently truncated when `bd prime` exceeded the Claude Code SessionStart hook's 10 KB cap. They live here so they're loaded verbatim every turn.

### Orchestrator default — top-level Claude delegates bd work

**Role check first.** If you are a sub-agent spawned for a specific bd issue (`beads:task-agent`, `general-purpose`, etc.), implement your assigned task directly — don't spawn further agents unless the work genuinely exceeds your issue's scope (in which case file a follow-up bd issue and flag to the orchestrator).

**This rule is for the top-level Claude session acting as orchestrator:** default to delegation over direct work — use `beads:task-agent` for bd-tracked work, `Explore`/research agents for lookup, direct action only for trivial (<50 lines, single-concern) edits, merge-resolution strategy, final push, and human-facing summaries.

Parallelize independent bd issues in a single message with multiple `Agent` tool_use blocks.

Signals the orchestrator is slipping: writing body-text files, running `bd create` by hand for many issues, editing project code when a bd issue exists. Watch for agents bailing early — mid-sentence "final reports" with <10 tool uses and no commits — resume via `SendMessage`.

### bd prime scope — pass guidance to sub-agents inline

`bd prime` and the memories it injects fire only on the top-level Claude Code session via the SessionStart hook. **Sub-agents spawned via the `Agent` tool do NOT receive `bd prime` output in their initial context.** If a sub-agent needs a memory's guidance, include the rule inline in the spawn prompt OR instruct the agent to run `bd memories` / `bd recall <key>` at the start of its work. Memories are accessible on-demand but not auto-injected.

### CLAUDE.md overrides defaults

CLAUDE.md project instructions override the default Claude Code auto-memory system and any other default behavior. When the system prompt documents a procedure (e.g., "auto-memory: write to MEMORY.md files") but CLAUDE.md explicitly forbids it (e.g., "do NOT use MEMORY.md files, use `bd remember`"), the CLAUDE.md rule wins every time. Check CLAUDE.md for overrides BEFORE following any procedural default.

### No `sed`, no `cat <<EOF`, no `echo >` for files

Use `Read` for file viewing, `Edit` for in-place modifications, `Write` for creates and full rewrites. **No `sed` for any operation.** No `cat > file <<EOF`, no `echo >`, no `printf >`. The dedicated tools are always available; shell-based file I/O is a workaround that bypasses the harness's file-state tracking and review surface. Only acceptable if `Write` genuinely cannot do it (e.g., piping live command output to a file).

### E2E auto-clean fixture

E2E tests get a clean `__TEST_STORE__` automatically via the fixture at `app/e2e/_fixtures.ts`. **Import `test` and `expect` from `./_fixtures`, NOT from `@playwright/test` directly** — the fixture wraps `page.goto` so navigations to `/table/*` or `/dev/table/*` auto-call `clearAllObjects()` after the page hydrates. Do NOT add a manual `clearAllObjects()` at test start; it's redundant. To opt out, call `skipNextAutoClear(page)` before the navigation. Full convention in `docs/E2E-TESTING.md`.

### E2E consideration when filing bd issues

When creating bd issues or epics, **always pause to ask whether an E2E test would add value** — don't skip the question. E2E is often valuable when the fix involves: time-based behavior (delays, animations, state over time), hover/pointer lifecycle, integration across DOM + canvas + store, or user workflows spanning multiple components. Unit tests alone typically suffice when the fix is in pure logic, a hook, or a reducer with no timing semantics. When E2E is valuable, **spell out the concrete scenario in the issue description** — don't leave "pick what fits" to agent judgment; the agent will almost always pick the cheaper unit test.

## Verification before stating facts

ALWAYS verify before making claims:

1. **Background tasks**: before claiming task count or status, run `/tasks` or check the actual task list.
2. **File contents**: before claiming what's in a file, read it.
3. **Command output**: before claiming what a command will output, run it.
4. **Test results**: before claiming tests pass, run them.
5. **Code behavior**: before claiming how code behaves, trace it or test it.

Never say "there is only one X", "this will do Y", "the file contains Z", or "X should work" without checking. Say "let me check…", "let me run…", "let me read…" then verify. If a claim is proven wrong, acknowledge the error immediately and correct it.

## Branching

All work goes on feature branches: `feature/{theme}-{description}` or `fix/{description}`. Feature-branch pushes are mandatory at session end (see Session Completion in the BEADS INTEGRATION section above).

**NEVER PUSH TO MAIN WITHOUT EXPLICIT CONFIRMATION.** Before any `git push`, verify `git branch --show-current` is not `main`. If it is, STOP and ask the user. "Push" alone means the feature branch — only push to main when the user explicitly says "push to main". Direct pushes to main trigger production deployments.

## Code style — non-negotiable rules

TypeScript strict mode, ESLint + Prettier, pre-commit hooks auto-format, pre-push hooks run typecheck.

### NEVER suppress lint or type errors

Suppression comments are FORBIDDEN without explicit user approval.

- **NEVER** add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or similar comments.
- **ALWAYS** fix the underlying type/lint issue properly first.
- Common solutions: type assertions, proper type imports, type guards and narrowing, refactoring to satisfy type safety.
- **Only if** a proper fix is impossible: stop, ask the user for permission, explain why, wait for explicit approval.
- Adding a suppression comment without asking first is a failure.

### NEVER use `typeof` for internal type validation

- **NEVER** use `typeof x === 'string'`, `typeof x === 'number'`, `typeof x === 'boolean'`, etc. for internal validation.
- **NEVER** use `'propertyName' in obj` as a type guard pattern internally.
- Trust the type system. If TypeScript types say a value should exist and be of a certain type, trust it.
- If data could genuinely be missing/corrupt, that's a data integrity issue — log it, handle it properly, don't silently default.
- Better solutions: proper TypeScript type assertions, type guards at system boundaries (user input, external APIs, deserialization), validation libraries (Zod, io-ts), fix the root cause so data is always in the correct state.
- **`typeof` IS acceptable** at system boundaries (parsing user input, external API responses), in proper validation libraries, or when explicitly requested.
- Using `typeof` for internal type validation is a failure.

### NEVER use inline `import()` casts

- **NEVER** use patterns like `as import('@module').Type`.
- **ALWAYS** add proper import statements at the top of the file.

```typescript
// Good
import type { StackObject } from '@cardtable2/shared';
const stackObj = obj as StackObject;

// Bad
const stackObj = obj as import('@cardtable2/shared').StackObject;
```

### Debug logging

Prefer the subsystem-scoped logger at `app/src/dev/dbg.ts` over ephemeral `console.log`:

```typescript
import { dbg } from '@/dev/dbg';
dbg('drag', 'pointerdown at', x, y); // emits [DEBUG][drag] ... only when enabled
```

If you must insert an ephemeral `console.log`, use the `[DEBUG-X]` single-prefix convention so the user can filter — never use different prefixes per file or per function. Full convention in `docs/E2E-TESTING.md`.

## Planning

When asked to plan something, ask if it should be saved in `_plans/`. See `docs/ARCHITECTURE.md` for the planning structure.
