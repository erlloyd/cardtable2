# Card Image Loading - Completed

## Summary
Implemented card image loading system that displays actual card images on stack objects using backend proxy for Azure Blob Storage.

## Completed Work

### 1. TextureLoader Service (`app/src/renderer/services/TextureLoader.ts`)
- Created async texture loading service using fetch + createImageBitmap + PixiJS Texture
- Implements caching to avoid redundant network requests
- Synchronous `get()` method for render functions
- Fire-and-forget `load()` for background loading
- Works in both Worker and Main-thread contexts

### 2. Stack Rendering with Images (`app/src/renderer/objects/stack/behaviors.ts`)
- `getCardImageUrl()` helper to determine face/back URL
- Checks for cached textures synchronously during render
- Shows sprite if texture cached, otherwise placeholder
- Starts async texture load for next render cycle

### 3. RenderContext Enhancement
- Added `gameAssets` field to RenderContext (GameAssets | null | undefined)
- Added `textureLoader` field to RenderContext (TextureLoader | undefined)
- Updated all context creation sites to pass these fields

### 4. Backend Proxy (`server/src/index.ts`)
- Fixed Express 5 wildcard route syntax: `/*path` (path-to-regexp v8 requirement)
- Wildcard parameters return array of segments - join with `/`
- Aggressive caching with ETags (1 year immutable cache)
- Generic proxy for any Azure Blob Storage URL

### 5. URL Resolution (`app/src/content/loader.ts`)
- Enhanced `mergeAssetPacks()` to resolve card URLs after merging
- Applies pack `baseUrl` to relative card face/back URLs
- Prepends backend URL for `/api/` paths
- Example: `"01023.jpg"` + baseUrl `/api/card-image/cerebro-cards/official/` → `http://localhost:3001/api/card-image/cerebro-cards/official/01023.jpg`

### 6. Message Flow
- Board.tsx sends gameAssets via `set-game-assets` message
- RendererOrchestrator stores in state and forwards to VisualManager
- VisualManager includes in RenderContext for all behaviors

## Known Issues / Future Work

### Priority 1: Automatic Rerender on Texture Load
**Status**: Not implemented yet

Currently, when a texture finishes loading asynchronously, the stack continues to show the placeholder until the next user interaction (hover, drag, etc.) triggers a rerender.

**Problem**: Fire-and-forget texture load in `behaviors.ts:228` doesn't trigger visual update:
```typescript
if (imageUrl && ctx.textureLoader) {
  ctx.textureLoader.load(imageUrl).catch((error) => {
    console.error(`[StackBehaviors] Failed to preload texture:`, error);
  });
}
```

**Potential Solutions**:
1. Add callback to TextureLoader.load() that requests rerender
2. Periodic polling in RendererOrchestrator to check for new textures
3. Event emitter on TextureLoader that VisualManager subscribes to
4. Message from TextureLoader to RendererOrchestrator → VisualManager redraw

**Recommendation**: Option 4 (message-based) fits the architecture best. TextureLoader should sendMessage when texture loads, RendererOrchestrator forwards to VisualManager.redrawVisual().

### Priority 2: Loading Indicators
Consider showing a subtle loading spinner or animation on stacks waiting for textures to load.

### Priority 3: Error Handling
Handle failed texture loads more gracefully (show fallback icon or keep placeholder permanently).

## Testing Status
- ✅ Card backs load and display correctly
- ✅ Card faces load and display correctly via proxy
- ✅ Works in both Worker and Main-thread renderer modes
- ✅ Caching prevents redundant network requests
- ⚠️ Manual rerender (hover/drag) required to see images after async load

## Files Modified
- `app/src/renderer/services/TextureLoader.ts` - New file
- `app/src/renderer/objects/stack/behaviors.ts` - Image loading logic
- `app/src/renderer/objects/types.ts` - RenderContext fields
- `app/src/renderer/RendererOrchestrator.ts` - TextureLoader instance, gameAssets handling
- `app/src/renderer/managers/VisualManager.ts` - Pass textureLoader/gameAssets
- `app/src/renderer/handlers/objects.ts` - Include in RenderContext
- `app/src/renderer/managers/GridSnapManager.ts` - RenderContext type update
- `app/src/renderer/managers/AwarenessManager.ts` - RenderContext type update
- `app/src/content/loader.ts` - URL resolution in mergeAssetPacks
- `app/src/routes/table.$id.tsx` - Load and pass gameAssets
- `app/src/components/Board.tsx` - Send gameAssets to renderer
- `server/src/index.ts` - Fix Express 5 wildcard route syntax

## Commits
- feat: implement card image loading with TextureLoader and backend proxy
