import { useCallback, useEffect, useRef, useState } from 'react';
import { keepIfEqual, useRealtimePolling } from '@/hooks/useRealtimePolling';
import { api } from '@/lib/api';
import type { TreeDetails } from '@/types/domain';

/**
 * Karta rośliny z historią prac (GET /api/trees/:id); `null` = brak wybranej rośliny.
 * Otwarta karta odświeża się cicho w tle (nowe zgłoszenia wykonawcy, zmiana statusu) bez spinnera.
 */
export function useTreeDetails(treeId: string | null) {
  const [details, setDetailsState] = useState<TreeDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const fetchDetails = useCallback(
    async (silent: boolean) => {
      const requestId = ++latestRequest.current;
      if (!treeId) {
        setDetailsState(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const result = await api.get<TreeDetails>(`/api/trees/${encodeURIComponent(treeId)}`);
        if (requestId !== latestRequest.current) return;
        setDetailsState((prev) => keepIfEqual(prev, result));
        setError(null);
      } catch (e) {
        if (requestId !== latestRequest.current) return;
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać karty rośliny.');
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [treeId],
  );

  const reload = useCallback(() => fetchDetails(false), [fetchDetails]);

  /** Wynik mutacji (PATCH/POST) wygrywa z żądaniem pollingu, które wystartowało przed nią. */
  const setDetails = useCallback((next: TreeDetails | null) => {
    latestRequest.current++;
    setDetailsState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    setDetailsState((prev) => (prev?.id === treeId ? prev : null));
    void reload();
  }, [reload, treeId]);

  useRealtimePolling(() => fetchDetails(true), { enabled: treeId !== null });

  return { details, setDetails, loading, error, reload };
}
