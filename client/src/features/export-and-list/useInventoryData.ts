import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTrees } from '@/features/map/useTrees';
import { api } from '@/lib/api';
import { toListTrees, type InventoryTask, type ListTree } from './inventoryModel';

/**
 * Whole inventory for the list view: GET /api/trees (no server filters — the table filters instantly on the client)
 * + GET /api/tasks (task descriptions are scanned for administrative decisions).
 */
export function useInventoryData() {
  const treesQuery = useTrees();
  const [tasks, setTasks] = useState<InventoryTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.get<InventoryTask[]>('/api/tasks'));
      setTasksError(null);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const trees: ListTree[] = useMemo(() => toListTrees(treesQuery.trees, tasks), [treesQuery.trees, tasks]);

  const reloadTrees = treesQuery.reload;
  const reload = useCallback(async () => {
    await Promise.all([reloadTrees(), loadTasks()]);
  }, [reloadTrees, loadTasks]);

  return { trees, loading: treesQuery.loading, error: treesQuery.error ?? tasksError, reload };
}
