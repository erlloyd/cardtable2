/**
 * Simple registry for currently available component sets.
 *
 * Set when a plugin with componentSets is loaded.
 * Cleared on table reset.
 * Read by the ComponentSetModal to know what to display.
 */

import type { ComponentSetEntry } from '@cardtable2/shared';

let currentEntries: ComponentSetEntry[] = [];
let currentPluginBaseUrl = '';
let currentBlobUrls: Map<string, string> = new Map();

export function setComponentSetEntries(
  entries: ComponentSetEntry[],
  pluginBaseUrl: string,
  blobUrls?: Map<string, string>,
): void {
  currentEntries = entries;
  currentPluginBaseUrl = pluginBaseUrl;
  currentBlobUrls = blobUrls ?? new Map<string, string>();
}

export function getComponentSetEntries(): ComponentSetEntry[] {
  return currentEntries;
}

export function getComponentSetPluginBaseUrl(): string {
  return currentPluginBaseUrl;
}

/**
 * Resolve a parser module filename to a usable URL.
 * For remote plugins: baseUrl + filename.
 * For local plugins: looks up blob URL by filename.
 */
export function resolveParserModuleUrl(filename: string): string {
  // Check blob URLs first (local plugins)
  const blobUrl = currentBlobUrls.get(filename);
  if (blobUrl) return blobUrl;

  // Fall back to remote URL
  if (currentPluginBaseUrl) {
    return `${currentPluginBaseUrl}${filename}`;
  }

  return filename;
}

export function clearComponentSetEntries(): void {
  currentEntries = [];
  currentPluginBaseUrl = '';
  currentBlobUrls = new Map();
}
