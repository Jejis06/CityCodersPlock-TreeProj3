import { Crosshair, FilterX, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Feedback';
import { Select } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { cn } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TREE_STATUS_META,
  TREE_STATUSES,
  type PlantType,
  type TaskCategory,
  type TreeStatus,
} from '@/types/domain';
import { SpeciesCombobox } from './SpeciesCombobox';
import { EMPTY_TREE_FILTERS, hasActiveFilters, type TreeFilters } from './treeFilters';

const STATUS_SHORT_LABELS: Record<TreeStatus, string> = {
  green: 'Zdrowe',
  yellow: 'W trakcie prac',
  red: 'Do wycinki',
  blue: 'Do posadzenia',
};

const TYPE_OPTIONS: { value: PlantType | null; label: string }[] = [
  { value: null, label: 'Wszystkie' },
  { value: 'tree', label: 'Drzewa (D)' },
  { value: 'shrub', label: 'Krzewy (K)' },
];

const TASK_CATEGORIES = Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[];

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

interface MapFilterBarProps {
  filters: TreeFilters;
  onChange: (filters: TreeFilters) => void;
  plantingYears: number[];
  shownCount: number;
  totalCount: number;
  loading?: boolean;
  addMode: boolean;
  onToggleAddMode: () => void;
}

export function MapFilterBar({
  filters,
  onChange,
  plantingYears,
  shownCount,
  totalCount,
  loading = false,
  addMode,
  onToggleAddMode,
}: MapFilterBarProps) {
  const set = (patch: Partial<TreeFilters>) => onChange({ ...filters, ...patch });

  const toggleStatus = (status: TreeStatus) => {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    set({ statuses: statuses.length === TREE_STATUSES.length ? [] : statuses });
  };

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterGroup label="Status">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={filters.statuses.length === 0} onClick={() => set({ statuses: [] })}>
              Wszystkie
            </Chip>
            {TREE_STATUSES.map((status) => (
              <Chip
                key={status}
                active={filters.statuses.includes(status)}
                onClick={() => toggleStatus(status)}
                title={TREE_STATUS_META[status].label}
              >
                <StatusDot status={status} />
                {STATUS_SHORT_LABELS[status]}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Typ">
          <div className="flex gap-1.5">
            {TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                active={filters.type === option.value}
                onClick={() => {
                  const keepSpecies = !option.value || !filters.species || filters.species.type === option.value;
                  set({ type: option.value, species: keepSpecies ? filters.species : null });
                }}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        <div className="ml-auto flex items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
            {loading && <Spinner className="size-4" />}
            Wyświetlono:{' '}
            <span className="font-semibold text-slate-900">
              {shownCount} z {totalCount}
            </span>{' '}
            {totalCount === 1 ? 'rośliny' : 'roślin'}
          </p>
          <Button variant={addMode ? 'destructive' : 'default'} onClick={onToggleAddMode}>
            {addMode ? <Crosshair /> : <Plus />}
            {addMode ? 'Anuluj dodawanie' : 'Dodaj roślinę'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterGroup label="Gatunek">
          <SpeciesCombobox
            className="w-72"
            value={filters.species}
            type={filters.type}
            onChange={(species) => set({ species })}
            placeholder="Wszystkie gatunki — szukaj…"
          />
        </FilterGroup>

        <FilterGroup label="Rok posadzenia">
          <Select
            className="w-36"
            value={filters.plantingYear ?? ''}
            onChange={(e) => set({ plantingYear: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Wszystkie</option>
            {plantingYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </FilterGroup>

        <FilterGroup label="Kategoria zadań">
          <Select
            className="w-44"
            value={filters.taskCategory ?? ''}
            onChange={(e) => set({ taskCategory: (e.target.value || null) as TaskCategory | null })}
          >
            <option value="">Wszystkie</option>
            {TASK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {TASK_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </FilterGroup>

        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_TREE_FILTERS)}>
            <FilterX />
            Wyczyść filtry
          </Button>
        )}
      </div>
    </div>
  );
}
