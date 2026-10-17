import { FileCheck2, FilterX } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Select } from '@/components/shared/FormControls';
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
import { FIELD_CLASS, FIELD_LABEL_CLASS } from './listUi';

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
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Status colour — active pill gets a tinted background instead of the brand green. */
  color?: string;
}

function Pill({ active, onClick, children, color }: PillProps) {
  const tinted: CSSProperties | undefined =
    active && color ? { backgroundColor: `${color}1a`, borderColor: `${color}80` } : undefined;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={tinted}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-all',
        active
          ? color
            ? 'font-semibold text-slate-900 shadow-sm'
            : 'border-emerald-700 bg-emerald-700 text-white shadow-sm shadow-emerald-900/20'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

function PillGroup({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn(FIELD_LABEL_CLASS, 'mr-1 flex items-center gap-1.5')}>
        {icon}
        {label}
      </span>
      {children}
    </div>
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Ulica / adres">
          <AddressAutocomplete
            trees={trees}
            value={filters.address}
            onChange={(address) => set({ address })}
            inputClassName={FIELD_CLASS}
          />
        </Field>

        <Field label="Gatunek">
          <Select
            className={FIELD_CLASS}
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

        <Field label="Rok posadzenia">
          <Select
            className={FIELD_CLASS}
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

        <Field label="Wykonawca">
          <Select
            className={FIELD_CLASS}
            value={filters.contractorId ?? ''}
            onChange={(e) => set({ contractorId: e.target.value || null })}
          >
            <option value="">Wszyscy</option>
            {options.contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {options.hasUnassigned && <option value={NO_CONTRACTOR}>— bez wykonawcy —</option>}
          </Select>
        </Field>

        <Field label="Typ">
          <Select
            className={FIELD_CLASS}
            value={filters.type ?? ''}
            onChange={(e) => set({ type: (e.target.value || null) as PlantType | null })}
          >
            <option value="">Drzewa i krzewy</option>
            <option value="tree">Tylko drzewa (D)</option>
            <option value="shrub">Tylko krzewy (K)</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-100 pt-4">
        <PillGroup label="Status">
          <Pill active={filters.statuses.length === 0} onClick={() => set({ statuses: [] })}>
            Wszystkie
          </Pill>
          {TREE_STATUSES.map((status) => {
            const color = TREE_STATUS_META[status].color;
            return (
              <Pill
                key={status}
                color={color}
                active={filters.statuses.includes(status)}
                onClick={() => toggleStatus(status)}
              >
                <span className="size-2 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
                <span title={TREE_STATUS_META[status].label}>{STATUS_SHORT_LABELS[status]}</span>
              </Pill>
            );
          })}
        </PillGroup>

        <PillGroup label="Decyzja" icon={<FileCheck2 className="size-3.5" />}>
          {DECISION_OPTIONS.map((option) => (
            <Pill key={option.value} active={filters.decision === option.value} onClick={() => set({ decision: option.value })}>
              {option.label}
            </Pill>
          ))}
        </PillGroup>

        {hasActiveListFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_LIST_FILTERS)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <FilterX className="size-4" />
            Wyczyść filtry
          </button>
        )}
      </div>
    </div>
  );
}
