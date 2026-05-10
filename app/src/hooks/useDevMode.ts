import { useCallback, useState } from 'react';

/**
 * localStorage key under which the persisted dev-mode flag is stored.
 *
 * Exported so tests (and any future callers that need to seed/clear
 * the value) can reference the same key without duplicating the string.
 */
export const DEV_MODE_STORAGE_KEY = 'cardtable2:dev-mode';

interface UseDevModeReturn {
  /** Whether dev-mode is currently enabled (persisted across reloads). */
  enabled: boolean;
  /**
   * Persist dev-mode = true and update local state. Idempotent — calling
   * after dev-mode is already enabled is a no-op.
   *
   * v1 has no `disable()` by design (per ct-824); turning it off requires
   * clearing localStorage manually. We can revisit if a UX need arises.
   */
  enable: () => void;
}

const readPersisted = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === 'true';
  } catch {
    // Reading localStorage can throw in restrictive environments
    // (e.g. Safari private mode, sandboxed iframes). Fall back to off.
    return false;
  }
};

/**
 * Persisted "dev-mode" toggle. Currently consumed by the home screen
 * (`app/src/routes/index.tsx`) to gate the "Load from local directory…"
 * button in production builds — see ct-824. The Konami listener calls
 * `enable()` when fired; reads on mount restore prior state across reloads.
 */
export function useDevMode(): UseDevModeReturn {
  const [enabled, setEnabled] = useState<boolean>(readPersisted);

  const enable = useCallback(() => {
    try {
      window.localStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
    } catch {
      // Persistence failure is non-fatal — still flip the in-memory flag
      // so the UI reveals for this session.
    }
    setEnabled(true);
  }, []);

  return { enabled, enable };
}
