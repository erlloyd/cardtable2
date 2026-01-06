import { Texture, ImageSource } from 'pixi.js';

/**
 * TextureLoader - Service for loading textures from URLs
 *
 * Handles:
 * - Asynchronous texture loading via fetch + createImageBitmap
 * - Texture caching to avoid redundant network requests
 * - Error handling for failed loads
 * - Support for both Worker and Main-thread contexts
 *
 * Usage:
 * ```typescript
 * const loader = new TextureLoader();
 * const texture = await loader.load('/api/card-image/path/to/card.jpg');
 * const sprite = new Sprite(texture);
 * ```
 */
export class TextureLoader {
  private cache: Map<string, Texture> = new Map();
  private loading: Map<string, Promise<Texture>> = new Map();

  /**
   * Load a texture from a URL.
   *
   * Returns cached texture if already loaded, otherwise fetches and caches.
   * If multiple requests for the same URL arrive while loading, they all
   * receive the same promise to avoid duplicate network requests.
   *
   * @param url - Absolute or relative URL to the image
   * @returns Promise that resolves to a PixiJS Texture
   * @throws Error if fetch fails or image cannot be decoded
   */
  async load(url: string): Promise<Texture> {
    // Return cached texture if available
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    // Return in-flight request if loading
    const loading = this.loading.get(url);
    if (loading) {
      return loading;
    }

    // Start new load
    const promise = this.loadInternal(url);
    this.loading.set(url, promise);

    try {
      const texture = await promise;
      this.cache.set(url, texture);
      return texture;
    } finally {
      this.loading.delete(url);
    }
  }

  /**
   * Internal load implementation.
   * Fetches the image, decodes it to ImageBitmap, and creates a PixiJS Texture.
   */
  private async loadInternal(url: string): Promise<Texture> {
    try {
      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      // Decode to ImageBitmap (works in both Worker and Main thread)
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Create PixiJS Texture from ImageBitmap
      const imageSource = new ImageSource({ resource: imageBitmap });
      const texture = new Texture({ source: imageSource });

      return texture;
    } catch (error) {
      console.error(
        `[TextureLoader] Failed to load texture from ${url}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Clear all cached textures and destroy them to free GPU memory.
   */
  clear(): void {
    for (const texture of this.cache.values()) {
      texture.destroy(true); // Destroy texture and its base texture
    }
    this.cache.clear();
    this.loading.clear();
  }

  /**
   * Check if a texture is cached.
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Get a cached texture synchronously.
   * Returns undefined if texture is not cached.
   * Use this in synchronous rendering contexts where you need immediate access.
   */
  get(url: string): Texture | undefined {
    return this.cache.get(url);
  }

  /**
   * Get cache size (number of cached textures).
   */
  get size(): number {
    return this.cache.size;
  }
}
