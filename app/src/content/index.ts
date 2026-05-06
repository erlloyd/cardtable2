/**
 * Content System
 *
 * High-level API for loading and instantiating game content.
 * Handles asset packs, scenarios, and table object creation.
 */

import type {
  Scenario,
  GameAssets,
  TableObject,
  AssetPack,
} from '@cardtable2/shared';
import {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  loadScenarioFromString,
  loadAssetPackFromString,
  mergeAssetPacks,
  resolveCard,
  resolveAllCards,
  resolveAssetUrl,
  getCardDimensions,
} from './loader';
import {
  expandDeck,
  namespaceDeckCards,
  namespaceCardCode,
  instantiateScenario,
} from './instantiate';
import { setComponentSetEntries } from './componentSetRegistry';
import {
  loadAllPlugins,
  loadPlugin,
  getPluginScenarioUrl,
  loadLocalPluginDirectory,
  getLocalPluginFile,
  PluginNotFoundError,
  type LoadedPlugin,
  type LocalPlugin,
  type PluginManifest,
  type PluginRegistryEntry,
} from './pluginLoader';

// Re-export types for convenience
export type { GameAssets } from '@cardtable2/shared';
export type { LoadedPlugin, LocalPlugin, PluginManifest, PluginRegistryEntry };

// Re-export functions for convenience
export {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  loadScenarioFromString,
  loadAssetPackFromString,
  mergeAssetPacks,
  resolveCard,
  resolveAllCards,
  resolveAssetUrl,
  getCardDimensions,
  expandDeck,
  namespaceDeckCards,
  namespaceCardCode,
  instantiateScenario,
  loadAllPlugins,
  loadPlugin,
  loadLocalPluginDirectory,
  PluginNotFoundError,
};

// ============================================================================
// High-Level API
// ============================================================================

export interface LoadedContent {
  scenario: Scenario;
  content: GameAssets;
  objects: Map<string, TableObject>;
}

/**
 * Metadata about a loaded scenario, stored in Y.Doc for persistence and multiplayer sync
 *
 * Uses discriminated union to ensure type safety - each scenario type has its required fields.
 */
export type LoadedScenarioMetadata =
  | {
      type: 'plugin';
      pluginId: string;
      scenarioFile: string;
      loadedAt: number;
      scenarioName: string;
    }
  | {
      type: 'builtin';
      scenarioUrl: string;
      loadedAt: number;
      scenarioName: string;
    }
  | {
      type: 'local-dev';
      loadedAt: number;
      scenarioName: string;
    };

/**
 * Load a complete scenario with all its packs and instantiate objects
 *
 * This is the main entry point for loading game content.
 * It handles:
 * - Loading the scenario manifest
 * - Loading all required asset packs
 * - Merging the packs
 * - Instantiating layout objects
 *
 * @param scenarioUrl - URL to the scenario JSON file
 * @param packBaseUrl - Optional base URL for resolving pack URLs (if packs use relative paths)
 * @returns Complete loaded content ready to be added to Y.Doc
 *
 * @example
 * ```typescript
 * const content = await loadCompleteScenario('/scenarios/testgame-basic.json');
 * // Add objects to Y.Doc
 * for (const [id, obj] of content.objects) {
 *   store.addObject(id, obj);
 * }
 * ```
 */
export async function loadCompleteScenario(
  scenarioUrl: string,
  packBaseUrl?: string,
): Promise<LoadedContent> {
  // Load scenario
  const scenario = await loadScenario(scenarioUrl);

  // Resolve pack URLs
  const packUrls = scenario.packs.map((packId) => {
    // If packId looks like a URL, use it directly
    if (
      packId.startsWith('http://') ||
      packId.startsWith('https://') ||
      packId.startsWith('/')
    ) {
      return packId;
    }
    // Otherwise, construct URL from packId
    // Default to /packs/<packId>.json
    const baseUrl = packBaseUrl ?? '/packs';
    return `${baseUrl}/${packId}.json`;
  });

  // Load all packs in parallel
  const packs = await loadAssetPacks(packUrls);

  // Merge packs - pass packBaseUrl for attachment image resolution
  // (attachment images live in the plugin repo, not at pack.baseUrl)
  const content = mergeAssetPacks(packs, packBaseUrl);

  // Instantiate scenario objects
  const objects = instantiateScenario(scenario, content);

  return {
    scenario,
    content,
    objects,
  };
}

/**
 * Load scenario metadata without instantiating objects
 *
 * Useful for previewing scenarios or loading manifest information
 * without the full content loading overhead.
 *
 * @param scenarioUrl - URL to the scenario JSON file
 * @returns Scenario manifest
 */
export async function loadScenarioMetadata(
  scenarioUrl: string,
): Promise<Scenario> {
  return loadScenario(scenarioUrl);
}

