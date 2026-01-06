import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { Texture, ImageSource } from 'pixi.js';
import { TextureLoader } from './TextureLoader';

// Mock PixiJS constructors - each call returns a fully auto-mocked instance
vi.mock('pixi.js', () => ({
  Texture: vi.fn(function () {
    return mock<Texture>();
  }),
  ImageSource: vi.fn(function () {
    return mock<ImageSource>();
  }),
}));

// Mock createImageBitmap (available in browsers but not in Node test environment)
global.createImageBitmap = vi.fn().mockResolvedValue({});

describe('TextureLoader', () => {
  let loader: TextureLoader;

  beforeEach(() => {
    loader = new TextureLoader();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('load() - Success Path', () => {
    it('should fetch, decode, and cache texture', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const texture = await loader.load(url);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(url);
      expect(global.createImageBitmap).toHaveBeenCalledWith(mockBlob);
      expect(Texture).toHaveBeenCalled();
      expect(texture).toBeDefined();
      expect(loader.has(url)).toBe(true);
      expect(loader.size).toBe(1);
    });

    it('should return cached texture on second call without fetching', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const texture1 = await loader.load(url);
      const texture2 = await loader.load(url);

      // Assert
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
      expect(texture1).toBe(texture2); // Same texture instance
      expect(loader.size).toBe(1);
    });

    it('should work with relative URLs', async () => {
      // Arrange
      const url = '/api/card-image/test.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const texture = await loader.load(url);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(url);
      expect(texture).toBeDefined();
    });
  });

  describe('load() - Error Handling', () => {
    it('should throw error on network failure (404)', async () => {
      // Arrange
      const url = 'http://example.com/missing.jpg';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      // Act & Assert
      await expect(loader.load(url)).rejects.toThrow('Failed to fetch');
      expect(loader.has(url)).toBe(false); // Should not cache failed loads
    });

    it('should throw error on network error', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(loader.load(url)).rejects.toThrow('Network error');
      expect(loader.has(url)).toBe(false);
    });

    it('should throw error on invalid image data', async () => {
      // Arrange
      const url = 'http://example.com/corrupt.jpg';
      const mockBlob = new Blob(['invalid data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });
      (
        global.createImageBitmap as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Failed to decode image'));

      // Act & Assert
      await expect(loader.load(url)).rejects.toThrow('Failed to decode image');
      expect(loader.has(url)).toBe(false);
    });

    it('should handle 500 server errors', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      // Act & Assert
      await expect(loader.load(url)).rejects.toThrow('Internal Server Error');
    });
  });

  describe('load() - Concurrent Request Deduplication', () => {
    it('should deduplicate simultaneous requests for same URL', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act - Start 3 concurrent loads
      const promise1 = loader.load(url);
      const promise2 = loader.load(url);
      const promise3 = loader.load(url);

      const [texture1, texture2, texture3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      // Assert
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only one fetch
      expect(texture1).toBe(texture2);
      expect(texture2).toBe(texture3);
      expect(loader.size).toBe(1);
    });

    it('should handle concurrent requests for different URLs', async () => {
      // Arrange
      const url1 = 'http://example.com/image1.jpg';
      const url2 = 'http://example.com/image2.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const [texture1, texture2] = await Promise.all([
        loader.load(url1),
        loader.load(url2),
      ]);

      // Assert
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(texture1).not.toBe(texture2);
      expect(loader.size).toBe(2);
    });

    it('should handle concurrent load where one succeeds and one fails', async () => {
      // Arrange
      const url1 = 'http://example.com/good.jpg';
      const url2 = 'http://example.com/bad.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === url1) {
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(mockBlob),
          });
        } else {
          return Promise.resolve({
            ok: false,
            statusText: 'Not Found',
          });
        }
      });

      // Act
      const results = await Promise.allSettled([
        loader.load(url1),
        loader.load(url2),
      ]);

      // Assert
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(loader.has(url1)).toBe(true);
      expect(loader.has(url2)).toBe(false);
      expect(loader.size).toBe(1);
    });
  });

  describe('Cache Management', () => {
    it('should clear all cached textures', async () => {
      // Arrange
      const url1 = 'http://example.com/image1.jpg';
      const url2 = 'http://example.com/image2.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await loader.load(url1);
      await loader.load(url2);
      expect(loader.size).toBe(2);

      // Act
      loader.clear();

      // Assert
      expect(loader.size).toBe(0);
      expect(loader.has(url1)).toBe(false);
      expect(loader.has(url2)).toBe(false);
    });

    it('should destroy textures on clear to free GPU memory', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await loader.load(url);

      // Get the mocked texture instance that was created
      const mockTextureConstructor = vi.mocked(Texture);
      const mockTextureInstance = mockTextureConstructor.mock.results[0]
        .value as ReturnType<typeof mock<Texture>>;

      // Act
      loader.clear();

      // Assert
      expect(mockTextureInstance.destroy).toHaveBeenCalledWith(true); // true = destroy base texture too
    });

    it('should work correctly after clear', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await loader.load(url);
      loader.clear();

      // Act - Load again after clear
      const texture = await loader.load(url);

      // Assert
      expect(texture).toBeDefined();
      expect(loader.size).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Fetched twice (before and after clear)
    });
  });

  describe('Synchronous Access', () => {
    it('has() should return true for cached textures', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act & Assert
      expect(loader.has(url)).toBe(false);
      await loader.load(url);
      expect(loader.has(url)).toBe(true);
    });

    it('get() should return cached texture synchronously', async () => {
      // Arrange
      const url = 'http://example.com/image.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act & Assert
      expect(loader.get(url)).toBeUndefined();
      const loadedTexture = await loader.load(url);
      const cachedTexture = loader.get(url);
      expect(cachedTexture).toBe(loadedTexture);
    });

    it('get() should return undefined for non-cached textures', () => {
      // Arrange
      const url = 'http://example.com/not-loaded.jpg';

      // Act & Assert
      expect(loader.get(url)).toBeUndefined();
    });

    it('size should reflect number of cached textures', async () => {
      // Arrange
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act & Assert
      expect(loader.size).toBe(0);
      await loader.load('http://example.com/image1.jpg');
      expect(loader.size).toBe(1);
      await loader.load('http://example.com/image2.jpg');
      expect(loader.size).toBe(2);
      loader.clear();
      expect(loader.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty URL', async () => {
      // Arrange
      global.fetch = vi.fn().mockRejectedValue(new Error('Invalid URL'));

      // Act & Assert
      await expect(loader.load('')).rejects.toThrow();
    });

    it('should handle very long URLs', async () => {
      // Arrange
      const longUrl = 'http://example.com/' + 'a'.repeat(2000) + '.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const texture = await loader.load(longUrl);

      // Assert
      expect(texture).toBeDefined();
      expect(loader.has(longUrl)).toBe(true);
    });

    it('should handle special characters in URL', async () => {
      // Arrange
      const specialUrl = 'http://example.com/image%20with%20spaces.jpg';
      const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Act
      const texture = await loader.load(specialUrl);

      // Assert
      expect(texture).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(specialUrl);
    });
  });
});
