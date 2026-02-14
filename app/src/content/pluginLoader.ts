/**
 * Plugin loading system
 *
 * Loads plugins from external GitHub repositories and provides APIs
 * to discover and load asset packs and scenarios.
 */

import {
  PLUGIN_REGISTRY_FETCH_FAILED,
  PLUGIN_REGISTRY_PARSE_FAILED,
  PLUGIN_REGISTRY_INVALID,
  PLUGIN_MANIFEST_FETCH_FAILED,
  PLUGIN_MANIFEST_PARSE_FAILED,
  PLUGIN_MANIFEST_INVALID,
  PLUGIN_NOT_FOUND,
  PLUGIN_LOCAL_DIRECTORY_CANCELLED,
  PLUGIN_LOCAL_NO_INDEX,
  PLUGIN_LOCAL_INDEX_PARSE_FAILED,
  PLUGIN_LOCAL_FILE_NOT_FOUND,
  PLUGIN_LOCAL_INCOMPLETE,
} from '../constants/errorIds';

// ============================================================================
// Types
// ============================================================================

export interface PluginRegistry {
  plugins: PluginRegistryEntry[];
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  baseUrl: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  assets: string[];
  scenarios: string[];
}

export interface LoadedPlugin {
  registry: PluginRegistryEntry;
  manifest: PluginManifest;
}

// ============================================================================
// Plugin Registry Loading
// ============================================================================

/**
 * Load the central plugin registry
 *
 * @throws {Error} If fetch fails, JSON parsing fails, or validation fails
 */
export async function loadPluginRegistry(): Promise<PluginRegistry> {
  let response;
  try {
    response = await fetch('/pluginsIndex.json');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PluginLoader] Failed to fetch plugin registry', {
      errorId: PLUGIN_REGISTRY_FETCH_FAILED,
      error: message,
    });
    throw new Error(
      `Failed to load plugin registry: network error - ${message}`,
    );
  }

  if (!response.ok) {
    console.error('[PluginLoader] Plugin registry fetch failed', {
      errorId: PLUGIN_REGISTRY_FETCH_FAILED,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(
      `Failed to load plugin registry: ${response.status} ${response.statusText}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PluginLoader] Failed to parse plugin registry JSON', {
      errorId: PLUGIN_REGISTRY_PARSE_FAILED,
      error: message,
    });
    throw new Error(`Failed to parse plugin registry JSON: ${message}`);
  }

  // Basic validation
  if (typeof data !== 'object' || data === null) {
    console.error('[PluginLoader] Invalid plugin registry structure', {
      errorId: PLUGIN_REGISTRY_INVALID,
      type: typeof data,
    });
    throw new Error('Invalid plugin registry: expected object');
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.plugins)) {
    console.error('[PluginLoader] Invalid plugin registry: missing plugins', {
      errorId: PLUGIN_REGISTRY_INVALID,
      hasPlugins: 'plugins' in obj,
      pluginsType: typeof obj.plugins,
    });
    throw new Error('Invalid plugin registry: missing plugins array');
  }

  return data as PluginRegistry;
}

// ============================================================================
// Plugin Manifest Loading
// ============================================================================

/**
 * Load a plugin manifest from its baseUrl
 *
 * @throws {Error} If fetch fails, JSON parsing fails, or validation fails
 */
export async function loadPluginManifest(
  baseUrl: string,
): Promise<PluginManifest> {
  const manifestUrl = `${baseUrl}index.json`;

  let response;
  try {
    response = await fetch(manifestUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PluginLoader] Failed to fetch plugin manifest', {
      errorId: PLUGIN_MANIFEST_FETCH_FAILED,
      url: manifestUrl,
      error: message,
    });
    throw new Error(
      `Failed to load plugin manifest from ${manifestUrl}: network error - ${message}`,
    );
  }

  if (!response.ok) {
    console.error('[PluginLoader] Plugin manifest fetch failed', {
      errorId: PLUGIN_MANIFEST_FETCH_FAILED,
      url: manifestUrl,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(
      `Failed to load plugin manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PluginLoader] Failed to parse plugin manifest JSON', {
      errorId: PLUGIN_MANIFEST_PARSE_FAILED,
      url: manifestUrl,
      error: message,
    });
    throw new Error(`Failed to parse plugin manifest JSON: ${message}`);
  }

  // Basic validation
  if (typeof data !== 'object' || data === null) {
    console.error('[PluginLoader] Invalid plugin manifest structure', {
      errorId: PLUGIN_MANIFEST_INVALID,
      url: manifestUrl,
      type: typeof data,
    });
    throw new Error('Invalid plugin manifest: expected object');
  }

  const obj = data as Record<string, unknown>;
  if (!obj.id || !obj.name || !obj.version) {
    console.error('[PluginLoader] Invalid plugin manifest: missing fields', {
      errorId: PLUGIN_MANIFEST_INVALID,
      url: manifestUrl,
      hasId: !!obj.id,
      hasName: !!obj.name,
      hasVersion: !!obj.version,
    });
    throw new Error(
      'Invalid plugin manifest: missing required fields (id, name, version)',
    );
  }

  if (!Array.isArray(obj.assets)) {
    console.error('[PluginLoader] Invalid plugin manifest: assets not array', {
      errorId: PLUGIN_MANIFEST_INVALID,
      url: manifestUrl,
      assetsType: typeof obj.assets,
    });
    throw new Error('Invalid plugin manifest: assets must be an array');
  }

  if (!Array.isArray(obj.scenarios)) {
    console.error(
      '[PluginLoader] Invalid plugin manifest: scenarios not array',
      {
        errorId: PLUGIN_MANIFEST_INVALID,
        url: manifestUrl,
        scenariosType: typeof obj.scenarios,
      },
    );
    throw new Error('Invalid plugin manifest: scenarios must be an array');
  }

  return data as PluginManifest;
}

