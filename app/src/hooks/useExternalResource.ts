import { useEffect, useState, useSyncExternalStore } from 'react';

interface Holder<T> {
  subscribe: (listener: () => void) => () => void;
  get: () => T | null;
  set: (value: T | null) => void;
}

function createHolder<T>(): Holder<T> {
  let current: T | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => current,
    set: (value) => {
      current = value;
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Create an external resource (worker, store, connection) in an effect and
 * expose it to render. Returns null until created and again after cleanup.
 *
 * `create` must be referentially stable per resource identity (wrap in
 * useCallback); a new `create` disposes the old resource and builds a new one.
 */
export function useExternalResource<T>(
  create: () => { value: T; dispose: () => void },
): T | null {
  const [holder] = useState(() => createHolder<T>());

  useEffect(() => {
    const { value, dispose } = create();
    holder.set(value);
    return () => {
      dispose();
      holder.set(null);
    };
  }, [create, holder]);

  return useSyncExternalStore(holder.subscribe, holder.get);
}
