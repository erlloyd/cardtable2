/**
 * Azure Blob Storage Proxy Handler
 *
 * Proxies card image requests to Azure Blob Storage with aggressive caching.
 * Solves CORS issues and provides ETag-based cache validation.
 */

import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';

export interface ProxyHandlerOptions {
  /**
   * Whether to generate and check ETags for 304 Not Modified responses
   * @default true
   */
  enableETag?: boolean;

  /**
   * Whether to log proxy requests and responses
   * @default true
   */
  enableLogging?: boolean;
}

/**
 * Create an Express route handler for proxying card images from Azure Blob Storage
 *
 * @param options - Configuration options
 * @returns Express route handler for /api/card-image/*path
 *
 * @example
 * ```typescript
 * import { createProxyHandler } from './proxyHandler';
 *
 * app.get<{ path: string | string[] }>(
 *   '/api/card-image/*path',
 *   createProxyHandler({ enableETag: true, enableLogging: true })
 * );
 * ```
 */
export function createProxyHandler(options: ProxyHandlerOptions = {}) {
  const { enableETag = true, enableLogging = true } = options;

  return async (
    req: Request<{ path: string | string[] }>,
    res: Response,
  ): Promise<void> => {
    // Get the full requested image path from wildcard parameter
    // In Express 5 with path-to-regexp v8, wildcards return an array of segments
    const pathSegments = req.params.path;
    const imagePath = Array.isArray(pathSegments)
      ? pathSegments.join('/')
      : pathSegments;

    // Validate path to prevent traversal attacks and unexpected characters
    // Allow only alphanumerics, slashes, hyphens, underscores, and dots
    const isValidPath =
      /^[a-zA-Z0-9\-/._]+$/.test(imagePath) && !imagePath.includes('..');

    if (!isValidPath) {
      if (enableLogging) {
        console.warn(`[Proxy] Invalid image path: ${imagePath}`);
      }
      res.status(400).send('Invalid image path');
      return;
    }

    const azureUrl = `https://cerebrodatastorage.blob.core.windows.net/${imagePath}`;

    try {
      if (enableLogging) {
        console.log(`[Proxy] Fetching image: ${imagePath}`);
      }

      // Fetch from Azure
      const response = await fetch(azureUrl);

      if (!response.ok) {
        // Log the actual Azure status for debugging
        if (enableLogging) {
          console.error(`[Proxy] Azure request failed for ${imagePath}`, {
            azureStatus: response.status,
            azureStatusText: response.statusText,
            path: imagePath,
          });
        }

        // Return appropriate status based on Azure response
        if (response.status === 404) {
          res.status(404).send('Image not found');
          return;
        } else if (response.status === 403) {
          // Authentication issue - return 500 to hide config details
          res.status(500).send('Configuration error');
          return;
        } else if (response.status >= 500 || response.status === 503) {
          // Server error - client should retry
          res.status(503).send('Service temporarily unavailable');
          return;
        } else {
          // Other client errors
          res.status(500).send('Proxy error');
          return;
        }
      }

      // Get image data
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Generate ETag from content hash (if enabled)
      if (enableETag) {
        const etag = `"${createHash('md5').update(imageBuffer).digest('hex')}"`;

        // Check if client already has this version
        if (req.headers['if-none-match'] === etag) {
          if (enableLogging) {
            console.log(
              `[Proxy] Cache hit for ${imagePath} (304 Not Modified)`,
            );
          }
          res.status(304).end();
          return;
        }

        // Set aggressive caching headers with ETag
        res.set({
          'Content-Type': response.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
          ETag: etag,
        });
      } else {
        // Set caching headers without ETag
        res.set({
          'Content-Type': response.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
      }

      if (enableLogging) {
        console.log(
          `[Proxy] Serving ${imagePath} (${imageBuffer.length} bytes)`,
        );
      }
      res.send(imageBuffer);
    } catch (error) {
      // Classify error type for appropriate handling
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (enableLogging) {
        console.error(`[Proxy] Unexpected error fetching ${imagePath}`, {
          path: imagePath,
          errorType,
          errorMessage,
          error,
        });
      }

      // Check if it's a network error (fetch failed)
      if (error && typeof error === 'object' && 'code' in error) {
        // Network error - service unavailable
        res.status(503).send('Service temporarily unavailable');
        return;
      }

      // Other unexpected errors
      res.status(500).send('Proxy error');
    }
  };
}
