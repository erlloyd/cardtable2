/**
 * Deck Import Engine — orchestrates API-based deck imports.
 *
 * Flow: build URL → fetch → worker parse → resolve → instantiate → return objects
 *
 * This module handles the API fetch and error handling.
 * The worker sandbox handles parsing, and the shared componentSet module
 * handles resolution and instantiation.
 */

import type {
  ComponentSet,
  GameAssets,
  LoadableProviderApiEndpoints,
  LoadableProviderSource,
} from '@cardtable2/shared';
import type { TableObject } from '@cardtable2/shared';
import { DeckImportSandbox } from './DeckImportSandbox';
import { resolveComponentSet, instantiateComponentSet } from './componentSet';
import { resolveParserModuleUrl } from './loadablesRegistry';

// ============================================================================
// Types
// ============================================================================

export interface ImportFromApiOptions {
  deckId: string;
  isPrivate: boolean;
  /**
   * The provider-source declaration carrying everything the engine needs:
   * the parser-module path, the apiEndpoints templates, and the labels
   * (the labels are surfaced through the modal UI; the engine itself only
   * uses module + endpoints).
   */
  source: LoadableProviderSource;
  gameAssets: GameAssets;
}

export type ImportResult =
  | { name?: string; objectCount: number; objects: Map<string, TableObject> }
  | { error: string };

// ============================================================================
// URL Building
// ============================================================================

function buildApiUrl(
  endpoints: LoadableProviderApiEndpoints,
  deckId: string,
  isPrivate: boolean,
): string {
  const template =
    isPrivate && endpoints.private ? endpoints.private : endpoints.public;

  return template.replace('{deckId}', deckId);
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import a deck from an external API.
 *
 * Returns either a success result with created objects, or an error message.
 * Never throws — all errors are returned as { error: string }.
 */
export async function importFromApi(
  options: ImportFromApiOptions,
): Promise<ImportResult> {
  const { deckId, isPrivate, source, gameAssets } = options;

  // 0. Validate provider config: apiEndpoints.public is required to fetch.
  const endpoints = source.config?.apiEndpoints;
  if (!endpoints || !endpoints.public) {
    return {
      error: `Provider "${source.module}" is missing required apiEndpoints.public for deck ${deckId}`,
    };
  }

  // 1. Build API URL
  const apiUrl = buildApiUrl(endpoints, deckId, isPrivate);

  // 2. Fetch from API
  let apiResponse: unknown;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return {
        error: `API returned ${response.status} ${response.statusText} for deck ${deckId}`,
      };
    }
    apiResponse = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to fetch deck ${deckId}: ${message}` };
  }

  // 3. Parse via worker sandbox
  let componentSet: ComponentSet;
  const sandbox = new DeckImportSandbox();
  try {
    const parserModuleUrl = resolveParserModuleUrl(source.module);
    componentSet = await sandbox.parse({
      parserModuleUrl,
      apiResponse,
      gameAssets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Parser failed for deck ${deckId}: ${message}` };
  } finally {
    sandbox.dispose();
  }

  // 4. Resolve and instantiate (shared with static path)
  try {
    const resolved = resolveComponentSet(componentSet, gameAssets);
    const objects = instantiateComponentSet(resolved, gameAssets);

    return {
      objectCount: objects.size,
      objects,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to create objects for deck ${deckId}: ${message}`,
    };
  }
}
