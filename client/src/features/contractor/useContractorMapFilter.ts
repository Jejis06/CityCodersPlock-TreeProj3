import { useMemo } from 'react';
import type { TaskStatus, TreeListItem } from '@/types/domain';
import type { ContractorTask } from './types';

export type ContractorTab = 'todo' | 'done';

export const TAB_STATUSES: Record<ContractorTab, readonly TaskStatus[]> = {
  todo: ['assigned', 'rejected'],
  done: ['pending_approval', 'approved'],
};

/**
 * `status` — markery w kolorze statusu rośliny (TreeMap),
 * `completed` — jednolity stalowo-morski marker z ✓ (CompletedTreeMarker).
 */
export type ContractorMarkerVariant = 'status' | 'completed';

interface ContractorMapFilterInput {
  tasks: ContractorTask[];
  trees: TreeListItem[];
  userId: string | null | undefined;
  tab: ContractorTab;
}

/**
 * Izolacja danych wykonawcy: lista i mapa pokazują wyłącznie rośliny z zadań przypisanych
 * do bieżącego użytkownika, zawężone do statusów aktywnego taba.
 */
export function useContractorMapFilter({ tasks, trees, userId, tab }: ContractorMapFilterInput) {
  return useMemo(() => {
    const own = userId ? tasks.filter((t) => t.assigned_to === userId) : [];
    const byTab = (which: ContractorTab) => own.filter((t) => TAB_STATUSES[which].includes(t.status));

    const todoTasks = byTab('todo');
    const doneTasks = byTab('done');
    const tabTasks = tab === 'todo' ? todoTasks : doneTasks;

    const tasksByTree = new Map<string, ContractorTask[]>();
    for (const task of tabTasks) {
      const list = tasksByTree.get(task.tree_id);
      if (list) list.push(task);
      else tasksByTree.set(task.tree_id, [task]);
    }

    return {
      todoTasks,
      doneTasks,
      tabTasks,
      mapTrees: trees.filter((tree) => tasksByTree.has(tree.id)),
      markerVariant: (tab === 'todo' ? 'status' : 'completed') as ContractorMarkerVariant,
      /** Pierwsze zadanie z aktywnego taba dla danej rośliny (klik w marker → wybór zadania). */
      taskForTree: (treeId: string): ContractorTask | null => tasksByTree.get(treeId)?.[0] ?? null,
    };
  }, [tasks, trees, userId, tab]);
}
