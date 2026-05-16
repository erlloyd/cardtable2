import type { LoadableEntry } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import type { LoadedContent, LoadedScenarioMetadata } from './index';
import { SCENARIO_OBJECT_ADD_FAILED } from '../constants/errorIds';
import { ActionRegistry } from '../actions/ActionRegistry';
import { registerAttachmentActions } from '../actions/attachmentActions';
import { setLoadableEntries, clearLoadableEntries } from './loadablesRegistry';
import { instantiateCounterSpawns } from './counterSpawn';

/**
 * Common logic for loading scenarios and adding objects to the table.
 *
 * Uses store.setGameAssets() to update game assets, which notifies all
 * subscribers (including Board component via onGameAssetsChange).
 *
 * Store coordinates timing internally: gameAssets are sent to renderer
 * before objects are added, ensuring correct rendering.
 *
 * Also stores scenario metadata in Y.Doc for persistence and multiplayer sync.
 *
 * Additionally, registers dynamic attachment actions based on the loaded
 * asset pack's tokenTypes, statusTypes, and modifierStats definitions.
 *
 * @param store - Yjs store instance
 * @param content - Loaded scenario content (scenario, gameAssets, objects)
 * @param metadata - Scenario metadata to store (for reload on mount)
 * @param logPrefix - Prefix for console logs (e.g., '[Load Plugin]')
 * @param pluginBaseUrl - Plugin base URL (for parser-module resolution in
 *   deck-import providers). Empty string for local-dev plugins.
 * @param blobUrls - Optional blob URL map for local plugin files (images +
 *   scripts). Used by `resolveParserModuleUrl` for in-memory script lookup.
 * @param pluginLoadables - Optional loadables[] from plugin manifest. Populated
 *   into the runtime loadablesRegistry so the picker UI / per-type Load
 *   commands surface the active plugin's items. Required for the local-dev
 *   path, which bypasses `loadPluginAssets()` (where the registered-plugin
 *   path populates the registry). See ct-erb.
 */
export function loadScenarioContent(
  store: YjsStore,
  content: LoadedContent,
  metadata: LoadedScenarioMetadata,
  logPrefix: string,
  pluginBaseUrl?: string,
  blobUrls?: Map<string, string>,
  pluginLoadables?: LoadableEntry[],
): void {
  console.log(`${logPrefix} Scenario loaded:`, {
    objectCount: content.objects.size,
    scenarioName: content.scenario.name,
    cardCount: Object.keys(content.content.cards).length,
  });

  // Store metadata in Y.Doc for persistence and multiplayer sync
  store.metadata.set('loadedScenario', metadata);
  console.log(`${logPrefix} Stored scenario metadata in Y.Doc`, metadata);

  // Local-dev scenarios replace the table's plugin identity entirely. Clear any
  // stale `pluginId` from a prior registry-driven load so the mount effect on
  // the next reload doesn't eagerly re-fetch that plugin's assets and overwrite
  // the local-plugin gameAssets we're about to set (regression introduced by
  // ct-4wk's eager mount-time `loadPluginAssets`; see ct-62j).
  //
  // Registry-driven scenarios ('plugin') intentionally do NOT touch `pluginId`
  // here — the mount effect's eager plugin-asset load is the whole point of
  // ct-4wk and the table's binding to its plugin is preserved by design.
  if (metadata.type === 'local-dev') {
    store.metadata.delete('pluginId');
  }

  // Set game assets in store (notifies subscribers like Board component)
  store.setGameAssets(content.content);

  // Register dynamic attachment actions based on loaded game assets
  const registry = ActionRegistry.getInstance();
  registerAttachmentActions(registry, content.content);
  console.log(`${logPrefix} Registered attachment actions for loaded content`);

  // Populate the loadables registry so the picker UI and per-type "Load …"
  // commands see the active plugin's items. Clear unconditionally first so a
  // plugin-switch to a plugin with no loadables doesn't leak the previous
  // plugin's entries. The registered-plugin path also populates this in
  // `loadPluginAssets()`; the local-dev path bypasses that, so populating here
  // makes `loadScenarioContent` the single source of truth for "apply this
  // plugin's runtime state to the active table." See ct-erb.
  //
  // We also pass `pluginBaseUrl` and `blobUrls` so the registry can resolve
  // parser-module paths for deck-import providers. Local-dev plugins ship
  // a blobUrls map (with one blob: URL per script file); registered plugins
  // pass their remote baseUrl and an empty/absent map.
  clearLoadableEntries();
  if (pluginLoadables && pluginLoadables.length > 0) {
    setLoadableEntries(
      pluginLoadables,
      content.content,
      pluginBaseUrl ?? '',
      blobUrls,
    );
    console.log(
      `${logPrefix} Registered ${pluginLoadables.length} loadable entries`,
    );
  }

  // ct-x41: Materialise scenario-declared typed-counter auto-spawns now that
  // the loadables registry holds the active plugin's counter type defs.
  // Spawns are merged into the same objects map the setTimeout below sends
  // to the store, so they participate in the same Yjs transaction batching
  // as the componentSet objects and arrive at the renderer in one tick.
  //
  // Pass `pluginLoadables` explicitly rather than relying on the just-set
  // global registry: keeps this resolution step independent of registry
  // write order and matches the per-type resolver's documented usage
  // (`getCounterTypeDef(typeId, entries?)` — explicit-entries path).
  const counterSpawnObjects = instantiateCounterSpawns(
    content.scenario.counters,
    content.scenario.id,
    pluginLoadables,
  );
  if (counterSpawnObjects.size > 0) {
    for (const [id, obj] of counterSpawnObjects) {
      content.objects.set(id, obj);
    }
    console.log(
      `${logPrefix} Materialised ${counterSpawnObjects.size} auto-spawned counter(s)`,
    );
  }

  // CRITICAL: Defer object addition to ensure gameAssets reach renderer first.
  //
  // Why setTimeout(0) is necessary:
  //
  // Timing issue without setTimeout:
  // - store.setGameAssets() notifies Board component synchronously (line 38)
  // - Board's onGameAssetsChange schedules useEffect to send assets to renderer (next React render)
  // - Objects added to Y.Doc (without setTimeout) are forwarded to renderer IMMEDIATELY via useStoreSync
  // - Result: Objects arrive at renderer before gameAssets, causing card lookup failures
  //
  // How setTimeout(0) fixes the race:
  // 1. store.setGameAssets() notifies Board component (synchronous)
  // 2. setTimeout(0) defers object addition to next event loop tick (asynchronous)
  // 3. React completes re-render cycle, Board useEffect sends gameAssets to renderer
  // 4. Event loop tick completes, setTimeout callback fires
  // 5. Objects are added to store and forwarded to renderer
  // 6. Renderer now has gameAssets available when rendering objects
  //
  // This ensures React's state updates complete before Y.Doc mutations.
  setTimeout(() => {
    try {
      for (const [id, obj] of content.objects) {
        store.setObject(id, obj);
      }
      console.log(`${logPrefix} Scenario loaded successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} Failed to add scenario objects`, {
        errorId: SCENARIO_OBJECT_ADD_FAILED,
        error,
        objectCount: content.objects.size,
        scenarioName: content.scenario.name,
        errorMessage,
      });
      // Re-throw to prevent silent failure
      throw error;
    }
  }, 0);
}
