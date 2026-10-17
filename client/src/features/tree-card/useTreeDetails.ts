import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TreeDetails } from '@/types/domain';

/** Karta rośliny z historią prac (GET /api/trees/:id); `null` = brak wybranej rośliny. */
export function useTreeDetails(treeId: string | null) {
  const [details, setDetails] = useState<TreeDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;
    if (!treeId) {
      setDetails(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.get<TreeDetails>(`/api/trees/${encodeURIComponent(treeId)}`);
      if (requestId !== latestRequest.current) return;
      setDetails(result);
      setError(null);
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać karty rośliny.');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    setDetails((prev) => (prev?.id === treeId ? prev : null));
    void reload();
  }, [reload, treeId]);

  return { details, setDetails, loading, error, reload };
}
