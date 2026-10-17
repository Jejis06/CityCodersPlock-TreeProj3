import { BellRing, Crosshair, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Feedback';

interface MapFilterBarProps {
  shownCount: number;
  totalCount: number;
  loading?: boolean;
  addMode: boolean;
  onToggleAddMode: () => void;
  decisionAlertCount?: number;
  onOpenDecisionAlerts?: () => void;
}

/** Slim toolbar above the map: result count + "Alerty Decyzji (3 lata)" + "Dodaj roślinę". Filters live in MapFiltersPanel. */
export function MapFilterBar({
  shownCount,
  totalCount,
  loading = false,
  addMode,
  onToggleAddMode,
  decisionAlertCount = 0,
  onOpenDecisionAlerts,
}: MapFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <p className="mr-auto flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
        {loading && <Spinner className="size-4" />}
        Wyświetlono: <span className="font-semibold text-slate-900">{shownCount} z {totalCount}</span>{' '}
        {totalCount === 1 ? 'rośliny' : 'roślin'}
      </p>

      {onOpenDecisionAlerts && (
        <Button
          type="button"
          variant="outline"
          onClick={onOpenDecisionAlerts}
          className="border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100"
        >
          <BellRing className="size-4 text-amber-700" />
          Alerty Decyzji (3 lata)
          {decisionAlertCount > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
              {decisionAlertCount}
            </span>
          )}
        </Button>
      )}

      <Button variant={addMode ? 'destructive' : 'default'} onClick={onToggleAddMode}>
        {addMode ? <Crosshair /> : <Plus />}
        {addMode ? 'Anuluj dodawanie' : 'Dodaj roślinę'}
      </Button>
    </div>
  );
}
