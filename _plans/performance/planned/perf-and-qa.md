# Milestone 9 — Performance & QA

## Overview
Performance optimization, testing, and quality assurance to meet MVP performance targets.

## Prerequisites
- Milestone 8 completed (mobile and input polish)

## Performance Targets
- **60 fps** on mobile/desktop for common interactions
- **Worst-case dips** ≥45 fps for ≤300ms during heavy animations
- **Pointer-to-visual latency** ≤30ms
- **Hit-test** ≤2ms/event on mid-range mobile
- **Board sizes**:
  - Standard: 300 items
  - Big-board: 500 items upper limit

## Tasks

### M9-T1: Perf Scene Generator
**Objective:** Create development tools to generate performance test scenes.

**Dependencies:** M8 complete

**Spec:**
- Dev command to spawn test scenes
- Parameters:
  - N: number of objects (300/500)
  - Seed: for deterministic generation
  - Type distribution (cards/tokens/stacks)
- Realistic object placement
- Mix of face-up/face-down cards
- Various stack sizes
- Performance metrics display

**Deliverables:**
- Scene generator utility
- Dev mode UI for spawning scenes
- Seed-based deterministic generation
- Performance HUD component
- FPS counter
- Memory usage display

**Test Plan:**
- Unit: deterministic output with same seed
- Unit: correct object counts and types
- Manual: verify 60fps with 300 objects
- Manual: acceptable performance with 500 objects
- Profile memory usage patterns

### M9-T2: Hit-Test Microbench
**Objective:** Implement performance monitoring for hit-testing operations.

**Dependencies:** M9-T1

**Spec:**
- Dev HUD showing:
  - Average hit-test time (ms)
  - 95th percentile time
  - Events per second
  - Spatial index efficiency
- Rolling window statistics (last 100 events)
- Performance targets:
  - ≤2ms average on mid-range mobile
  - ≤5ms 95th percentile
- Identify performance bottlenecks

**Deliverables:**
- Performance monitoring system
- Hit-test instrumentation
- Statistics calculation
- Dev HUD overlay
- Performance logging
- Bottleneck analysis tools

**Test Plan:**
- Manual testing on devices:
  - iPhone 12 (mid-range)
  - Pixel 4a (mid-range)
  - iPad 9th gen
- Verify ≤2ms avg at 300 items
- Test with rapid pointer movement
- Test with dense object clusters
- Profile and optimize hot paths