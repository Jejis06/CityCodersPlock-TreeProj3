import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTrees } from '@/features/map/useTrees';
import { keepIfEqual, useRealtimePolling } from '@/hooks/useRealtimePolling';
import { api } from '@/lib/api';
import { toListTrees, type InventoryTask, type ListTree } from './inventoryModel';

/**
 * Whole inventory for the list view: GET /api/trees (no server filters — the table filters instantly on the client)
 * + GET /api/tasks (task descriptions are scanned for administrative decisions). Both refresh silently in the background.
 */
export function useInventoryData() {
  const treesQuery = useTrees(undefined, { live: true });
  const [tasks, setTasks] = useState<InventoryTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const result = await api.get<InventoryTask[]>('/api/tasks');
      setTasks((prev) => keepIfEqual(prev, result));
      setTasksError(null);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useRealtimePolling(loadTasks);

  const trees: ListTree[] = useMemo(() => toListTrees(treesQuery.trees, tasks), [treesQuery.trees, tasks]);

  const reloadTrees = treesQuery.reload;
  const reload = useCallback(async () => {
    await Promise.all([reloadTrees(), loadTasks()]);
  }, [reloadTrees, loadTasks]);

  return { trees, loading: treesQuery.loading, error: treesQuery.error ?? tasksError, reload };
}
