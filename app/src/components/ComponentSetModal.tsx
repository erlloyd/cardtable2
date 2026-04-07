import { useState, Fragment } from 'react';
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import type {
  ComponentSetEntry,
  GameAssets,
  PluginApiImport,
} from '@cardtable2/shared';
import { isApiComponentSetEntry } from '@cardtable2/shared';
import type { TableObject } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { generateTopSortKey } from '../store/YjsActions';
import { loadStaticComponentSet } from '../content/componentSetLoader';
import { importFromApi } from '../content/DeckImportEngine';
import { getComponentSetEntries } from '../content/componentSetRegistry';

/** Add objects to the store with sort keys above all existing objects */
function addObjectsOnTop(
  store: YjsStore,
  objects: Map<string, TableObject>,
): void {
  // Get starting sort key once, then increment for each object
  const baseSortKey = generateTopSortKey(store);
  const baseNum = parseInt(baseSortKey, 10);
  let offset = 0;

  for (const [id, obj] of objects) {
    obj._sortKey = String(baseNum + offset).padStart(6, '0');
    offset++;
    store.setObject(id, obj);
  }
}

interface ComponentSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: YjsStore;
  gameAssets: GameAssets | null;
}

type LoadingState = 'idle' | 'loading';

export function ComponentSetModal({
  isOpen,
  onClose,
  store,
  gameAssets,
}: ComponentSetModalProps) {
  const entries = getComponentSetEntries();

  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedApiEntry, setSelectedApiEntry] =
    useState<PluginApiImport | null>(null);
  const [deckId, setDeckId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const handleClose = () => {
    setError(null);
    setSelectedApiEntry(null);
    setDeckId('');
    setIsPrivate(false);
    onClose();
  };

  const handleStaticLoad = (entry: ComponentSetEntry) => {
    if (!gameAssets || isApiComponentSetEntry(entry)) return;

    setLoadingState('loading');
    setError(null);

    const result = loadStaticComponentSet({ entry, gameAssets });

    if ('error' in result) {
      setError(result.error);
      setLoadingState('idle');
      return;
    }

    addObjectsOnTop(store, result.objects);

    setLoadingState('idle');
    handleClose();
  };

  const handleApiEntryClick = (apiImport: PluginApiImport) => {
    setSelectedApiEntry(apiImport);
    setError(null);
    setDeckId('');
    setIsPrivate(false);
  };

  const handleApiImport = async () => {
    if (!gameAssets || !selectedApiEntry || !deckId.trim()) return;

    setLoadingState('loading');
    setError(null);

    const result = await importFromApi({
      deckId: deckId.trim(),
      isPrivate,
      apiImport: selectedApiEntry,
      gameAssets,
    });

    if ('error' in result) {
      setError(result.error);
      setLoadingState('idle');
      return;
    }

    addObjectsOnTop(store, result.objects);

    setLoadingState('idle');
    handleClose();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="cs-modal-dialog" onClose={handleClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="cs-modal-backdrop" />
        </TransitionChild>

        {/* Dialog panel */}
        <div className="cs-modal-container">
          <div className="cs-modal-wrapper">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="cs-modal-panel">
                <div className="cs-modal-title">Load Components</div>

                {error && <div className="cs-modal-error">{error}</div>}

                {selectedApiEntry ? (
                  <div className="cs-modal-space-y-3">
                    <button
                      onClick={() => setSelectedApiEntry(null)}
                      className="cs-modal-back"
                    >
                      &larr; Back to list
                    </button>

                    <div>
                      <label className="cs-modal-label">
                        {selectedApiEntry.labels.siteName} Deck ID
                      </label>
                      <input
                        type="text"
                        value={deckId}
                        onChange={(e) => setDeckId(e.target.value)}
                        placeholder={selectedApiEntry.labels.inputPlaceholder}
                        className="cs-modal-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && deckId.trim()) {
                            void handleApiImport();
                          }
                        }}
                      />
                    </div>

                    {selectedApiEntry.apiEndpoints.private && (
                      <label className="cs-modal-checkbox-label">
                        <input
                          type="checkbox"
                          checked={isPrivate}
                          onChange={(e) => setIsPrivate(e.target.checked)}
                        />
                        Use private deck ID
                      </label>
                    )}

                    <button
                      onClick={() => void handleApiImport()}
                      disabled={!deckId.trim() || loadingState === 'loading'}
                      className="cs-modal-submit"
                    >
                      {loadingState === 'loading'
                        ? 'Importing...'
                        : 'Import Deck'}
                    </button>
                  </div>
                ) : (
                  <div className="cs-modal-space-y">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => {
                          if (isApiComponentSetEntry(entry)) {
                            handleApiEntryClick(entry.apiImport);
                          } else {
                            void handleStaticLoad(entry);
                          }
                        }}
                        disabled={loadingState === 'loading'}
                        className="cs-modal-entry"
                      >
                        <div className="cs-modal-entry-name">{entry.name}</div>
                        <div className="cs-modal-entry-desc">
                          {isApiComponentSetEntry(entry)
                            ? `Import from ${entry.apiImport.labels.siteName}`
                            : 'Load preset'}
                        </div>
                      </button>
                    ))}

                    {entries.length === 0 && (
                      <p className="cs-modal-empty">
                        No component sets available
                      </p>
                    )}
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
