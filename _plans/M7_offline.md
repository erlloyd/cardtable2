# Milestone 7 — Offline

## Overview
Implement Progressive Web App (PWA) features with service worker for offline functionality.

## Prerequisites
- Milestone 6 completed (frontend multiplayer)

## Offline Strategy
- **Precache**: App shell + board module for instant offline cold-start
- **Runtime cache**: Sets and assets cached on first use
- **Cache-first**: Serve from cache when available
- **Offline fallback**: Show toast when content not cached

## Tasks

### M7-T1: SW Precache (Shell + Board)
**Objective:** Implement service worker with precaching for core application files.

**Dependencies:** M6 complete

**Spec:**
- Precache manifest:
  - HTML entry point
  - Main JS bundle
  - Board chunk
  - Critical CSS
- Service worker registration
- Update strategy: skip waiting + clients claim
- Version management
- Cache invalidation on new deployment

**Deliverables:**
- Service worker implementation
- Workbox configuration
- Precache manifest generation
- Registration logic in app
- Update prompt UI

**Test Plan (E2E):**
- First visit: SW installs
- Offline reload: app loads from cache
- Deploy new version: update prompt appears
- Verify all critical resources cached
- Test on multiple browsers

### M7-T2: Runtime Cache (Sets & Images)
**Objective:** Implement runtime caching for game content with offline support.

**Dependencies:** M7-T1

**Spec:**
- Cache strategies:
  - `/sets/**`: cache-first, 30-day expiry
  - `/assets/**`: cache-first, 7-day expiry
  - External images: cache-first with CORS
- Size limits:
  - Total: 500MB
  - Per response: 50MB
- Offline behavior:
  - Serve from cache if available
  - Show "Content not cached" toast if missing
  - Queue failed requests for retry

**Deliverables:**
- Runtime caching strategies
- Cache size management
- Offline detection
- User notification system
- Request retry queue

**Test Plan (E2E):**
- Load set online → works offline
- New set offline → shows message
- Cache size limits enforced
- Old entries evicted properly
- CORS images cached correctly