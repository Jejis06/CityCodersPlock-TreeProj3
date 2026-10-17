import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { QueueTask } from './types';

export const QUEUE_POLL_MS = 3000;

/** Kolejka zadań `pending_approval` odświeżana pollingiem (test MUTEX na dwóch kartach). */
export function useApprovalQueue() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<QueueTask[]>('/api/tasks?status=pending_approval');
      if (!mounted.current) return;
      setTasks([...data].sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? '')));
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
    const timer = window.setInterval(() => void refresh(), QUEUE_POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { tasks, loading, error, refresh };
}
