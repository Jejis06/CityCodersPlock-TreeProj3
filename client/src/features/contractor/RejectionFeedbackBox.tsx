import { AlertOctagon, LandPlot, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { cn, formatDateTime } from '@/lib/utils';
import type { ContractorTask } from './types';

interface RejectionFeedbackBoxProps {
  task: ContractorTask;
  onShowOnMap?: (task: ContractorTask) => void;
  className?: string;
}

const formatCoord = (value: number) => value.toFixed(6);

/** Uwagi urzędnika do zadania `rejected` + dokładna lokalizacja rośliny. */
export function RejectionFeedbackBox({ task, onShowOnMap, className }: RejectionFeedbackBoxProps) {
  return (
    <div
      role="alert"
      className={cn(
        'overflow-hidden rounded-xl border-2 border-red-400 bg-gradient-to-br from-red-50 to-orange-50 text-red-900',
        className,
      )}
    >
      <div className="flex items-start gap-2 bg-gradient-to-r from-red-600 to-orange-500 px-3 py-2 text-white">
        <AlertOctagon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wide">Zwrócono do poprawy przez urzędnika</p>
          <p className="text-xs text-red-50">
            {task.reviewed_by_name ?? 'Urzędnik'} · {formatDateTime(task.reviewed_at)}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Co wymaga poprawy wg Urzędu</p>
          <p className="mt-0.5 whitespace-pre-line text-base font-bold leading-snug">
            {task.official_rejection_reason ?? 'Brak podanego powodu.'}
          </p>
        </div>

        <dl className="space-y-1 rounded-lg bg-white/70 p-2.5 text-sm text-slate-700 ring-1 ring-red-200">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-red-600" />
            <dt className="sr-only">Adres</dt>
            <dd>{task.tree_address ?? 'Brak adresu'}</dd>
          </div>
          <div className="flex gap-2">
            <LandPlot className="mt-0.5 size-4 shrink-0 text-red-600" />
            <dt className="shrink-0 text-slate-500">Działka:</dt>
            <dd className="font-medium">{task.tree_plot_number ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <Navigation className="mt-0.5 size-4 shrink-0 text-red-600" />
            <dt className="shrink-0 text-slate-500">GPS:</dt>
            <dd className="font-mono text-xs leading-5">
              {formatCoord(task.tree_latitude)}, {formatCoord(task.tree_longitude)}
            </dd>
          </div>
        </dl>

        {onShowOnMap && (
          <Button
            size="lg"
            variant="outline"
            className="w-full border-red-300 text-red-800 hover:bg-red-100"
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
