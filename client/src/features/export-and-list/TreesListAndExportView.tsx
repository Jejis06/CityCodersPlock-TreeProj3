import { BarChart3, ListChecks, Map as MapIcon, RefreshCw, TableProperties, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { cn } from '@/lib/utils';
import { ExportPanel } from './ExportPanel';
import { speciesFrequency, type ListTree } from './inventoryModel';
import { ListFilterBar, type FilterOptions } from './ListFilterBar';
import { applyListFilters, describeListFilters, EMPTY_LIST_FILTERS, type ListFilters } from './listFilters';
import { ListMapPanel } from './ListMapPanel';
import { PANEL_CLASS, PanelHeader } from './listUi';
import { SpeciesFrequencyChart } from './SpeciesFrequencyChart';
import { TreesDataTable } from './TreesDataTable';
import { useInventoryData } from './useInventoryData';

function buildFilterOptions(trees: ListTree[]): FilterOptions {
  const years = new Set<number>();
  const contractors = new Map<string, string>();
  for (const tree of trees) {
    if (tree.planting_year !== null) years.add(tree.planting_year);
    if (tree.contractor_id) contractors.set(tree.contractor_id, tree.contractor_name ?? tree.contractor_id);
  }
  return {
    plantingYears: [...years].sort((a, b) => b - a),
    species: speciesFrequency(trees)
      .map((s) => ({ id: s.speciesId, label: s.label, type: s.type, count: s.count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pl')),
    contractors: [...contractors.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    hasUnassigned: trees.some((t) => t.contractor_id === null),
  };
}

/** Urzędnik: "Lista Drzew, Analizy i Eksport" — filters, OX/OY species chart, table, map with area→PDF, exports. */
export function TreesListAndExportView() {
  const { user } = useCurrentUser();
  const inventory = useInventoryData();
  const [filters, setFilters] = useState<ListFilters>(EMPTY_LIST_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => buildFilterOptions(inventory.trees), [inventory.trees]);
  const filtered = useMemo(() => applyListFilters(inventory.trees, filters), [inventory.trees, filters]);
  const species = useMemo(() => speciesFrequency(filtered), [filtered]);
  const selectedTrees = useMemo(() => filtered.filter((t) => selectedIds.has(t.id)), [filtered, selectedIds]);
  const focused = useMemo(() => filtered.find((t) => t.id === focusedId) ?? null, [filtered, focusedId]);

  const filtersSummary = useMemo(
    () =>
      describeListFilters(filters, {
        speciesLabel: (id) => options.species.find((s) => s.id === id)?.label,
        contractorName: (id) => options.contractors.find((c) => c.id === id)?.name,
      }),
    [filters, options],
  );

  const showOnMap = (tree: ListTree) => {
    setFocusedId(tree.id);
    setFocusRequest((n) => n + 1);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const onMapTreeClick = (tree: ListTree) => {
    setFocusedId(tree.id);
    document.getElementById(`tree-row-${tree.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f4f6f5]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <section className={cn(PANEL_CLASS, 'p-6')}>
          <div className="mb-6 flex flex-wrap items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-900/20">
              <TableProperties className="size-5" />
            </span>
            <div className="mr-auto min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Lista drzew, analizy i eksport</h1>
              <p className="mt-1 text-sm text-slate-500">
                Ewidencja zieleni Płocka w formie tabeli — filtruj, analizuj gatunki i eksportuj do Excel, CAD, GIS i PDF.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p
                className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2 text-sm text-slate-500 ring-1 ring-inset ring-slate-200/80"
                aria-live="polite"
              >
                {inventory.loading && <Spinner className="size-4" />}
                Wyświetlono:
                <span className="font-semibold tabular-nums text-slate-900">
                  {filtered.length} z {inventory.trees.length}
                </span>
              </p>
              <button
                type="button"
                onClick={() => void inventory.reload()}
                disabled={inventory.loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
              >
                <RefreshCw className={cn('size-4', inventory.loading && 'animate-spin')} />
                Odśwież dane
              </button>
            </div>
          </div>

          <ListFilterBar trees={inventory.trees} filters={filters} onChange={setFilters} options={options} />
        </section>

        {inventory.error && <ErrorMessage>{inventory.error}</ErrorMessage>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className={cn(PANEL_CLASS, 'flex min-w-0 flex-col')}>
            <PanelHeader
              icon={BarChart3}
              title="Wykres gatunków"
              description={
                <>
                  OX: gatunki, OY: ilość wystąpień — dla {filtered.length} przefiltrowanych roślin ({species.length}{' '}
                  gatunków).
                </>
              }
            />
            <div className="flex flex-1 flex-col px-6 pb-5 pt-4">
              <SpeciesFrequencyChart
                className="flex-1"
                data={species}
                selectedSpeciesId={filters.speciesId}
                onBarClick={(speciesId) =>
                  setFilters((f) => ({ ...f, speciesId: f.speciesId === speciesId ? null : speciesId }))
                }
              />
            </div>
          </section>

          <ExportPanel
            filteredTrees={filtered}
            selectedTrees={selectedTrees}
            filtersSummary={filtersSummary}
            generatedBy={user?.full_name ?? null}
          />
        </div>

        <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <section className={cn(PANEL_CLASS, 'min-w-0 overflow-hidden')}>
            <PanelHeader
              icon={ListChecks}
              title={`Rośliny (${filtered.length})`}
              className="pb-4"
              aside={
                selectedTrees.length > 0 && (
                  <span className="flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                    Zaznaczono: {selectedTrees.length}
                    <button
                      type="button"
                      aria-label="Odznacz wszystkie"
                      className="rounded-full p-0.5 transition-colors hover:bg-emerald-100"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                )
              }
            />
            <div className="border-t border-slate-100">
              <TreesDataTable
                trees={filtered}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                focusedId={focusedId}
                onShowOnMap={showOnMap}
              />
            </div>
          </section>

          <div ref={mapRef} className="min-w-0 scroll-mt-6 2xl:sticky 2xl:top-6">
            <section className={cn(PANEL_CLASS, 'flex h-[640px] flex-col overflow-hidden')}>
              <PanelHeader
                icon={MapIcon}
                title="Mapa przefiltrowanych roślin"
                className="pb-4"
                aside={
                  focused && (
                    <span className="truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      Wybrano: {focused.code}
                    </span>
                  )
                }
              />
              <div className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-slate-200">
                <ListMapPanel
                  trees={filtered}
                  focused={focused}
                  focusRequest={focusRequest}
                  onTreeClick={onMapTreeClick}
                  generatedBy={user?.full_name ?? null}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
