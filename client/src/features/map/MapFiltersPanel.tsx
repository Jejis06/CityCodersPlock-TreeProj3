import { FilterX } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/shared/Button';
import { Select } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TREE_STATUS_META,
  TREE_STATUSES,
  type PlantType,
  type TaskCategory,
  type TreeStatus,
  type User,
} from '@/types/domain';
import { AddressAutocomplete } from './AddressAutocomplete';
import { SpeciesCombobox } from './SpeciesCombobox';
import { EMPTY_TREE_FILTERS, hasActiveFilters, type TreeFilters } from './treeFilters';
import type { AddressSuggestion } from './useReverseGeocode';

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

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function useContractors() {
  const [contractors, setContractors] = useState<User[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<User[]>('/api/users')
      .then((users) => !cancelled && setContractors(users.filter((u) => u.role === 'contractor')))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return contractors;
}

interface MapFiltersPanelProps {
  filters: TreeFilters;
  onChange: (filters: TreeFilters) => void;
  plantingYears: number[];
  /** Picked address suggestion: the page also flies the map to it. */
  onAddressSelect: (suggestion: AddressSuggestion) => void;
}

/** Full filter set for the official's left sidebar (server-side filtering via GET /api/trees). */
export function MapFiltersPanel({ filters, onChange, plantingYears, onAddressSelect }: MapFiltersPanelProps) {
  const contractors = useContractors();
  const set = (patch: Partial<TreeFilters>) => onChange({ ...filters, ...patch });

  const toggleStatus = (status: TreeStatus) => {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    set({ statuses: statuses.length === TREE_STATUSES.length ? [] : statuses });
  };

  return (
    <div className="flex flex-col gap-4">
      <AddressAutocomplete
        value={filters.address}
        onSelect={onAddressSelect}
        onClear={() => set({ address: null })}
      />

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
        <div className="flex flex-wrap gap-1.5">
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

      <FilterGroup label="Gatunek">
        <SpeciesCombobox
          value={filters.species}
          type={filters.type}
          onChange={(species) => set({ species })}
          placeholder="Wszystkie gatunki — szukaj…"
        />
      </FilterGroup>

      <FilterGroup label="Rok posadzenia">
        <Select
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

      <FilterGroup label="Wykonawca">
        <Select value={filters.contractorId ?? ''} onChange={(e) => set({ contractorId: e.target.value || null })}>
          <option value="">Wszyscy</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </Select>
      </FilterGroup>

      {hasActiveFilters(filters) && (
        <Button variant="outline" size="sm" onClick={() => onChange(EMPTY_TREE_FILTERS)}>
          <FilterX />
          Wyczyść filtry
        </Button>
      )}
    </div>
  );
}
