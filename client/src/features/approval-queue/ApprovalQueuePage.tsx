import { ClipboardCheck, Lock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { EmptyState, ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { PlantBadge, TaskCategoryChip } from '@/components/shared/PlantBadge';
import { speciesLabel } from '@/types/domain';
import { ReviewDialog } from './ReviewDialog';
import type { QueueTask } from './types';
import { QUEUE_POLL_MS, useApprovalQueue } from './useApprovalQueue';

const LOCK_TIMEOUT_MS = 5 * 60_000;

/** Blokada innego urzędnika, która jeszcze nie wygasła (serwer jest źródłem prawdy). */
function lockedByOther(task: QueueTask, myId: string): boolean {
  if (!task.locked_by || task.locked_by === myId || !task.locked_at) return false;
  return Date.now() - new Date(task.locked_at).getTime() < LOCK_TIMEOUT_MS;
}

export function ApprovalQueuePage() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tasks, loading, error, refresh } = useApprovalQueue();
  const [reviewing, setReviewing] = useState<QueueTask | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const open = useCallback(
    async (task: QueueTask) => {
      setActionError(null);
      try {
        const locked = await api.post<QueueTask>(`/api/tasks/${task.id}/lock`);
        setReviewing({ ...task, ...locked });
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Nie udało się zablokować zadania.');
        void refresh();
      }
    },
    [refresh],
  );

  const targetTaskId = searchParams.get('taskId');
  useEffect(() => {
    if (!targetTaskId || loading || reviewing) return;
    const match = tasks.find((t) => t.id === targetTaskId);
    if (!match) return;
    setSearchParams({}, { replace: true });
    void open(match);
  }, [loading, open, reviewing, setSearchParams, targetTaskId, tasks]);

  const closeReview = () => {
    setReviewing(null);
    void refresh();
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kolejka zatwierdzeń</h1>
          <p className="mt-1 text-slate-500">Zadania wykonane przez wykonawcę, czekające na decyzję urzędnika.</p>
        </div>
        <div className="text-right" aria-live="polite">
          <div className="text-3xl font-bold text-amber-600">{tasks.length}</div>
          <div className="text-xs text-slate-500">oczekujących · odświeżanie co {QUEUE_POLL_MS / 1000} s</div>
        </div>
      </div>

      {(error || actionError) && <ErrorMessage className="mt-4">{actionError ?? error}</ErrorMessage>}

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={<ClipboardCheck />} title="Brak zadań do zatwierdzenia" />
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {tasks.map((task) => {
            const blocked = user ? lockedByOther(task, user.id) : false;
            return (
              <li key={task.id}>
                <Card
                  className={cn(
                    'flex items-center justify-between gap-4 p-4',
                    blocked && 'border-red-200 bg-slate-100 opacity-70',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlantBadge type={task.tree_type} code={task.tree_code} />
                      <TaskCategoryChip category={task.category} subcategory={task.subcategory} />
                    </div>
                    <p className="mt-1.5 font-semibold">
                      {speciesLabel(task.species_polish_name, task.species_cultivar)}
                      <span className="ml-1.5 text-sm font-normal italic text-slate-500">{task.species_latin_name}</span>
                    </p>
                    <p className="text-sm text-slate-600">Zgłoszono {formatDateTime(task.completed_at)}</p>
                    {task.contractor_comment && (
                      <p className="mt-1 truncate text-sm text-slate-500">„{task.contractor_comment}”</p>
                    )}
                  </div>
                  {blocked ? (
                    <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-red-600">
                      <Lock className="size-5" />
                      W trakcie weryfikacji przez: {task.locked_by_name ?? 'inny urzędnik'}
                    </div>
                  ) : (
                    <Button onClick={() => void open(task)}>Rozpatrz</Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {reviewing && <ReviewDialog task={reviewing} onClose={closeReview} />}
    </div>
  );
}
