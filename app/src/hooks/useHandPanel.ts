import { useEffect, useState } from 'react';
import type { YjsStore } from '../store/YjsStore';

/**
 * Manages hand panel state: active hand, collapse state, and hand list.
 * Subscribes to store.onHandsChange() for reactive updates.
 */
export function useHandPanel(store: YjsStore | null) {
  const [activeHandId, setActiveHandId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [handIds, setHandIds] = useState<string[]>([]);

  useEffect(() => {
    if (!store) return;

    const refresh = () => {
      const ids = store.getHandIds();
      setHandIds(ids);

      setActiveHandId((prev) => {
        // Auto-select first hand if active hand was deleted
        if (prev && !ids.includes(prev)) {
          return ids[0] ?? null;
        }
        // Auto-select first hand if none active
        if (!prev && ids.length > 0) {
          return ids[0];
        }
        return prev;
      });
    };

    refresh();
    return store.onHandsChange(refresh);
  }, [store]);

  return {
    activeHandId,
    setActiveHandId,
    isCollapsed,
    setIsCollapsed,
    handIds,
  };
}
