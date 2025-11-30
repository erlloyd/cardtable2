# Cardtable 2.0

> A solo-first virtual card table with optional multiplayer support

Cardtable 2.0 is a web-based application designed to provide a flexible, performant platform for playing any card or board game digitally. Unlike traditional digital board game implementations, Cardtable uses a manifest-driven approach where game content is defined through JSON configuration files rather than hard-coded game rules.

## Features

- **Solo-first design**: Play games alone with full functionality
- **Optional multiplayer**: Real-time collaborative play via WebSocket synchronization
- **Universal game support**: Add new games through manifest files (no code changes required)
- **High performance**: 60 FPS rendering with support for 300-500+ objects
- **Dual rendering modes**: Worker-based (OffscreenCanvas) or main-thread rendering
- **Cross-platform**: Runs on desktop and mobile browsers
- **Offline support**: IndexedDB persistence for solo games
- **Real-time sync**: CRDT-based state synchronization using Yjs

## Tech Stack

- **Frontend**: React 19, TypeScript, PixiJS, TanStack Router, Vite
- **Backend**: Node.js 24, Express 5, y-websocket
- **State Management**: Yjs (CRDT)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Build System**: PNPM workspaces (monorepo)
- **Deployment**: GitHub Pages (app), Railway (server)

## Project Structure

```
cardtable2/
├── app/                # Frontend React application
│   ├── src/            # Source code
│   ├── e2e/            # Playwright E2E tests
│   └── public/         # Static assets and game manifests
├── server/             # Backend WebSocket server
│   ├── src/            # Express + y-websocket server
│   └── Dockerfile      # Production container
├── shared/             # Shared TypeScript types
└── _plans/             # Project planning and milestones
```

## Getting Started

### Prerequisites

- Node.js ≥24.0.0
- pnpm ≥9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/erlloyd/cardtable2.git
cd cardtable2

# Install dependencies
pnpm install
```

### Development

```bash
# Start both app (port 3000) and server (port 3001)
pnpm run dev

# Start only the app
cd app && pnpm run dev

# Start only the server
cd server && pnpm run dev
```

### Building

```bash
# Build all packages
pnpm run build

# Build a specific package
pnpm --filter @cardtable2/app build
pnpm --filter @cardtable2/server build
```

### Testing

```bash
# Run all unit tests
pnpm run test

# Run E2E tests (Playwright)
cd app && pnpm run test:e2e

# Run E2E tests with UI
cd app && pnpm run test:e2e:ui

# Run tests in watch mode
cd app && pnpm run test:watch
```

### Code Quality

```bash
# Run linter
pnpm run lint

# Run type checking
pnpm run typecheck

# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Run all checks (lint + typecheck + test + build)
pnpm run validate
```

## Development Workflow

### Branching Strategy

- **Main branch**: Protected, production-ready code
- **Feature branches**: All development work (`feature/description` or `fix/description`)
- **Pull requests**: Required for merging to main

### Git Hooks

This project uses Husky for Git hooks:

- **pre-commit**: Runs `lint-staged` to auto-format staged files
- **pre-push**: Runs type checking and format verification

### CI/CD Pipeline

- **CI checks**: Runs on all PRs (lint, typecheck, test, E2E, build)
- **PR previews**: Automatic Railway deployment for feature branches
- **Production deployment**: Automatic deployment to GitHub Pages and Railway on merge to main

## Architecture

### Frontend Architecture

- **Rendering**: PixiJS-based canvas rendering with dual-mode support (worker/main-thread)
- **State Management**: Yjs CRDT for multiplayer synchronization
- **Router**: TanStack Router for type-safe routing
- **Object System**: Registry-based pattern for extensible game object types

### Backend Architecture

- **WebSocket Server**: y-websocket for real-time CRDT synchronization
- **Persistence**: In-memory with optional Redis/LevelDB for production
- **API**: Express 5 REST endpoints for game metadata

### Data Model

All game objects follow a consistent structure:
- `_id`: Unique identifier
- `_type`: Object kind (stack, token, zone, mat, counter)
- `_x`, `_y`: Position coordinates
- Type-specific properties

## Performance

### Targets

- 60 FPS on desktop and modern mobile devices
- Sub-2ms hit-testing for interactions
- Support for 300-500 simultaneous objects
- 30Hz awareness updates for multiplayer

### Optimization Techniques

- OffscreenCanvas rendering in Web Workers
- Spatial indexing (RBush) for hit-testing
- Batched rendering and state updates
- Efficient CRDT synchronization

## Deployment

### Production Environments

- **App**: [beta.card-table.app](https://beta.card-table.app) (GitHub Pages)
- **Server**: Railway container platform
- **Registry**: GitHub Container Registry (ghcr.io)

### Preview Environments

Pull requests automatically deploy preview environments to Railway with unique URLs.

## Contributing

1. Create a feature branch from `main`
2. Make your changes following the code style guidelines
3. Ensure all tests pass (`pnpm run validate`)
4. Create a pull request

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for code formatting
- No suppression comments without approval (`@ts-ignore`, `eslint-disable`, etc.)
- Comprehensive test coverage required

## License

[License information to be added]

## Acknowledgments

Built with modern web technologies and best practices for performance, maintainability, and developer experience.
