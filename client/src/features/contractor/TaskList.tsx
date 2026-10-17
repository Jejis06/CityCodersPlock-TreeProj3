import { CheckCircle2, Clock, Hammer, MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/Feedback';
import { PlantIdentity, TaskCategoryChip } from '@/components/shared/PlantBadge';
import { cn, formatDateTime } from '@/lib/utils';
import { RejectionFeedbackBox } from './RejectionFeedbackBox';
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
                rejected ? 'ring-amber-300' : 'ring-slate-200',
                selectedTaskId === task.id && 'ring-2 ring-emerald-600',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <PlantIdentity
                  type={task.tree_type}
                  code={task.tree_code}
                  speciesPolishName={task.species_polish_name}
                  speciesCultivar={task.species_cultivar}
                />
                <Badge className="shrink-0" variant={task.status === 'approved' ? 'default' : task.status === 'pending_approval' ? 'warning' : rejected ? 'warning' : 'secondary'}>
                  {task.status === 'approved' ? 'Zatwierdzone' : task.status === 'pending_approval' ? 'W weryfikacji' : rejected ? 'Do poprawy' : 'Do wykonania'}
                </Badge>
              </div>
              <TaskCategoryChip className="mt-2" category={task.category} subcategory={task.subcategory} />
              {task.tree_address && !rejected && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="size-3" /> {task.tree_address}
                </p>
              )}

              {rejected && <RejectionFeedbackBox className="mt-3" task={task} onShowOnMap={onSelect} />}

              {mode === 'done' && task.completed_at && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="size-3" /> Zgłoszono: {formatDateTime(task.completed_at)}
                </p>
              )}

              {mode === 'todo' && (
                <Button
                  size="touch"
                  variant={rejected ? 'destructive' : 'default'}
                  className={cn('mt-3 w-full', rejected && 'font-semibold shadow-md')}
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
