import { CheckSquare, MousePointer, SquareDashedMousePointer, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CursorMode = 'single' | 'multi_point' | 'spatial_box';

interface CursorModeOption {
  id: CursorMode;
  label: string;
  title: string;
  icon: LucideIcon;
}

const CURSOR_MODE_OPTIONS: readonly CursorModeOption[] = [
  {
    id: 'single',
    label: 'Pojedynczy',
    title: 'Pojedynczy wybór — kliknięcie w roślinę otwiera jej pełną Kartę Ewidencyjną',
    icon: MousePointer,
  },
  {
    id: 'multi_point',
    label: 'Punktowo wiele',
    title: 'Zaznaczanie punktowe wielu — klikaj kolejne punkty na mapie, aby dodać lub odznaczyć rośliny',
    icon: CheckSquare,
  },
  {
    id: 'spatial_box',
    label: 'Przestrzennie kwadratem',
    title: 'Zaznaczanie przestrzenne — przeciągnij kursorem prostokąt na mapie, aby zaznaczyć rośliny w obszarze',
    icon: SquareDashedMousePointer,
  },
];

export function formatSelectedPlantsLabel(count: number): string {
  if (count === 1) return '1 roślinę';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isFew = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${isFew ? 'rośliny' : 'roślin'}`;
}

export interface CursorModeToolbarProps {
  mode: CursorMode;
  onModeChange: (mode: CursorMode) => void;
  selectedCount: number;
  onClearSelection: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Pływający pasek wyboru trybu kursora na mapie Urzędnika:
 * 1) Pojedynczy wybór (`single`) — otwiera Kartę Ewidencyjną Rośliny,
 * 2) Zaznaczanie punktowe wielu (`multi_point`) — przełącza zaznaczenie klikanych roślin,
 * 3) Zaznaczanie przestrzenne kwadratem (`spatial_box`) — zaznacza rośliny w narysowanym prostokącie.
 */
export function CursorModeToolbar({
  mode,
  onModeChange,
  selectedCount,
  onClearSelection,
  disabled = false,
  className,
}: CursorModeToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Tryb kursora mapy"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        'z-[1001] flex flex-col items-center gap-1.5',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <span className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:inline">
          Kursor:
        </span>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Wybór trybu zaznaczania">
          {CURSOR_MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                title={option.title}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onModeChange(option.id)}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-all',
                  active
                    ? option.id === 'single'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/80 hover:text-slate-950',
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {(mode !== 'single' || selectedCount > 0) && (
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 pr-1">
            <span
              aria-live="polite"
              className={cn(
                'inline-flex h-7 items-center rounded-full px-2.5 text-xs font-bold',
                selectedCount > 0
                  ? 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300'
                  : 'bg-slate-100 text-slate-600',
              )}
            >
              Zaznaczono: {formatSelectedPlantsLabel(selectedCount)}
            </span>

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Odznacz wszystkie wybrane rośliny"
              >
                <X className="size-3.5" />
                Wyczyść zaznaczenie
              </button>
            )}
          </div>
        )}
      </div>

      {mode === 'multi_point' && (
        <p className="rounded-full bg-indigo-950/90 px-3 py-1 text-xs font-medium text-indigo-50 shadow-md backdrop-blur">
          Klikaj w kolejne punkty roślin na mapie, aby dodać je do listy zaznaczonych (ponowne kliknięcie odznacza)
        </p>
      )}

      {mode === 'spatial_box' && (
        <p className="rounded-full bg-indigo-950/90 px-3 py-1 text-xs font-medium text-indigo-50 shadow-md backdrop-blur">
          Przytrzymaj lewy przycisk myszy i przeciągnij prostokąt na mapie, aby zaznaczyć wszystkie rośliny w obszarze
        </p>
      )}
    </div>
  );
}
