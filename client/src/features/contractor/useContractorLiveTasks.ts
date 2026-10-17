import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TreeListItem } from '@/types/domain';
import type { ContractorTask } from './types';
import { useContractorMapFilter, type ContractorTab } from './useContractorMapFilter';

/** Live-sync interval for the contractor view (also used by `/ipad`). */
export const CONTRACTOR_POLL_INTERVAL_MS = 2000;

/**
 * Timestamp deciding the position of a task in its tab (newest first):
 * - `assigned` / `rejected` ("Do wykonania"): `reviewed_at` (returned for correction) else `created_at`,
 * - `pending_approval` / `approved` ("Wykonane"): `completed_at` else `created_at`.
 * ISO 8601 UTC strings compare correctly as text, but we compare as numbers to be safe.
 */
export function taskSortTime(task: ContractorTask): number {
  const iso =
    task.status === 'pending_approval' || task.status === 'approved'
      ? (task.completed_at ?? task.created_at)
      : task.status === 'rejected'
        ? (task.reviewed_at ?? task.created_at)
        : task.created_at;
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** Newest first (DESC); ties keep a deterministic order via id. */
export function sortTasksNewestFirst(tasks: ContractorTask[]): ContractorTask[] {
  return [...tasks].sort((a, b) => taskSortTime(b) - taskSortTime(a) || b.id.localeCompare(a.id));
}

interface LiveTasksInput {
  userId: string | null | undefined;
  tab: ContractorTab;
  intervalMs?: number;
}

/**
 * Contractor data source: polls `GET /api/tasks` + `GET /api/trees` every 2 s in the background
 * (no spinner, state only changes when the payload really changed, so open modals/map are untouched),
 * sorts tasks newest-first and applies the per-tab isolation of `useContractorMapFilter`.
 */
export function useContractorLiveTasks({ userId, tab, intervalMs = CONTRACTOR_POLL_INTERVAL_MS }: LiveTasksInput) {
  const [tasks, setTasks] = useState<ContractorTask[]>([]);
  const [trees, setTrees] = useState<TreeListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const lastPayload = useRef('');
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [nextTasks, nextTrees] = await Promise.all([
        api.get<ContractorTask[]>('/api/tasks'),
        api.get<TreeListItem[]>('/api/trees'),
      ]);
      if (!mounted.current) return;
      const payload = JSON.stringify([nextTasks, nextTrees]);
      if (payload !== lastPayload.current) {
        lastPayload.current = payload;
        setTasks(nextTasks);
        setTrees(nextTrees);
      }
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const timer = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, intervalMs]);

  const sortedTasks = useMemo(() => sortTasksNewestFirst(tasks), [tasks]);
  const view = useContractorMapFilter({ tasks: sortedTasks, trees, userId, tab });

  return { ...view, error, loaded, reload };
}
