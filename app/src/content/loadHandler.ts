/**
 * Selection-handler logic for the generic Load... picker (ct-8gf.5).
 *
 * Centralises the bridge between the picker UI and the host's load primitives:
 *
 *   - replace + scenario      -> existing scenario load flow
 *   - additive + card         -> instantiate stack-of-1 at viewport center + jitter
 *   - additive + card-set     -> instantiate stack-of-N (one card per set entry)
 *                                at viewport center + jitter
 *   - additive + provider     -> not implemented in this iteration
 *
 * All inputs come from `LoadPickerModal` (`onSelectItem`) and the table route
 * (`store`, `getViewportState`).  Pure async functions: no React state, no
 * direct PixiJS access — viewport state is supplied by the caller via the
 * Promise the BoardHandle exposes.
 */

import {
  ObjectKind,
  type GameAssets,
  type LoadableEntry,
  type LoadableStaticItem,
  type Position,
} from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';
import {
  loadPlugin,
  loadPluginAssets,
  loadScenarioFromPlugin,
  type LoadedScenarioMetadata,
} from './index';
import { loadScenarioContent } from './loadScenarioHelper';
import {
  getViewportCenterPlacement,
  type ViewportState,
} from '../utils/viewportPlacement';
import {
  ACTION_LOAD_SCENARIO_FAILED,
  LOAD_ADDITIVE_FAILED,
} from '../constants/errorIds';

/**
 * Item payload narrowing helpers.
 *
 * Each derived/static loadable type pins its own data shape; we narrow it at
 * the boundary here (the picker itself stays generic) so the YjsActions /
 * scenario-load functions get a strongly-typed value.
 */
interface ScenarioItemData {
  file: string;
}

interface CardItemData {
  code: string;
}

function isScenarioItemData(data: unknown): data is ScenarioItemData {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { file?: unknown }).file === 'string'
  );
}

function isCardItemData(data: unknown): data is CardItemData {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { code?: unknown }).code === 'string'
  );
}

function pickCardSetName(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const obj = data as { setName?: unknown; cardSet?: unknown };
  if (typeof obj.setName === 'string') return obj.setName;
  if (typeof obj.cardSet === 'string') return obj.cardSet;
  return null;
}

export interface HandleLoadSelectionDeps {
  store: YjsStore;
  /** Async snapshot of the current viewport — see Board.getViewportState. */
  getViewportState: () => Promise<ViewportState>;
}

/**
 * Apply the user's picker selection.
 *
 * Returns once the new content is committed to the store (or the load is
 * abandoned with a logged error). Never throws — failures surface via
 * `console.error` with a stable errorId so the caller can keep the modal
 * close-flow simple.
 */
