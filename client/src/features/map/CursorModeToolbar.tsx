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
 * Kompaktowy pasek wyboru trybu kursora na górnym pasku mapy Urzędnika (między licznikiem roślin a alertami):
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
      className={cn(
        'flex flex-wrap items-center gap-2',
        disabled && 'pointer-events-none opacity-55',
        className,
      )}
    >
      <div
        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200/80"
        role="group"
        aria-label="Wybór trybu zaznaczania"
      >
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
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white hover:text-slate-950',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      {selectedCount > 0 && (
        <div className="inline-flex items-center gap-1.5">
          <span
            aria-live="polite"
            className="inline-flex h-8 items-center rounded-lg bg-indigo-50 px-2.5 text-xs font-bold text-indigo-900 ring-1 ring-indigo-200"
          >
            Zaznaczono: {formatSelectedPlantsLabel(selectedCount)}
          </span>

          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            title="Wyczyść zaznaczenie"
          >
            <X className="size-3.5" />
            Wyczyść
          </button>
        </div>
      )}
    </div>
  );
}
