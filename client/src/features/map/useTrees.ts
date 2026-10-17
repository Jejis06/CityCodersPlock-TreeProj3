import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TreeListItem } from '@/types/domain';

export function useTrees() {
  const [trees, setTrees] = useState<TreeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTrees(await api.get<TreeListItem[]>('/api/trees'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać roślin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { trees, loading, error, reload };
}