// ============================================================================
// Plugin Discovery
// ============================================================================

/**
 * Load all plugins from the registry
 *
 * Uses Promise.allSettled() to continue loading even if some plugins fail.
 * Failed plugins are logged but don't prevent other plugins from loading.
 *
 * @returns Array of successfully loaded plugins
 */
export async function loadAllPlugins(): Promise<LoadedPlugin[]> {
  const registry = await loadPluginRegistry();
  const promises = registry.plugins.map(async (entry) => {
    const manifest = await loadPluginManifest(entry.baseUrl);
    return { registry: entry, manifest };
  });

  const results = await Promise.allSettled(promises);

  // Filter successful results and log failures
  const loaded: LoadedPlugin[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      loaded.push(result.value);
    } else {
      const errorObject =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      console.error('[PluginLoader] Failed to load plugin', {
        pluginId: registry.plugins[i].id,
        baseUrl: registry.plugins[i].baseUrl,
        error: errorObject,
      });
    }
  }

  return loaded;
}

/**
 * Load a single plugin by ID
 *
 * @throws {Error} If plugin not found in registry or loading fails
 */
export async function loadPlugin(pluginId: string): Promise<LoadedPlugin> {
  const registry = await loadPluginRegistry();
  const entry = registry.plugins.find((p) => p.id === pluginId);

  if (!entry) {
    console.error('[PluginLoader] Plugin not found in registry', {
      errorId: PLUGIN_NOT_FOUND,
      pluginId,
      availablePlugins: registry.plugins.map((p) => p.id),
    });
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  const manifest = await loadPluginManifest(entry.baseUrl);
  return { registry: entry, manifest };
}

// ============================================================================
// URL Resolution
// ============================================================================

/**
 * Resolve asset pack URL from plugin
 */
export function getPluginAssetUrl(
  plugin: LoadedPlugin,
  assetFilename: string,
): string {
  return `${plugin.registry.baseUrl}${assetFilename}`;
}

/**
 * Resolve scenario URL from plugin
 */
export function getPluginScenarioUrl(
  plugin: LoadedPlugin,
  scenarioFilename: string,
): string {
  return `${plugin.registry.baseUrl}${scenarioFilename}`;
}

/**
 * Get all asset pack URLs for a plugin
 */
export function getPluginAssetUrls(plugin: LoadedPlugin): string[] {
  return plugin.manifest.assets.map((filename) =>
    getPluginAssetUrl(plugin, filename),
  );
}

/**
 * Get all scenario URLs for a plugin
 */
export function getPluginScenarioUrls(plugin: LoadedPlugin): string[] {
  return plugin.manifest.scenarios.map((filename) =>
    getPluginScenarioUrl(plugin, filename),
  );
}

// ============================================================================
// Local Plugin Loading (from directory upload)
// ============================================================================

export interface LocalPlugin {
  manifest: PluginManifest;
  files: Map<string, File>;
  imageUrls: Map<string, string>; // Maps relative path (e.g., "tokens/damage.png") to blob URL
}

// Track blob URLs from previous local plugin loads so they can be revoked
let previousBlobUrls: string[] = [];

/**
 * Load a plugin from a local directory (via directory picker)
 *
 * Prompts the user to select a plugin directory, reads all files,
 * and returns a LocalPlugin that can be used for loading scenarios.
 *
 * @throws {Error} If user cancels, index.json missing, parsing fails, or validation fails
 */
export async function loadLocalPluginDirectory(): Promise<LocalPlugin> {
  // Revoke blob URLs from any previously loaded local plugin
  for (const url of previousBlobUrls) {
    URL.revokeObjectURL(url);
  }
  previousBlobUrls = [];

  // Create temporary input element for directory selection
  const input = document.createElement('input');
  input.type = 'file';
  input.webkitdirectory = true;
  input.multiple = true;

  // Wait for user to select directory
  const files = await new Promise<FileList | null>((resolve) => {
    input.onchange = () => resolve(input.files);
    input.oncancel = () => resolve(null);
    input.click();
  });

  if (!files || files.length === 0) {
    console.error('[PluginLoader] User cancelled directory selection', {
      errorId: PLUGIN_LOCAL_DIRECTORY_CANCELLED,
    });
    throw new Error('No directory selected');
  }

  // Find and load index.json
  let indexFile: File | undefined;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name === 'index.json') {
      indexFile = file;
      break;
    }
  }

  if (!indexFile) {
    console.error('[PluginLoader] No index.json in selected directory', {
      errorId: PLUGIN_LOCAL_NO_INDEX,
      fileCount: files.length,
      files: Array.from(files).map((f) => f.name),
    });
    throw new Error('No index.json found in selected directory');
  }

  // Read and parse manifest
  const manifestText = await indexFile.text();
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PluginLoader] Failed to parse local index.json', {
      errorId: PLUGIN_LOCAL_INDEX_PARSE_FAILED,
      error: message,
    });
    throw new Error(`Failed to parse index.json: ${message}`);
  }

  // Basic validation
  if (typeof manifest !== 'object' || manifest === null) {
    console.error('[PluginLoader] Invalid local plugin manifest structure', {
      errorId: PLUGIN_MANIFEST_INVALID,
      type: typeof manifest,
    });
    throw new Error('Invalid plugin manifest: expected object');
  }

  const obj = manifest as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.name !== 'string' ||
    typeof obj.version !== 'string'
  ) {
    console.error('[PluginLoader] Invalid local plugin manifest fields', {
      errorId: PLUGIN_MANIFEST_INVALID,
      hasId: typeof obj.id === 'string',
      hasName: typeof obj.name === 'string',
      hasVersion: typeof obj.version === 'string',
    });
    throw new Error(
      'Invalid plugin manifest: missing required fields (id, name, version)',
    );
  }

  if (!Array.isArray(obj.assets)) {
    console.error('[PluginLoader] Invalid local plugin: assets not array', {
      errorId: PLUGIN_MANIFEST_INVALID,
      assetsType: typeof obj.assets,
    });
    throw new Error('Invalid plugin manifest: assets must be an array');
  }

  if (!Array.isArray(obj.scenarios)) {
    console.error('[PluginLoader] Invalid local plugin: scenarios not array', {
      errorId: PLUGIN_MANIFEST_INVALID,
      scenariosType: typeof obj.scenarios,
    });
    throw new Error('Invalid plugin manifest: scenarios must be an array');
  }

  // Build file map
  const fileMap = new Map<string, File>();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    fileMap.set(file.name, file);
  }

  // Validate that all manifest files exist in the directory
  const missingFiles: string[] = [];

  for (const assetFile of obj.assets as string[]) {
    if (!fileMap.has(assetFile)) {
      missingFiles.push(assetFile);
    }
  }

  for (const scenarioFile of obj.scenarios as string[]) {
    if (!fileMap.has(scenarioFile)) {
      missingFiles.push(scenarioFile);
    }
  }

  if (missingFiles.length > 0) {
    console.error('[PluginLoader] Local plugin missing manifest files', {
      errorId: PLUGIN_LOCAL_INCOMPLETE,
      pluginId: obj.id,
      missingFiles,
      manifestAssets: obj.assets,
      manifestScenarios: obj.scenarios,
      availableFiles: Array.from(fileMap.keys()),
    });
    throw new Error(
      `Local plugin incomplete: missing files declared in manifest: ${missingFiles.join(', ')}`,
    );
  }

  // Create blob URLs for image files
  const imageUrls = new Map<string, string>();
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

  for (const [filename, file] of fileMap.entries()) {
    const hasImageExt = imageExtensions.some((ext) =>
      filename.toLowerCase().endsWith(ext),
    );
    if (hasImageExt) {
      const blobUrl = URL.createObjectURL(file);
      imageUrls.set(filename, blobUrl);
    }
  }

  // Track blob URLs for cleanup on next load
  previousBlobUrls = Array.from(imageUrls.values());

  console.log(`[PluginLoader] Loaded local plugin: ${obj.name}`, {
    fileCount: fileMap.size,
    imageCount: imageUrls.size,
    assets: obj.assets,
    scenarios: obj.scenarios,
  });

  return {
    manifest: manifest as PluginManifest,
    files: fileMap,
    imageUrls,
  };
}

/**
 * Get file content from local plugin
 *
 * @throws {Error} If file not found in plugin directory
 */
export async function getLocalPluginFile(
  plugin: LocalPlugin,
  filename: string,
): Promise<string> {
  const file = plugin.files.get(filename);
  if (!file) {
    console.error('[PluginLoader] File not found in local plugin', {
      errorId: PLUGIN_LOCAL_FILE_NOT_FOUND,
      filename,
      availableFiles: Array.from(plugin.files.keys()),
    });
    throw new Error(`File not found in local plugin: ${filename}`);
  }
  return file.text();
}
