import type { YjsStore } from '../store/YjsStore';
import type { LoadedContent, LoadedScenarioMetadata } from './index';
import { SCENARIO_OBJECT_ADD_FAILED } from '../constants/errorIds';
import { ActionRegistry } from '../actions/ActionRegistry';
import { registerAttachmentActions } from '../actions/attachmentActions';

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

  // Register dynamic attachment actions based on loaded game assets
  const registry = ActionRegistry.getInstance();
  registerAttachmentActions(registry, content.content);
  console.log(`${logPrefix} Registered attachment actions for loaded content`);

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
