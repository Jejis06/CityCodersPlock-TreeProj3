import { AlertTriangle, CheckCircle2, Clock, Hammer, MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/Feedback';
import { cn, formatDateTime } from '@/lib/utils';
import { speciesLabel, TASK_CATEGORY_LABELS, TASK_SUBCATEGORY_LABELS } from '@/types/domain';
import type { ContractorTask } from './types';

interface TaskListProps {
  tasks: ContractorTask[];
  mode: 'todo' | 'done';
  selectedTaskId: string | null;
  onSelect: (task: ContractorTask) => void;
  onExecute: (task: ContractorTask) => void;
}

export function TaskList({ tasks, mode, selectedTaskId, onSelect, onExecute }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={mode === 'todo' ? <Hammer /> : <CheckCircle2 />}
        title={mode === 'todo' ? 'Brak zadań do wykonania' : 'Brak wykonanych zadań'}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const rejected = task.status === 'rejected';
        return (
          <li key={task.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(task)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(task)}
              className={cn(
                'cursor-pointer rounded-xl bg-white p-4 shadow-sm ring-1 transition',
                rejected ? 'ring-2 ring-red-400' : 'ring-slate-200',
                selectedTaskId === task.id && 'ring-2 ring-emerald-600',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xl font-bold">{task.tree_code}</p>
                <Badge variant={task.status === 'approved' ? 'default' : task.status === 'pending_approval' ? 'warning' : rejected ? 'destructive' : 'secondary'}>
                  {task.status === 'approved' ? 'Zatwierdzone' : task.status === 'pending_approval' ? 'W weryfikacji' : rejected ? 'Odrzucone' : 'Do wykonania'}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{speciesLabel(task.species_polish_name, task.species_cultivar)}</p>
              <p className="mt-1 text-base font-semibold text-emerald-800">
                {TASK_CATEGORY_LABELS[task.category]}: {TASK_SUBCATEGORY_LABELS[task.subcategory]}
              </p>
              {task.tree_address && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="size-3" /> {task.tree_address}
                </p>
              )}

              {rejected && (
                <div role="alert" className="mt-3 flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Odrzucone przez urzędnika</p>
                    <p>{task.official_rejection_reason ?? 'Brak podanego powodu.'}</p>
                  </div>
                </div>
              )}

              {mode === 'done' && task.completed_at && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="size-3" /> Zgłoszono: {formatDateTime(task.completed_at)}
                </p>
              )}

              {mode === 'todo' && (
                <Button
                  size="touch"
                  className="mt-3 w-full"
                  variant={rejected ? 'destructive' : 'default'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute(task);
                  }}
                >
                  <Hammer />
                  {rejected ? 'Popraw i wykonaj ponownie' : 'Wykonaj pracę'}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
