import { useCallback, useEffect, useRef, useState } from 'react';
import { reconcileById, useRealtimePolling } from '@/hooks/useRealtimePolling';
import { api } from '@/lib/api';
import type { TreeListItem } from '@/types/domain';
import { treeFiltersToQuery, type TreeFilters } from './treeFilters';

interface UseTreesOptions {
  /** Ciche odświeżanie w tle co `REALTIME_POLL_MS` (kolory markerów bez ruszania zoomu/przesunięcia mapy). */
  live?: boolean;
}

/** Trees for the map; with `filters` the filtering happens on the server (GET /api/trees?...). */
export function useTrees(filters?: TreeFilters, { live = false }: UseTreesOptions = {}) {
  const query = filters ? treeFiltersToQuery(filters) : '';
  const [trees, setTrees] = useState<TreeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const latestRequest = useRef(0);

  const fetchTrees = useCallback(
    async (silent: boolean) => {
      const requestId = ++latestRequest.current;
      if (!silent) setLoading(true);
      try {
        const result = await api.get<TreeListItem[]>(`/api/trees${query}`);
        if (requestId !== latestRequest.current) return;
        setTrees((prev) => reconcileById(prev, result));
        setError(null);
      } catch (e) {
        if (requestId !== latestRequest.current) return;
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać roślin.');
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [query],
  );

  const reload = useCallback(() => fetchTrees(false), [fetchTrees]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtimePolling(() => fetchTrees(true), { enabled: live });

  return { trees, loading, error, reload };
}
