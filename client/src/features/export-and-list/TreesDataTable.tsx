import { ArrowDown, ArrowUp, ArrowUpDown, FileCheck2, LocateFixed, TableProperties } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/Feedback';
import { PlantBadge } from '@/components/shared/PlantBadge';
import { StatusDot } from '@/components/shared/StatusDot';
import { cn } from '@/lib/utils';
import { TREE_STATUS_META, TREE_STATUSES } from '@/types/domain';
import { compareTreeCodes, type ListTree } from './inventoryModel';
import { STATUS_SHORT_LABELS } from './listFilters';

type SortKey = 'code' | 'species' | 'address' | 'plot' | 'year' | 'status' | 'contractor' | 'decision';
type SortDirection = 'asc' | 'desc';

/** "Pokaż na mapie" stays visible when the table scrolls horizontally. */
const STICKY_ACTION_CELL = 'sticky right-0 px-3 py-2 shadow-[-10px_0_10px_-10px_rgba(15,23,42,0.25)]';

const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

const SORTERS: Record<SortKey, { label: string; value: (t: ListTree) => string | number | null }> = {
  code: { label: 'Kod', value: (t) => t.code },
  species: { label: 'Gatunek', value: (t) => t.species_label },
  address: { label: 'Adres', value: (t) => t.address },
  plot: { label: 'Działka', value: (t) => t.plot_number },
  year: { label: 'Rok', value: (t) => t.planting_year },
  status: { label: 'Status', value: (t) => TREE_STATUSES.indexOf(t.status) },
  contractor: { label: 'Wykonawca', value: (t) => t.contractor_name },
  decision: { label: 'Decyzja', value: (t) => t.decision_ref },
};

function sortTrees(trees: ListTree[], key: SortKey, direction: SortDirection): ListTree[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...trees].sort((a, b) => {
    if (key === 'code') return sign * compareTreeCodes(a.code, b.code);
    const va = SORTERS[key].value(a);
    const vb = SORTERS[key].value(b);
    // Empty values always go last, regardless of direction.
    if (va === null || vb === null) {
      if (va === vb) return compareTreeCodes(a.code, b.code);
      return va === null ? 1 : -1;
    }
    const result = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
    return sign * result || compareTreeCodes(a.code, b.code);
  });
}

interface TreesDataTableProps {
  trees: ListTree[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  focusedId: string | null;
  onShowOnMap: (tree: ListTree) => void;
}

function SelectAllCheckbox({ trees, selectedIds, onSelectionChange }: Omit<TreesDataTableProps, 'focusedId' | 'onShowOnMap'>) {
  const ref = useRef<HTMLInputElement>(null);
  const selectedVisible = trees.filter((t) => selectedIds.has(t.id)).length;
  const all = trees.length > 0 && selectedVisible === trees.length;
  const some = selectedVisible > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Zaznacz wszystkie widoczne"
      className="size-4 accent-emerald-700"
      checked={all}
      onChange={() => {
        const next = new Set(selectedIds);
        for (const tree of trees) {
          if (all) next.delete(tree.id);
          else next.add(tree.id);
        }
        onSelectionChange(next);
      }}
    />
  );
}

export function TreesDataTable({ trees, selectedIds, onSelectionChange, focusedId, onShowOnMap }: TreesDataTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'code', direction: 'asc' });
  const sorted = useMemo(() => sortTrees(trees, sort.key, sort.direction), [trees, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const header = (key: SortKey, className?: string) => {
    const active = sort.key === key;
    const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th
        scope="col"
        className={cn('px-3 py-2 text-left', className)}
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-emerald-800',
            active ? 'text-emerald-800' : 'text-slate-500',
          )}
        >
          {SORTERS[key].label}
          <Icon className={cn('size-3.5', !active && 'opacity-50')} />
        </button>
      </th>
    );
  };

  if (trees.length === 0) {
    return (
      <EmptyState
        icon={<TableProperties />}
        title="Brak roślin spełniających filtry"
        description="Zmień lub wyczyść filtry nad tabelą."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_#e2e8f0]">
          <tr>
            <th scope="col" className="w-10 px-3 py-2">
              <SelectAllCheckbox trees={trees} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
            </th>
            {header('code')}
            {header('species')}
            {header('address')}
            {header('plot')}
            {header('year', 'w-20')}
            {header('status')}
            {header('contractor')}
            {header('decision')}
            <th
              scope="col"
              className={cn(STICKY_ACTION_CELL, 'bg-slate-50 text-right text-xs font-semibold uppercase tracking-wide text-slate-500')}
            >
              Mapa
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tree) => {
            const selected = selectedIds.has(tree.id);
            return (
              <tr
                key={tree.id}
                id={`tree-row-${tree.id}`}
                className={cn(
                  'border-b border-slate-100 transition-colors',
                  selected ? 'bg-emerald-50/70' : 'hover:bg-slate-50',
                  focusedId === tree.id && 'outline-2 -outline-offset-2 outline-emerald-600',
                )}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Zaznacz ${tree.code}`}
                    className="size-4 accent-emerald-700"
                    checked={selected}
                    onChange={() => toggleRow(tree.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <PlantBadge type={tree.type} code={tree.code} size="sm" />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{tree.species_label}</div>
                  <div className="text-xs italic text-slate-500">{tree.species_latin_name}</div>
                </td>
                <td className="px-3 py-2 text-slate-700">{tree.address ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{tree.plot_number ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{tree.planting_year ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-2 whitespace-nowrap text-slate-700"
                    title={TREE_STATUS_META[tree.status].label}
                  >
                    <StatusDot status={tree.status} shape={tree.type === 'tree' ? 'circle' : 'square'} />
                    {STATUS_SHORT_LABELS[tree.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{tree.contractor_name ?? '—'}</td>
                <td className="px-3 py-2">
                  {tree.from_decision ? (
                    <span
                      title={tree.decision_ref ?? undefined}
                      className="inline-flex max-w-44 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"
                    >
                      <FileCheck2 className="size-3.5 shrink-0" />
                      <span className="truncate">{tree.decision_ref}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={cn(STICKY_ACTION_CELL, 'text-right', selected ? 'bg-emerald-50' : 'bg-white')}>
                  <Button size="sm" variant="outline" onClick={() => onShowOnMap(tree)}>
                    <LocateFixed />
                    Pokaż na mapie
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