/**
 * Load all asset packs for a plugin
 *
 * Loads ALL asset packs from the plugin manifest and merges them.
 * This is the single code path for loading game assets — all games
 * are plugins (including built-in test games).
 *
 * @param pluginId - The plugin ID from pluginsIndex.json
 * @returns Merged game assets from all packs
 *
 * @example
 * ```typescript
 * const assets = await loadPluginAssets('testgame');
 * // Assets has all cards/tokens from all packs in the plugin
 * ```
 */
export async function loadPluginAssets(pluginId: string): Promise<GameAssets> {
  const plugin = await loadPlugin(pluginId);
  const baseUrl = plugin.registry.baseUrl.replace(/\/$/, '');

  const packUrls = plugin.manifest.assets.map(
    (filename) => `${baseUrl}/${filename}`,
  );

  const packs = await loadAssetPacks(packUrls);
  const assets = mergeAssetPacks(packs, baseUrl);

  // Populate the component-set registry from the plugin manifest. The Load
  // Components modal reads from this registry at click time. Before this
  // line existed the registry was only populated by `loadScenarioContent`
  // (called when a user explicitly loaded a scenario), so a user navigating
  // to a fresh table — which now eagerly loads plugin assets without auto-
  // loading a scenario (ct-4wk) — saw an empty modal. Calling this here
  // makes any plugin-load path populate the registry idempotently;
  // subsequent scenario loads pass the same data through the same setter,
  // so no duplication concerns.
  if (
    plugin.manifest.componentSets &&
    plugin.manifest.componentSets.length > 0
  ) {
    setComponentSetEntries(
      plugin.manifest.componentSets,
      plugin.registry.baseUrl,
    );
  }

  return assets;
}

// ============================================================================
// Plugin-Based Loading
// ============================================================================

/**
 * Load a scenario from a plugin against already-resident game assets.
 *
 * This is the pure scenario-load path: fetch the scenario JSON, instantiate
 * objects against the supplied `gameAssets`. It does NOT fetch asset packs.
 *
 * Callers are expected to have already loaded the plugin's assets (e.g. via
 * `loadPluginAssets` on table mount, served from the plugin cache). On the
 * happy path this is a single network request — the scenario JSON — plus a
 * synchronous `instantiateScenario` call.
 *
 * @param pluginId - The plugin ID from pluginsIndex.json (used to resolve the
 *   scenario URL via the plugin registry)
 * @param scenarioFilename - The scenario filename from the plugin manifest
 * @param gameAssets - Already-loaded game assets the scenario instantiates
 *   against
 * @returns Complete loaded content; `content` is the same `gameAssets`
 *   reference passed in (no merge happens here)
 *
 * @example
 * ```typescript
 * const gameAssets = store.getGameAssets() ?? await loadPluginAssets(pluginId);
 * const content = await loadScenarioFromPlugin(pluginId, 'rhino-scenario.json', gameAssets);
 * for (const [id, obj] of content.objects) {
 *   store.setObject(id, obj);
 * }
 * ```
 */
export async function loadScenarioFromPlugin(
  pluginId: string,
  scenarioFilename: string,
  gameAssets: GameAssets,
): Promise<LoadedContent> {
  // Plugin lookup is served from the in-flight cache on the happy path.
  const plugin = await loadPlugin(pluginId);

  const scenarioUrl = getPluginScenarioUrl(plugin, scenarioFilename);
  const scenario = await loadScenario(scenarioUrl);
  const objects = instantiateScenario(scenario, gameAssets);

  return { scenario, content: gameAssets, objects };
}

/**
 * Load a scenario from a local plugin directory
 *
 * Prompts the user to select a plugin directory, reads all files locally,
 * and loads the scenario. This is useful for plugin development.
 *
 * @param scenarioFilename - The scenario filename from the plugin manifest
 * @returns Complete loaded content ready to be added to Y.Doc
 *
 * @example
 * ```typescript
 * const content = await loadLocalPluginScenario('marvelchampions-rhino-scenario.json');
 * // Add objects to Y.Doc
 * for (const [id, obj] of content.objects) {
 *   store.setObject(id, obj);
 * }
 * ```
 */
export interface LoadedLocalPluginContent extends LoadedContent {
  pluginManifest: PluginManifest;
  blobUrls: Map<string, string>; // filename → blob URL (for images and scripts)
}

