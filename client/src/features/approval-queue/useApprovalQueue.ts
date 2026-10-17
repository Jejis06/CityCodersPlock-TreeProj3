import { useCallback, useEffect, useRef, useState } from 'react';
import { REALTIME_POLL_MS, reconcileById, useRealtimePolling } from '@/hooks/useRealtimePolling';
import { api } from '@/lib/api';
import { compareTasksNewestFirst } from '@/lib/utils';
import type { QueueTask } from './types';

export const QUEUE_POLL_MS = REALTIME_POLL_MS;

/** Kolejka zadań `pending_approval` (najnowsze zgłoszenia na górze) odświeżana pollingiem (test MUTEX na dwóch kartach). */
export function useApprovalQueue() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<QueueTask[]>('/api/tasks?status=pending_approval');
      if (!mounted.current) return;
      setTasks((prev) => reconcileById(prev, [...data].sort(compareTasksNewestFirst)));
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Nie udało się pobrać kolejki.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useRealtimePolling(refresh, { intervalMs: QUEUE_POLL_MS });

  return { tasks, loading, error, refresh };
}
