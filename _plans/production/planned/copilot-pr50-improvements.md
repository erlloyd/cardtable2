# Copilot PR #50 Review - Improvements Plan

## Overview
Address security, performance, and testing issues identified by Copilot review of PR #50.

## Priority 1: Security Issues (Block Merge)

### 1. Path Traversal Vulnerability (server/src/index.ts:63)
**Issue:** Image proxy doesn't validate paths, allowing potential access to other Azure containers via path traversal (`../`).

**Fix:**
- Add path validation regex: `/^[a-zA-Z0-9\-\/._]+$/`
- Block paths containing `..`
- Return 400 Bad Request for invalid paths
- Log invalid attempts

**File:** `server/src/index.ts`

### 2. Information Leakage via Status Codes (server/src/index.ts:75)
**Issue:** Returning Azure's exact status code (403, 404, 500) could leak information about blob storage structure.

**Fix:**
- Return consistent 404 status for all failed image requests
- Keep detailed logging for monitoring
- Don't expose Azure-specific errors to client

**File:** `server/src/index.ts`

## Priority 2: Critical Functional Bug (Block Merge)

### 3. Content URLs Won't Work Due to CORS (app/public/packs/testgame-core.json:6)
**Issue:** Resolved card URLs point directly to Azure, which will fail with CORS errors. The backend proxy won't be used.

**Fix:** Update baseUrl in asset packs to point to backend proxy.

**Implementation:**
1. Change baseUrl in `testgame-core.json` from Azure direct URL to proxy URL format
2. Use placeholder for backend URL that gets resolved at runtime OR use relative path
3. Update any documentation about baseUrl format

**Files:**
- `app/public/packs/testgame-core.json`

## Priority 3: Code Quality Issues

### 4. Remove Dead Code (app/vite.config.ts:28)
**Issue:** Unused Vite azure-proxy configuration.

**Fix:** Remove the proxy configuration block.

**File:** `app/vite.config.ts`

### 5. Fix Misleading Comment (server/src/index.ts:62)
**Issue:** Comment incorrectly describes req.params.splat behavior.

**Fix:** Update comment to accurately describe req.path usage.

**File:** `server/src/index.ts`

### 6. Simplify Route Pattern (server/src/index.ts:61)
**Issue:** Non-standard wildcard syntax `*splat` - Express v5 doesn't need named wildcards.

**Fix:** Change to standard `*` wildcard (since we're using req.path anyway).

**File:** `server/src/index.ts`

## Priority 4: Testing (This PR)

### 7. Add Content Loader Tests (app/src/content/loader.ts:255)
**Coverage needed:**
- Pack loading and merging
- URL resolution
- Card type inheritance
- Error handling for invalid/missing data

**Files:**
- `app/src/content/loader.test.ts` (new)

### 8. Add Instantiation Tests (app/src/content/instantiate.ts:323)
**Coverage needed:**
- Deck expansion with cardSets and individual cards
- Shuffling behavior
- Namespacing of card codes
- Layout object instantiation for all types
- Sort key generation
- Error handling for missing references

**Files:**
- `app/src/content/instantiate.test.ts` (new)

## Implementation Order

1. **Security fixes** (Priority 1) - Do first, together
2. **CORS baseUrl fix** (Priority 2) - Critical for functionality
3. **Code cleanup** (Priority 3) - Quick wins while testing
4. **Tests** (Priority 4) - Comprehensive coverage for content system

## Estimated Effort

- Priority 1: ~1 hour (security fixes)
- Priority 2: ~15 minutes (update baseUrl)
- Priority 3: ~30 minutes (cleanup)
- Priority 4: ~4-6 hours (comprehensive tests)

**Total:** ~6-8 hours

## Notes

- Priorities 1-2 should block merge (security + critical bug)
- Priority 3 can be done while testing priorities 1-2
- Priority 4 (tests) to be completed in this PR for comprehensive coverage
- Performance optimization (gamesIndex caching) deferred to future PR