export async function loadLocalPluginScenario(
  scenarioFilename?: string,
): Promise<LoadedLocalPluginContent> {
  // Prompt user to select directory
  const plugin = await loadLocalPluginDirectory();

  // If no scenario specified, use first one from manifest
  const targetScenario = scenarioFilename ?? plugin.manifest.scenarios[0];
  if (!targetScenario) {
    throw new Error('No scenario found in plugin manifest');
  }

  // Load ALL asset packs from the plugin manifest (not just scenario.packs)
  const packs: AssetPack[] = [];
  for (const assetFilename of plugin.manifest.assets) {
    const packJson = await getLocalPluginFile(plugin, assetFilename);
    const pack = loadAssetPackFromString(packJson, assetFilename);
    packs.push(pack);
  }

  // Merge packs
  const content = mergeAssetPacks(packs);

  // Load scenario JSON
  const scenarioJson = await getLocalPluginFile(plugin, targetScenario);
  const scenario = loadScenarioFromString(scenarioJson, targetScenario);

  // Replace relative image paths with blob URLs from local filesystem
  replaceImagePathsWithBlobUrls(content, plugin.imageUrls);

  // Instantiate scenario objects
  const objects = instantiateScenario(scenario, content);

  return {
    scenario,
    content,
    objects,
    pluginManifest: plugin.manifest,
    blobUrls: plugin.imageUrls,
  };
}

/**
 * Find a blob URL for a given image path.
 *
 * Tries a direct map lookup first (for relative paths like "tokens/damage.png").
 * If that fails, scans the map for entries whose relative path is a
 * path-boundary suffix of `imagePath` — this handles already-resolved URLs
 * like "http://.../tokens/damage.png" matching "tokens/damage.png".
 *
 * The path-boundary check prevents false positives: "extra-damage.png" must
 * not match a registered "damage.png".
 *
 * Exported for unit testing; see `replaceImagePathsWithBlobUrls` for the
 * primary caller.
 *
 * @param imagePath - Path or URL to resolve
 * @param imageUrls - Map of relative paths to blob URLs
 * @returns The matching blob URL, or `undefined` if no match
 */
export function findBlobUrl(
  imagePath: string,
  imageUrls: Map<string, string>,
): string | undefined {
  // Try direct lookup first (for relative paths)
  const directMatch = imageUrls.get(imagePath);
  if (directMatch) {
    return directMatch;
  }

  // Try matching by checking if URL ends with any of the relative paths.
  // This handles already-resolved URLs like "http://.../tokens/damage.png".
  // We also verify the character before the match is a path separator (or the
  // path is an exact match) to avoid false positives like "extra-damage.png"
  // matching "damage.png".
  for (const [relativePath, blobUrl] of imageUrls.entries()) {
    if (
      imagePath.endsWith(relativePath) &&
      (imagePath.length === relativePath.length ||
        imagePath[imagePath.length - relativePath.length - 1] === '/')
    ) {
      return blobUrl;
    }
  }

  return undefined;
}

/**
 * Replace relative image paths in GameAssets with blob URLs
 *
 * This is used for local plugin loading to replace paths like "tokens/damage.png"
 * with blob URLs like "blob:http://localhost:3000/abc-123-def" that point to
 * the actual file data in memory.
 *
 * Handles both relative paths (e.g., "tokens/damage.png") and already-resolved
 * URLs (e.g., "http://localhost:3001/api/card-image/.../tokens/damage.png").
 *
 * @param content - Merged game assets to modify in-place
 * @param imageUrls - Map of relative paths to blob URLs
 */
export function replaceImagePathsWithBlobUrls(
  content: GameAssets,
  imageUrls: Map<string, string>,
): void {
  let replacementCount = 0;
  const unmatchedImages: Array<{ type: string; key: string; path: string }> =
    [];

  if (content.tokenTypes) {
    for (const [key, tokenType] of Object.entries(content.tokenTypes)) {
      const blobUrl = findBlobUrl(tokenType.image, imageUrls);
      if (blobUrl) {
        tokenType.image = blobUrl;
        replacementCount++;
      } else {
        unmatchedImages.push({ type: 'token', key, path: tokenType.image });
      }
    }
  }

  if (content.statusTypes) {
    for (const [key, statusType] of Object.entries(content.statusTypes)) {
      const blobUrl = findBlobUrl(statusType.image, imageUrls);
      if (blobUrl) {
        statusType.image = blobUrl;
        replacementCount++;
      } else {
        unmatchedImages.push({ type: 'status', key, path: statusType.image });
      }
    }
  }

  if (content.iconTypes) {
    for (const [key, iconType] of Object.entries(content.iconTypes)) {
      const blobUrl = findBlobUrl(iconType.image, imageUrls);
      if (blobUrl) {
        iconType.image = blobUrl;
        replacementCount++;
      } else {
        unmatchedImages.push({ type: 'icon', key, path: iconType.image });
      }
    }
  }

  if (unmatchedImages.length > 0) {
    console.warn(
      `[Content] ${unmatchedImages.length} attachment image(s) could not be matched to local files`,
      { unmatchedImages },
    );
  }

  console.log(
    `[Content] Replaced ${replacementCount} image paths with blob URLs`,
  );
}
