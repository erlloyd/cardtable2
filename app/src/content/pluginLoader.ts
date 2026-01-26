/**
 * Plugin loading system
 *
 * Loads plugins from external GitHub repositories and provides APIs
 * to discover and load asset packs and scenarios.
 */

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
 */
export async function loadPluginRegistry(): Promise<PluginRegistry> {
  const response = await fetch('/pluginsIndex.json');
  if (!response.ok) {
    throw new Error(
      `Failed to load plugin registry: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  // Basic validation
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid plugin registry: expected object');
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.plugins)) {
    throw new Error('Invalid plugin registry: missing plugins array');
  }

  return data as PluginRegistry;
}

// ============================================================================
// Plugin Manifest Loading
// ============================================================================

/**
 * Load a plugin manifest from its baseUrl
 */
export async function loadPluginManifest(
  baseUrl: string,
): Promise<PluginManifest> {
  const manifestUrl = `${baseUrl}index.json`;
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to load plugin manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  // Basic validation
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid plugin manifest: expected object');
  }

  const obj = data as Record<string, unknown>;
  if (!obj.id || !obj.name || !obj.version) {
    throw new Error(
      'Invalid plugin manifest: missing required fields (id, name, version)',
    );
  }

  if (!Array.isArray(obj.assets)) {
    throw new Error('Invalid plugin manifest: assets must be an array');
  }

  if (!Array.isArray(obj.scenarios)) {
    throw new Error('Invalid plugin manifest: scenarios must be an array');
  }

  return data as PluginManifest;
}

// ============================================================================
// Plugin Discovery
// ============================================================================

/**
 * Load all plugins from the registry
 */
export async function loadAllPlugins(): Promise<LoadedPlugin[]> {
  const registry = await loadPluginRegistry();
  const promises = registry.plugins.map(async (entry) => {
    const manifest = await loadPluginManifest(entry.baseUrl);
    return { registry: entry, manifest };
  });
  return Promise.all(promises);
}

/**
 * Load a single plugin by ID
 */
export async function loadPlugin(pluginId: string): Promise<LoadedPlugin> {
  const registry = await loadPluginRegistry();
  const entry = registry.plugins.find((p) => p.id === pluginId);

  if (!entry) {
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
}

/**
 * Load a plugin from a local directory (via directory picker)
 *
 * Prompts the user to select a plugin directory, reads all files,
 * and returns a LocalPlugin that can be used for loading scenarios.
 */
export async function loadLocalPluginDirectory(): Promise<LocalPlugin> {
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
    throw new Error('No index.json found in selected directory');
  }

  // Read and parse manifest
  const manifestText = await indexFile.text();
  const manifest: unknown = JSON.parse(manifestText);

  // Basic validation
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('Invalid plugin manifest: expected object');
  }

  const obj = manifest as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.name !== 'string' ||
    typeof obj.version !== 'string'
  ) {
    throw new Error(
      'Invalid plugin manifest: missing required fields (id, name, version)',
    );
  }

  if (!Array.isArray(obj.assets)) {
    throw new Error('Invalid plugin manifest: assets must be an array');
  }

  if (!Array.isArray(obj.scenarios)) {
    throw new Error('Invalid plugin manifest: scenarios must be an array');
  }

  // Build file map
  const fileMap = new Map<string, File>();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    fileMap.set(file.name, file);
  }

  console.log(`[PluginLoader] Loaded local plugin: ${obj.name}`, {
    fileCount: fileMap.size,
    assets: obj.assets,
    scenarios: obj.scenarios,
  });

  return {
    manifest: manifest as PluginManifest,
    files: fileMap,
  };
}

/**
 * Get file content from local plugin
 */
export async function getLocalPluginFile(
  plugin: LocalPlugin,
  filename: string,
): Promise<string> {
  const file = plugin.files.get(filename);
  if (!file) {
    throw new Error(`File not found in local plugin: ${filename}`);
  }
  return file.text();
}
