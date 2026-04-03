import { useState, Fragment } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import type {
  ComponentSetEntry,
  GameAssets,
  PluginApiImport,
} from '@cardtable2/shared';
import { isApiComponentSetEntry } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { loadStaticComponentSet } from '../content/componentSetLoader';
import { importFromApi } from '../content/DeckImportEngine';

interface ComponentSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ComponentSetEntry[];
  pluginBaseUrl: string;
  store: YjsStore;
  gameAssets: GameAssets | null;
}

type LoadingState = 'idle' | 'loading';

export function ComponentSetModal({
  isOpen,
  onClose,
  entries,
  pluginBaseUrl,
  store,
  gameAssets,
}: ComponentSetModalProps) {
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

    // Add objects to store
    for (const [id, obj] of result.objects) {
      store.setObject(id, obj);
    }

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
      pluginBaseUrl,
      gameAssets,
    });

    if ('error' in result) {
      setError(result.error);
      setLoadingState('idle');
      return;
    }

    // Add objects to store
    for (const [id, obj] of result.objects) {
      store.setObject(id, obj);
    }

    setLoadingState('idle');
    handleClose();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={handleClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-start justify-center pt-[20vh]">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-2xl border border-gray-700">
              <DialogTitle className="text-lg font-medium text-white mb-4">
                Load Components
              </DialogTitle>

              {error && (
                <div className="mb-4 rounded-lg bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {selectedApiEntry ? (
                <div>
                  <button
                    onClick={() => setSelectedApiEntry(null)}
                    className="text-sm text-gray-400 hover:text-white mb-3 flex items-center gap-1"
                  >
                    ← Back to list
                  </button>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">
                        {selectedApiEntry.labels.siteName} Deck ID
                      </label>
                      <input
                        type="text"
                        value={deckId}
                        onChange={(e) => setDeckId(e.target.value)}
                        placeholder={selectedApiEntry.labels.inputPlaceholder}
                        className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && deckId.trim()) {
                            void handleApiImport();
                          }
                        }}
                      />
                    </div>

                    {selectedApiEntry.apiEndpoints.private && (
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={isPrivate}
                          onChange={(e) => setIsPrivate(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-800"
                        />
                        Use private deck ID
                      </label>
                    )}

                    <button
                      onClick={() => void handleApiImport()}
                      disabled={!deckId.trim() || loadingState === 'loading'}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingState === 'loading'
                        ? 'Importing...'
                        : 'Import Deck'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
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
                      className="w-full text-left rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-3 transition-colors disabled:opacity-50"
                    >
                      <div className="text-white font-medium">{entry.name}</div>
                      <div className="text-sm text-gray-400">
                        {isApiComponentSetEntry(entry)
                          ? `Import from ${entry.apiImport.labels.siteName}`
                          : 'Load preset'}
                      </div>
                    </button>
                  ))}

                  {entries.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">
                      No component sets available
                    </p>
                  )}
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
