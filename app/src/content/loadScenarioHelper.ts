import type { YjsStore } from '../store/YjsStore';
import type { LoadedContent, LoadedScenarioMetadata } from './index';

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
 * @param store - Yjs store instance
 * @param content - Loaded scenario content (scenario, gameAssets, objects)
 * @param metadata - Scenario metadata to store (for reload on mount)
 * @param logPrefix - Prefix for console logs (e.g., '[Load Plugin]')
 */
export function loadScenarioContent(
  store: YjsStore,
  content: LoadedContent,
  metadata: LoadedScenarioMetadata,
  logPrefix: string,
): void {
  console.log(`${logPrefix} Scenario loaded:`, {
    objectCount: content.objects.size,
    scenarioName: content.scenario.name,
    cardCount: Object.keys(content.content.cards).length,
  });

  // Store metadata in Y.Doc for persistence and multiplayer sync
  store.metadata.set('loadedScenario', metadata);
  console.log(`${logPrefix} Stored scenario metadata in Y.Doc`, metadata);

  // Set game assets in store (notifies subscribers like Board component)
  store.setGameAssets(content.content);

  // CRITICAL: Defer object addition to ensure gameAssets reach renderer first.
  //
  // Why this is necessary:
  // - store.setGameAssets() notifies subscribers synchronously
  // - Board's onGameAssetsChange sends assets to renderer in useEffect (next tick)
  // - Objects added to Y.Doc are forwarded to renderer immediately via useStoreSync
  // - Without setTimeout, objects reach renderer before gameAssets, causing card lookup failures
  //
  // The setTimeout ensures:
  // 1. store.setGameAssets notifies Board component
  // 2. setTimeout defers callback to next event loop tick
  // 3. React completes re-render, Board useEffect sends gameAssets to renderer
  // 4. Callback fires, objects are added to store and forwarded to renderer
  // 5. Renderer has correct gameAssets when rendering objects
  setTimeout(() => {
    for (const [id, obj] of content.objects) {
      store.setObject(id, obj);
    }
    console.log(`${logPrefix} Scenario loaded successfully`);
  }, 0);
}
