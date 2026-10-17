import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TreeListItem } from '@/types/domain';
import { treeFiltersToQuery, type TreeFilters } from './treeFilters';

/** Trees for the map; with `filters` the filtering happens on the server (GET /api/trees?...). */
export function useTrees(filters?: TreeFilters) {
  const query = filters ? treeFiltersToQuery(filters) : '';
  const [trees, setTrees] = useState<TreeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const result = await api.get<TreeListItem[]>(`/api/trees${query}`);
      if (requestId !== latestRequest.current) return;
      setTrees(result);
      setError(null);
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać roślin.');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { trees, loading, error, reload };
}
