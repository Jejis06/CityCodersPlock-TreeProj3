import { Crosshair, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Feedback';

interface MapFilterBarProps {
  shownCount: number;
  totalCount: number;
  loading?: boolean;
  addMode: boolean;
  onToggleAddMode: () => void;
}

/** Slim toolbar above the map: result count + "Dodaj roślinę". Filters live in MapFiltersPanel. */
export function MapFilterBar({ shownCount, totalCount, loading = false, addMode, onToggleAddMode }: MapFilterBarProps) {
  return (
    <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
        {loading && <Spinner className="size-4" />}
        Wyświetlono: <span className="font-semibold text-slate-900">{shownCount} z {totalCount}</span>{' '}
        {totalCount === 1 ? 'rośliny' : 'roślin'}
      </p>
      <Button variant={addMode ? 'destructive' : 'default'} onClick={onToggleAddMode}>
        {addMode ? <Crosshair /> : <Plus />}
        {addMode ? 'Anuluj dodawanie' : 'Dodaj roślinę'}
      </Button>
    </div>
  );
}
