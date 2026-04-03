/**
 * Web Worker sandbox for running plugin deck import parsers.
 *
 * Creates a classic (non-module) worker that loads plugin JS via importScripts().
 * The plugin JS assigns self.parseDeckResponse, which the worker shell calls
 * with the API response and game assets.
 *
 * Security model:
 * - Worker has no DOM access, no cookie access
 * - Core handles all network fetching; worker only parses data
 * - Worker is terminated after each import (no persistent state)
 * - Timeout prevents hung workers
 */

import type { ComponentSet, GameAssets } from '@cardtable2/shared';

// ============================================================================
// Types
// ============================================================================

export interface DeckImportSandboxOptions {
  timeout?: number; // Timeout in ms (default: 10000)
}

export interface ParseRequest {
  parserModuleUrl: string; // URL to plugin's deckImport.js
  apiResponse: unknown; // Raw API response JSON
  gameAssets: GameAssets; // Full game assets for card lookup
}

/** Message sent to the worker */
interface WorkerInMessage {
  type: 'parse';
  parserModuleUrl: string;
  apiResponse: unknown;
  gameAssets: GameAssets;
}

/** Message received from the worker */
interface WorkerOutMessage {
  type: 'result' | 'error';
  result?: ComponentSet;
  error?: string;
}

// ============================================================================
// Worker shell code (inlined as a blob URL)
// ============================================================================

const WORKER_CODE = `
self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type !== 'parse') return;

  try {
    // Load plugin parser
    importScripts(msg.parserModuleUrl);

    // Call the parser function the plugin assigned to self
    if (typeof self.parseDeckResponse !== 'function') {
      self.postMessage({
        type: 'error',
        error: 'Plugin does not define self.parseDeckResponse function'
      });
      return;
    }

    var result = self.parseDeckResponse(msg.apiResponse, msg.gameAssets);
    self.postMessage({ type: 'result', result: result });
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err && err.message ? err.message : String(err)
    });
  }
};
`;

// ============================================================================
// DeckImportSandbox
// ============================================================================

export class DeckImportSandbox {
  readonly timeout: number;
  private workerBlobUrl: string | null = null;

  constructor(options?: DeckImportSandboxOptions) {
    this.timeout = options?.timeout ?? 10000;
  }

  /**
   * Parse an API response using a plugin's parser module.
   *
   * Creates a worker, loads the plugin JS, runs the parser, and returns the result.
   * The worker is terminated after completion (success or failure).
   */
  async parse(request: ParseRequest): Promise<ComponentSet> {
    if (!request.parserModuleUrl) {
      throw new Error('Parser module URL is required');
    }

    // Create worker from inlined code
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    this.workerBlobUrl = URL.createObjectURL(blob);
    const worker = new Worker(this.workerBlobUrl);

    try {
      return await new Promise<ComponentSet>((resolve, reject) => {
        // Set up timeout
        const timer = setTimeout(() => {
          worker.terminate();
          reject(
            new Error(
              `Deck import timed out after ${this.timeout}ms. The plugin parser may be stuck.`,
            ),
          );
        }, this.timeout);

        // Handle worker messages
        worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          clearTimeout(timer);
          worker.terminate();

          if (e.data.type === 'error') {
            reject(new Error(`Plugin parser error: ${e.data.error}`));
          } else if (e.data.type === 'result') {
            resolve(e.data.result ?? {});
          }
        };

        // Handle worker errors (e.g., importScripts failure)
        worker.onerror = (e: ErrorEvent) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(`Worker error: ${e.message ?? 'unknown error'}`));
        };

        // Send parse request
        const message: WorkerInMessage = {
          type: 'parse',
          parserModuleUrl: request.parserModuleUrl,
          apiResponse: request.apiResponse,
          gameAssets: request.gameAssets,
        };
        worker.postMessage(message);
      });
    } finally {
      // Clean up blob URL
      if (this.workerBlobUrl) {
        URL.revokeObjectURL(this.workerBlobUrl);
        this.workerBlobUrl = null;
      }
    }
  }

  /** Clean up any lingering resources */
  dispose(): void {
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
      this.workerBlobUrl = null;
    }
  }
}
