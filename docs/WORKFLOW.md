# Workflow

Development workflow reference for Cardtable 2.0. Loaded on-demand — see CLAUDE.md for the focused rule-set (branching, session completion, code-style rules).

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development servers (app on :3000, server on :3001)
pnpm run dev

# Build for production
pnpm run build

# Run tests (unit tests)
pnpm run test

# Run E2E tests (Playwright)
cd app && pnpm run test:e2e

# Run E2E tests with UI
cd app && pnpm run test:e2e:ui

# Run linting
pnpm run lint

# Run type checking
pnpm run typecheck

# Run full validation (lint, typecheck, test, build)
pnpm run validate

# Format code
pnpm run format
```

## Testing Workflow

**Always test before committing.** Pre-commit hooks run linting/formatting checks that often fail if tests weren't run first; type errors and lint issues surface earlier when tests run first.

```bash
# Run unit tests for specific modules
pnpm --filter @cardtable2/app test <pattern>   # e.g., "migrations", "ObjectDefaults"

# Run all unit tests
pnpm run test

# Run E2E tests (takes longer, run after unit tests pass)
cd app && pnpm run test:e2e
```

**Recommended flow:**

1. Write/modify code
2. Run relevant unit tests: `pnpm --filter @cardtable2/app test <module>`
3. Fix any test failures
4. Run linting: `pnpm run lint`
5. Run type check: `pnpm run typecheck`
6. If all pass, attempt commit
7. Run E2E tests before pushing: `cd app && pnpm run test:e2e`

Unit tests use Vitest. E2E tests use Playwright. All tests must pass before merge to main.

## Pre-Push Checklist

The following checks MUST pass before pushing (enforced by Git hooks and CI):

**Git hooks:**

- **pre-commit**: `npx lint-staged` (auto-formats staged files)
- **pre-push**:
  - `pnpm run typecheck` (TypeScript type checking)
  - `pnpm run format:check` (Prettier formatting verification)

**CI checks (on PRs):**

1. Lint: `pnpm run lint` (ESLint)
2. Type check: `pnpm run typecheck` (TypeScript)
3. Format check: `pnpm run format:check` (Prettier)
4. Unit tests: `pnpm run test` (Vitest)
5. E2E tests: `cd app && pnpm run test:e2e` (Playwright)
6. Build: `pnpm --filter @cardtable2/app build` + `pnpm --filter @cardtable2/server build`

**Quick validation before pushing:**

```bash
pnpm run validate  # lint + typecheck + test + build
```

**Fix common issues:**

```bash
pnpm run format      # Auto-fix formatting issues
pnpm run lint        # Check for lint errors
pnpm run typecheck   # Check for type errors
```

## Container Deployment

- **Docker support**: Multi-stage Dockerfiles for production builds
- **Base image**: Node.js 24-slim for minimal footprint
- **Process manager**: Tini for proper signal handling and zombie reaping
- **Registry**: Images pushed to GitHub Container Registry (ghcr.io)
- **Production runtime**: Railway container platform

## Planning & Documentation

When asked to plan something, always ask if it should be saved in the `_plans/` folder.

Plans are organized by theme with status subfolders:

- Place new plans in the appropriate theme folder (`object-interactions/`, `multiplayer/`, etc.)
- Use status subfolders: `planned/` for ready work, `in-progress/` for active work, `completed/` for finished work
- See `_plans/README.md` for the complete structure and guidelines
