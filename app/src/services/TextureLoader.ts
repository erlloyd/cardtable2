import { Texture } from 'pixi.js';

/**
 * TextureLoader - Simple on-demand texture loading service
 *
 * Phase 1 implementation:
 * - Load textures on demand as objects are rendered
 * - Rely on PixiJS internal texture cache
 * - Rely on browser HTTP cache for offline support
 *
 * Future enhancements (deferred):
 * - Background preloading with priority queue
 * - IndexedDB persistence for offline play
 * - Reference counting for memory management
 * - LRU eviction if needed
 */
export class TextureLoader {
  /**
   * Request a texture for immediate use
   *
   * This method:
   * 1. Fetches the image from the URL
   * 2. Creates an ImageBitmap for efficient decoding
   * 3. Creates a PixiJS Texture from the bitmap
   * 4. Returns the texture for rendering
   *
   * PixiJS automatically caches textures by URL, so repeated requests
   * for the same URL will return the cached texture.
   *
   * @param url - The URL to load the texture from
   * @returns Promise that resolves to the PixiJS Texture
   * @throws Error if the image fails to load
   */
  async requestTexture(url: string): Promise<Texture> {
    try {
      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch texture: ${response.status} ${response.statusText}`,
        );
      }

      // Get the image blob
      const blob = await response.blob();

      // Use createImageBitmap for efficient decoding (when available)
      // Falls back to regular Image loading if not available
      if (typeof createImageBitmap !== 'undefined') {
        const imageBitmap = await createImageBitmap(blob);
        // PixiJS automatically caches textures by source
        return Texture.from(imageBitmap);
      } else {
        // Fallback for environments without createImageBitmap
        const imageUrl = URL.createObjectURL(blob);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = imageUrl;
        });
        // PixiJS automatically caches textures by source
        return Texture.from(img);
      }
    } catch (error) {
      throw new Error(
        `Failed to load texture from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

/**
 * Singleton instance for global use
 */
export const textureLoader = new TextureLoader();
