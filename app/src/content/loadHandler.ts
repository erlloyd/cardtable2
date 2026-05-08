/**
 * Selection-handler logic for the generic Load... picker (ct-8gf.5).
 *
 * Centralises the bridge between the picker UI and the host's load primitives:
 *
 *   - replace + scenario      -> existing scenario load flow
 *   - additive + card         -> instantiate stack-of-1 at viewport center + jitter
 *   - additive + card-set     -> instantiate stack-of-N (one card per set entry)
 *                                at viewport center + jitter
 *   - additive + provider     -> open the host's deck-import modal; on submit
 *                                run `importFromApi` and drop the parsed objects
 *                                at viewport center + jitter.
 *
 * All inputs come from `LoadPickerModal` (`onSelectItem`) and the table route
 * (`store`, `getViewportState`). Pure async functions: no React state, no
 * direct PixiJS access — viewport state is supplied by the caller via the
 * Promise the BoardHandle exposes; deck-input is collected via the
 * `deckInputProvider` the route registers (the route mounts the
 * `DeckImportModal` and resolves the promise on submit / cancel).
 */

import {
  ObjectKind,
  type GameAssets,
  type LoadableEntry,
  type LoadableProviderLabels,
  type LoadableProviderSource,
  type LoadableStaticItem,
  type Position,
  type TableObject,
} from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { createObject, generateTopSortKey } from '../store/YjsActions';
import {
  loadPlugin,
  loadPluginAssets,
  loadScenarioFromPlugin,
  type LoadedScenarioMetadata,
} from './index';
import { loadScenarioContent } from './loadScenarioHelper';
import { importFromApi } from './DeckImportEngine';
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

/**
 * Async input collector for provider-source loadables.
 *
 * The default implementation returns null (no UI), so callers MUST register
 * their own provider via `setDeckInputProvider` before driving the provider
 * branch — the table routes do this at mount time, supplying a callback that
 * opens the `DeckImportModal` and resolves the promise on submit/cancel.
 *
 * Resolving with `null` aborts the import; a non-null value supplies the deck
 * id (and the optional `isPrivate` flag).
 */
export interface DeckInputResult {
  deckId: string;
  isPrivate: boolean;
}

export type DeckInputProvider = (params: {
  source: LoadableProviderSource;
  labels: LoadableProviderLabels;
  supportsPrivate: boolean;
  entry: LoadableEntry;
}) => Promise<DeckInputResult | null>;

let deckInputProvider: DeckInputProvider = () => Promise.resolve(null);

/**
 * Override the deck-input collector. Returns the previous provider so callers
 * (tests + route teardown) can restore it. The default returns `null`, which
 * aborts the provider branch — the table route registers its modal-driven
 * implementation at mount time.
 */
export function setDeckInputProvider(
  next: DeckInputProvider,
): DeckInputProvider {
  const previous = deckInputProvider;
  deckInputProvider = next;
  return previous;
}

export interface HandleLoadSelectionDeps {
  store: YjsStore;
  /** Async snapshot of the current viewport — see Board.getViewportState. */
  getViewportState: () => Promise<ViewportState>;
}

/**
 * Read a {@link LoadableProviderSource}'s declared labels, returning `null`
 * when required fields are missing (caller should surface a friendly error).
 */
