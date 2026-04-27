# CI/CD & Deployment

GitHub Actions workflows and production hosting reference. Loaded on-demand — see CLAUDE.md for branching rules and `docs/WORKFLOW.md` for local pre-push checks.

## Selective Deployment

- Only deploys changed packages on main.
- Uses PNPM filtering to detect which packages have changed.
- Changes to `shared/` trigger both app and server deployments.

## GitHub Actions Workflows

### `ci.yml` — Continuous Integration (all PRs)

- Linting (ESLint)
- Type checking (TypeScript)
- Format checking (Prettier)
- Unit tests (Vitest)
- E2E tests (Playwright)
- Build verification

### `deploy.yml` — Production deployment (main branch only)

- **App**: deploys to GitHub Pages at `beta.card-table.app`
- **Server**: builds Docker image and deploys to Railway at `cardtable2-server-production.up.railway.app`
- **Image registry**: pushes to GitHub Container Registry (GHCR)
- **Selective deployment**: only builds/deploys changed components

### `pr-deploy.yml` — PR preview environments

- Creates Railway preview services per PR
- Builds Docker images for both app and server
- Provides unique URLs for testing (e.g., `cardtable2-pr-123.up.railway.app`)
- Only builds on first PR build or when package changes

### `cleanup-pr.yml` — Resource cleanup

- Automatically removes Railway services when PR is closed
- Keeps infrastructure costs manageable

## Production Hosting

Railway (https://railway.app/) is the current production platform:

- WebSocket support for y-websocket backend
- Automatic PR preview deployments for both app and server
- Single platform for full-stack deployment
- Container-based deployment using Docker
- Cost-effective usage-based pricing
- Environment variables managed via Railway CLI and GitHub Actions