export async function handleLoadSelection(
  entry: LoadableEntry,
  item: { id: string; label: string; data: unknown } | null,
  deps: HandleLoadSelectionDeps,
): Promise<void> {
  if (entry.mode === 'replace') {
    if (entry.type !== 'scenario') {
      console.warn(
        `[Load] Replace mode is only supported for type "scenario"; "${entry.type}" was ignored`,
      );
      alert(
        `Loading "${entry.label}" in replace mode is not yet supported. ` +
          `Only scenario replace loads are wired right now.`,
      );
      return;
    }
    if (!item) {
      console.warn('[Load] Scenario picker fired with null item');
      return;
    }
    if (!isScenarioItemData(item.data)) {
      console.warn('[Load] Scenario item missing required `file` field', {
        item,
      });
      return;
    }
    await loadScenarioByFile(deps.store, item.data.file);
    return;
  }

  // Additive modes
  if (entry.source.kind === 'provider') {
    console.warn(
      '[Load] Provider-source loadables are not wired in ct-8gf.5; see ct-u6q investigation',
      { entryType: entry.type, module: entry.source.module },
    );
    alert(
      `"${entry.label}" uses an import provider; the runner for this is ` +
        `not implemented yet (tracked in ct-u6q).`,
    );
    return;
  }

  if (!item) {
    console.warn('[Load] Additive picker fired with null item', {
      entryType: entry.type,
    });
    return;
  }

  const gameAssets = deps.store.getGameAssets();
  if (!gameAssets) {
    console.error(
      '[Load] No gameAssets in store; cannot instantiate additive loadable',
      { errorId: LOAD_ADDITIVE_FAILED, entryType: entry.type },
    );
    alert('Cannot load additional content before plugin assets are ready.');
    return;
  }

  let viewport: ViewportState;
  try {
    viewport = await deps.getViewportState();
  } catch (error) {
    console.error('[Load] Failed to read viewport state', {
      errorId: LOAD_ADDITIVE_FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const placement = getViewportCenterPlacement(viewport);

  // Card: stack-of-1
  if (isCardItemData(item.data)) {
    instantiateCardStack(deps.store, [item.data.code], placement, item.label);
    return;
  }

  // Card-set: stack of all cards in the set
  const setName = pickCardSetName(item.data);
  if (setName) {
    const setEntries = gameAssets.cardSets[setName];
    if (!setEntries) {
      console.warn(`[Load] Card set "${setName}" not found in gameAssets`);
      alert(`Card set "${setName}" is not present in this plugin.`);
      return;
    }
    const cardCodes: string[] = [];
    for (const e of setEntries) {
      if (typeof e === 'string') {
        cardCodes.push(e);
      } else {
        const count = e.count ?? 1;
        for (let i = 0; i < count; i++) cardCodes.push(e.code);
      }
    }
    instantiateCardStack(deps.store, cardCodes, placement, setName);
    return;
  }

  console.warn('[Load] Unrecognised additive item shape', {
    entryType: entry.type,
    itemId: item.id,
    data: item.data,
  });
}

/**
 * Materialise a stack of cards at the given world-space position.
 *
 * Uses {@link createObject} directly (no scenario-load detour) so the new
 * stack lands on the table without disturbing existing objects.
 */
function instantiateCardStack(
  store: YjsStore,
  cards: string[],
  pos: { x: number; y: number },
  logLabel: string,
): void {
  if (cards.length === 0) {
    console.warn(`[Load] Skipping empty stack for "${logLabel}"`);
    return;
  }
  const position: Position = { x: pos.x, y: pos.y, r: 0 };
  const id = createObject(store, {
    kind: ObjectKind.Stack,
    pos: position,
    cards,
    faceUp: true,
  });
  console.log(
    `[Load] Added ${String(cards.length)}-card stack "${logLabel}" id=${id} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`,
  );
}

/**
 * Replace-mode scenario load.  Mirrors the (now-removed) `load-scenario`
 * action but parameterised on the scenario filename so the picker can pass
 * the user's choice through.
 */
export async function loadScenarioByFile(
  store: YjsStore,
  scenarioFile: string,
): Promise<void> {
  const pluginId = store.metadata.get('pluginId') as string | undefined;
  if (!pluginId) {
    console.error(
      '[Load Scenario] No pluginId in metadata; cannot load scenario',
      { errorId: ACTION_LOAD_SCENARIO_FAILED, scenarioFile },
    );
    alert('No plugin is bound to this table.');
    return;
  }
  try {
    console.log(
      `[Load Scenario] Loading "${scenarioFile}" for plugin: ${pluginId}`,
    );
    const plugin = await loadPlugin(pluginId);
    let gameAssets: GameAssets | null = store.getGameAssets();
    if (!gameAssets) {
      console.log(
        '[Load Scenario] No gameAssets in store; loading plugin assets',
      );
      gameAssets = await loadPluginAssets(pluginId);
    }
    const content = await loadScenarioFromPlugin(
      pluginId,
      scenarioFile,
      gameAssets,
    );
    console.log(
      `[Load Scenario] Loaded ${String(content.objects.size)} objects from scenario: ${content.scenario.name}`,
    );
    const metadata: LoadedScenarioMetadata = {
      type: 'plugin',
      pluginId,
      scenarioFile,
      loadedAt: Date.now(),
      scenarioName: content.scenario.name,
    };
    loadScenarioContent(
      store,
      content,
      metadata,
      '[Load Scenario]',
      plugin.manifest.componentSets,
      plugin.registry.baseUrl,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Load Scenario] Failed to load scenario', {
      errorId: ACTION_LOAD_SCENARIO_FAILED,
      pluginId,
      scenarioFile,
      error: message,
    });
    alert(`Failed to load scenario: ${message}`);
  }
}

/**
 * Test-only export of the static-item shape so unit tests can build picker
 * payloads without re-creating the cast pyramid.
 */
export type LoadHandlerItem = LoadableStaticItem;