export function readProviderLabels(
  source: LoadableProviderSource,
): LoadableProviderLabels | null {
  const labels = source.config?.labels;
  if (!labels || !labels.siteName || !labels.inputPlaceholder) {
    return null;
  }
  return labels;
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
    await runProviderLoadable(entry, entry.source, deps);
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
 * Provider-source path: drive the existing API import runner from a
 * `LoadableProviderSource` declaration.
 *
 * Flow:
 *   1. validate provider config (apiEndpoints + labels)
 *   2. ask the host for the user's input (deck ID + optional private flag)
 *      via the configurable provider-input collector — the route registers a
 *      modal-driven implementation at mount.
 *   3. run `importFromApi` (fetch → worker parse → resolve → instantiate)
 *   4. translate the engine's positions onto the live table at viewport
 *      center + jitter, generating fresh top sort keys
 *
 * Failure cases surface via `alert` with stable errorIds; we never throw.
 */
async function runProviderLoadable(
  entry: LoadableEntry,
  source: LoadableProviderSource,
  deps: HandleLoadSelectionDeps,
): Promise<void> {
  const labels = readProviderLabels(source);
  const endpoints = source.config?.apiEndpoints;
  if (!labels || !endpoints || !endpoints.public) {
    console.error(
      '[Load] Provider source missing required apiEndpoints/labels config',
      {
        errorId: LOAD_ADDITIVE_FAILED,
        entryType: entry.type,
        module: source.module,
      },
    );
    alert(
      `"${entry.label}" provider config is missing apiEndpoints or labels.`,
    );
    return;
  }

  const gameAssets = deps.store.getGameAssets();
  if (!gameAssets) {
    console.error(
      '[Load] No gameAssets in store; cannot run provider loadable',
      { errorId: LOAD_ADDITIVE_FAILED, entryType: entry.type },
    );
    alert('Cannot import a deck before plugin assets are ready.');
    return;
  }

  let input: DeckInputResult | null;
  try {
    input = await deckInputProvider({
      source,
      labels,
      supportsPrivate: typeof endpoints.private === 'string',
      entry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Load] Deck input collector failed', {
      errorId: LOAD_ADDITIVE_FAILED,
      entryType: entry.type,
      error: message,
    });
    alert(`Failed to collect deck input: ${message}`);
    return;
  }

  if (input === null || input.deckId.trim() === '') {
    console.log('[Load] Provider import cancelled — no deck ID provided');
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

  const result = await importFromApi({
    deckId: input.deckId.trim(),
    isPrivate: input.isPrivate,
    source,
    gameAssets,
  });

  if ('error' in result) {
    console.error('[Load] Provider import failed', {
      errorId: LOAD_ADDITIVE_FAILED,
      entryType: entry.type,
      deckId: input.deckId,
      error: result.error,
    });
    alert(`Failed to import deck: ${result.error}`);
    return;
  }

  // Drop the parsed objects on the table at viewport-center + jitter.
  // The engine returns positions relative to (0, 0); shift them so the
  // first stack lands at the picked placement origin and assign sort keys
  // above all existing objects so the new content stays on top.
  addObjectsAt(deps.store, result.objects, placement);

  console.log(
    `[Load] Provider import complete: ${String(result.objectCount)} objects from deck ${input.deckId}`,
  );
}

/**
 * Place a batch of pre-instantiated objects on the table.
 *
 * Translates the engine's local layout origin to the supplied world-space
 * position and assigns top-of-stack sort keys so newly imported objects sit
 * above whatever's already on the table.
 */
function addObjectsAt(
  store: YjsStore,
  objects: Map<string, TableObject>,
  origin: { x: number; y: number },
): void {
  const baseSortKey = generateTopSortKey(store);
  const baseNum = parseInt(baseSortKey, 10);
  let offset = 0;

  for (const [id, obj] of objects) {
    const next: TableObject = {
      ...obj,
      _pos: {
        x: obj._pos.x + origin.x,
        y: obj._pos.y + origin.y,
        r: obj._pos.r,
      },
      _sortKey: String(baseNum + offset).padStart(6, '0'),
    };
    offset++;
    store.setObject(id, next);
  }
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
    // ct-5ee: replace-mode contract — clear existing table objects before the
    // new scenario is added, otherwise reloading the same scenario doubles the
    // object count. Done after the plugin/scenario fetch succeeds so a failed
    // load doesn't wipe the table. `loadScenarioContent` resets `loadedScenario`
    // metadata immediately afterward.
    store.clearAllObjects();
    loadScenarioContent(
      store,
      content,
      metadata,
      '[Load Scenario]',
      plugin.registry.baseUrl,
      undefined,
      plugin.manifest.loadables,
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
