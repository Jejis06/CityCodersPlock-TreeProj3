import { AlertTriangle, LandPlot, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { cn, formatDateTime } from '@/lib/utils';
import type { ContractorTask } from './types';

interface RejectionFeedbackBoxProps {
  task: ContractorTask;
  onShowOnMap?: (task: ContractorTask) => void;
  className?: string;
}

const formatCoord = (value: number) => value.toFixed(6);

/** Statyczna karta informacyjna z uwagami urzędnika do zadania `rejected` + dokładna lokalizacja rośliny. */
export function RejectionFeedbackBox({ task, onShowOnMap, className }: RejectionFeedbackBoxProps) {
  return (
    <div
      role="note"
      aria-label="Uwagi urzędnika do poprawy zadania"
      className={cn(
        'overflow-hidden rounded-lg border-y border-l-4 border-r border-amber-200/80 border-l-amber-500 bg-amber-50/90 p-3 text-amber-950',
        className,
      )}
    >
      <div className="flex items-start gap-2.5 border-b border-amber-200/70 pb-2.5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
            Zwrócono do poprawy przez urzędnika
          </p>
          <p className="text-xs text-amber-800/80">
            {task.reviewed_by_name ?? 'Urzędnik'} · {formatDateTime(task.reviewed_at)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Co wymaga poprawy wg Urzędu
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm font-bold leading-snug text-amber-950">
            {task.official_rejection_reason ?? 'Brak podanego powodu.'}
          </p>
        </div>

        <dl className="space-y-1 rounded-md bg-white/85 p-2.5 text-xs text-slate-700 ring-1 ring-amber-200/70">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <dt className="sr-only">Adres</dt>
            <dd>{task.tree_address ?? 'Brak adresu'}</dd>
          </div>
          <div className="flex gap-2">
            <LandPlot className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <dt className="shrink-0 text-slate-500">Działka:</dt>
            <dd className="font-medium">{task.tree_plot_number ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <Navigation className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <dt className="shrink-0 text-slate-500">GPS:</dt>
            <dd className="font-mono text-xs leading-5">
              {formatCoord(task.tree_latitude)}, {formatCoord(task.tree_longitude)}
            </dd>
          </div>
        </dl>

        {onShowOnMap && (
          <Button
            size="sm"
            variant="outline"
            className="w-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onShowOnMap(task);
            }}
          >
            <MapPin /> Pokaż na mapie
          </Button>
        )}
      </div>
    </div>
  );
}
