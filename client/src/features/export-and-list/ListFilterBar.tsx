import { FileCheck2, FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/shared/Button';
import { Select } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { cn } from '@/lib/utils';
import { TREE_STATUS_META, TREE_STATUSES, type PlantType, type TreeStatus } from '@/types/domain';
import { AddressAutocomplete } from './AddressAutocomplete';
import type { ListTree } from './inventoryModel';
import {
  EMPTY_LIST_FILTERS,
  NO_CONTRACTOR,
  STATUS_SHORT_LABELS,
  hasActiveListFilters,
  type DecisionFilter,
  type ListFilters,
} from './listFilters';

const DECISION_OPTIONS: { value: DecisionFilter; label: string }[] = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'yes', label: 'Z decyzji' },
  { value: 'no', label: 'Bez decyzji' },
];

export interface FilterOptions {
  plantingYears: number[];
  species: { id: number; label: string; type: PlantType; count: number }[];
  contractors: { id: string; name: string }[];
  hasUnassigned: boolean;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
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

interface ListFilterBarProps {
  trees: ListTree[];
  filters: ListFilters;
  onChange: (filters: ListFilters) => void;
  options: FilterOptions;
}

export function ListFilterBar({ trees, filters, onChange, options }: ListFilterBarProps) {
  const set = (patch: Partial<ListFilters>) => onChange({ ...filters, ...patch });

  const toggleStatus = (status: TreeStatus) => {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    set({ statuses: statuses.length === TREE_STATUSES.length ? [] : statuses });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Ulica / adres" className="min-w-64 flex-[2]">
          <AddressAutocomplete trees={trees} value={filters.address} onChange={(address) => set({ address })} />
        </Field>

        <Field label="Gatunek" className="min-w-56 flex-[2]">
          <Select
            value={filters.speciesId ?? ''}
            onChange={(e) => set({ speciesId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Wszystkie gatunki</option>
            {options.species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.count})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Rok posadzenia" className="w-36">
          <Select
            value={filters.plantingYear ?? ''}
            onChange={(e) => set({ plantingYear: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Wszystkie</option>
            {options.plantingYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Wykonawca" className="w-48">
          <Select value={filters.contractorId ?? ''} onChange={(e) => set({ contractorId: e.target.value || null })}>
            <option value="">Wszyscy</option>
            {options.contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {options.hasUnassigned && <option value={NO_CONTRACTOR}>— bez wykonawcy —</option>}
          </Select>
        </Field>

        <Field label="Typ" className="w-40">
          <Select
            value={filters.type ?? ''}
            onChange={(e) => set({ type: (e.target.value || null) as PlantType | null })}
          >
            <option value="">Drzewa i krzewy</option>
            <option value="tree">Tylko drzewa (D)</option>
            <option value="shrub">Tylko krzewy (K)</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <Chip active={filters.statuses.length === 0} onClick={() => set({ statuses: [] })}>
            Wszystkie
          </Chip>
          {TREE_STATUSES.map((status) => (
            <Chip key={status} active={filters.statuses.includes(status)} onClick={() => toggleStatus(status)}>
              <StatusDot status={status} />
              <span title={TREE_STATUS_META[status].label}>{STATUS_SHORT_LABELS[status]}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <FileCheck2 className="size-3.5" /> Decyzja
          </span>
          {DECISION_OPTIONS.map((option) => (
            <Chip key={option.value} active={filters.decision === option.value} onClick={() => set({ decision: option.value })}>
              {option.label}
            </Chip>
          ))}
        </div>

        {hasActiveListFilters(filters) && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(EMPTY_LIST_FILTERS)}>
            <FilterX />
            Wyczyść filtry
          </Button>
        )}
      </div>
    </div>
  );
}
