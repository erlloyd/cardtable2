import { Texture, ImageSource } from 'pixi.js';
import {
  TEXTURE_FETCH_FAILED,
  TEXTURE_DECODE_FAILED,
  TEXTURE_CREATE_FAILED,
} from '../../constants/errorIds';

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
  private loadingStartTimes: Map<string, number> = new Map(); // Track when each URL started loading
  private failedUrls: Set<string> = new Set(); // Track which URLs failed to load

  // Threshold for considering a load "slow" (5 seconds)
  private readonly SLOW_LOAD_THRESHOLD_MS = 5000;

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
    const startTime = Date.now();
    this.loadingStartTimes.set(url, startTime);
    this.failedUrls.delete(url); // Clear any previous failure

    const promise = this.loadInternal(url);
    this.loading.set(url, promise);

    try {
      const texture = await promise;
      this.cache.set(url, texture);
      this.loadingStartTimes.delete(url); // Clean up tracking
      return texture;
    } catch (error) {
      this.failedUrls.add(url); // Mark as failed
      this.loadingStartTimes.delete(url); // Clean up tracking

      // Wrap error with additional context and preserve original error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(
        `TextureLoader failed to load ${url}: ${errorMessage}`,
      );
      // Manually attach cause for ES2020 compatibility (Error.cause added in ES2022)
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    } finally {
      this.loading.delete(url);
    }
  }

  /**
   * Internal load implementation.
   * Fetches the image, decodes it to ImageBitmap, and creates a PixiJS Texture.
   */
  private async loadInternal(url: string): Promise<Texture> {
    // Fetch the image
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      // True network errors (DNS failure, connection refused, etc)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      console.error(`[TextureLoader] Network error during fetch`, {
        errorId: TEXTURE_FETCH_FAILED,
        url,
        errorMessage,
        errorType,
      });
      throw error;
    }

    // Check HTTP response status
    if (!response.ok) {
      console.error(`[TextureLoader] HTTP error response`, {
        errorId: TEXTURE_FETCH_FAILED,
        url,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    // Decode to ImageBitmap (works in both Worker and Main thread)
    let blob: Blob;
    let imageBitmap: ImageBitmap;

    try {
      blob = await response.blob();
      imageBitmap = await createImageBitmap(blob);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      console.error(`[TextureLoader] Failed to decode image bitmap`, {
        errorId: TEXTURE_DECODE_FAILED,
        url,
        errorMessage,
        errorType,
      });
      throw error;
    }

    // Create PixiJS Texture from ImageBitmap
    try {
      const imageSource = new ImageSource({ resource: imageBitmap });
      const texture = new Texture({ source: imageSource });
      return texture;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      console.error(`[TextureLoader] Failed to create PixiJS texture`, {
        errorId: TEXTURE_CREATE_FAILED,
        url,
        errorMessage,
        errorType,
      });
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
    this.loadingStartTimes.clear();
    this.failedUrls.clear();
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

  /**
   * Check if a URL is currently loading and has been loading for a long time.
   * Returns true if the URL has been loading for more than SLOW_LOAD_THRESHOLD_MS.
   */
  isSlowLoading(url: string): boolean {
    const startTime = this.loadingStartTimes.get(url);
    if (!startTime) return false;

    const elapsed = Date.now() - startTime;
    return elapsed > this.SLOW_LOAD_THRESHOLD_MS;
  }

  /**
   * Check if a URL has failed to load.
   */
  hasFailed(url: string): boolean {
    return this.failedUrls.has(url);
  }

  /**
   * Check if we should show fallback content for a URL.
   * Returns true if the URL has failed OR is taking too long to load.
   */
  shouldShowFallback(url: string): boolean {
    return this.hasFailed(url) || this.isSlowLoading(url);
  }
}
