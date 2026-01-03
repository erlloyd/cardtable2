# Azure Blob Storage Image Proxy

## Overview
Implemented backend proxy for Azure Blob Storage card images to work around CORS restrictions in PixiJS v8 (WebGL).

## Problem Statement
PixiJS v8 uses WebGL exclusively, which refuses to upload tainted images (cross-origin without CORS headers) to the GPU. Azure Blob Storage doesn't provide CORS headers, making direct image loading impossible.

CardTable v1 (KonvaJS + Canvas 2D) could display tainted images, but CardTable v2 (PixiJS + WebGL) cannot.

## Implementation

### Backend Proxy Endpoint
- Route: `/api/card-image/*`
- Fetches images from Azure Blob Storage
- Serves from same origin (bypasses CORS)
- Returns proper CORS headers for allowed origins

### Caching Strategy
**Client-side:**
- 1-year cache with `immutable` directive
- Browser never re-requests after first load
- Zero bandwidth for repeat visits

**Server-side (ETags):**
- MD5 hash of image content
- 304 Not Modified responses (~200 bytes vs 300KB)
- Efficient revalidation

### CORS Configuration
Three-tier origin checking:
- **Development**: localhost only (`http://localhost:3000`, etc.)
- **Production**: Production domains only (`https://beta.card-table.app`, `https://card-table.app`)
- **PR Previews**: Dynamic regex for Railway PR URLs (`/^https:\/\/cardtable2-app-pr-\d+-prs\.up\.railway\.app$/`)

### Environment Configuration
- `NODE_ENV` properly set for all Railway deployments
- `VITE_WS_URL` for WebSocket connections
- `VITE_BE_URL` for HTTP backend requests
- Dynamic URL construction in development via `getWSUrl()` and `getBackendUrl()` utilities

### Deployment Improvements
- Set `NODE_ENV=production` for Railway services (both PR and production)
- Manual workflow trigger for PR cleanup (handles PRs closed via API)
- Consistent environment variable management

## Files Changed
- `server/src/index.ts` - Proxy endpoint, CORS configuration
- `app/src/utils/backend.ts` - Backend URL utilities
- `app/src/routes/pixitest.tsx` - Test route for image loading
- `app/src/hooks/useTableStore.ts` - Use centralized WebSocket URL
- `.github/scripts/deploy-railway.sh` - Set NODE_ENV for deployments
- `.github/workflows/cleanup-pr.yml` - Manual trigger for cleanup
- `.github/workflows/deploy.yml` - VITE_BE_URL configuration
- `.github/workflows/pr-deploy.yml` - VITE_BE_URL configuration

## Testing
- ✅ Local development: Images load via proxy
- ✅ PR preview: Images load with correct CORS
- ✅ Caching: ETag and immutable headers work
- ✅ NODE_ENV: Properly set in deployed environments

## Performance Impact
- First image load: ~300KB download (unavoidable)
- Subsequent loads: 0 bytes (browser cache)
- Cache revalidation: ~200 bytes (304 response)
- Minimizes Railway bandwidth costs

## Future Considerations
- Consider CDN for image caching to reduce Railway egress
- Potential environment type distinction (`pr-preview` vs `production` vs `development`) for granular logging/CORS
- Monitor Railway bandwidth usage in production

## Completion Date
2026-01-03

## Related PRs
- #50 - Backend image proxy for Azure Blob Storage
