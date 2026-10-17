import { BarChart3, ListChecks, Map as MapIcon, RefreshCw, TableProperties, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { ExportPanel } from './ExportPanel';
import { speciesFrequency, type ListTree } from './inventoryModel';
import { ListFilterBar, type FilterOptions } from './ListFilterBar';
import { applyListFilters, describeListFilters, EMPTY_LIST_FILTERS, type ListFilters } from './listFilters';
import { ListMapPanel } from './ListMapPanel';
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
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <TableProperties className="size-5 text-emerald-700" />
              Lista drzew, analizy i eksport
            </h1>
            <p className="text-sm text-slate-500">
              Ewidencja zieleni Płocka w formie tabeli — filtruj, analizuj gatunki i eksportuj do Excel, CAD, GIS i PDF.
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
            {inventory.loading && <Spinner className="size-4" />}
            Wyświetlono:{' '}
            <span className="font-semibold text-slate-900">
              {filtered.length} z {inventory.trees.length}
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={() => void inventory.reload()} disabled={inventory.loading}>
            <RefreshCw />
            Odśwież dane
          </Button>
        </div>

        {inventory.error && <ErrorMessage>{inventory.error}</ErrorMessage>}

        <Card className="p-4">
          <ListFilterBar trees={inventory.trees} filters={filters} onChange={setFilters} options={options} />
        </Card>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-emerald-700" />
                Wykres gatunków
              </CardTitle>
              <CardDescription>
                OX: gatunki, OY: ilość wystąpień — dla {filtered.length} przefiltrowanych roślin ({species.length}{' '}
                gatunków).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpeciesFrequencyChart
                data={species}
                selectedSpeciesId={filters.speciesId}
                onBarClick={(speciesId) =>
                  setFilters((f) => ({ ...f, speciesId: f.speciesId === speciesId ? null : speciesId }))
                }
              />
            </CardContent>
          </Card>

          <ExportPanel
            filteredTrees={filtered}
            selectedTrees={selectedTrees}
            filtersSummary={filtersSummary}
            generatedBy={user?.full_name ?? null}
          />
        </div>

        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <ListChecks className="size-4 text-emerald-700" />
                Rośliny ({filtered.length})
              </h2>
              {selectedTrees.length > 0 && (
                <span className="flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
                  Zaznaczono: {selectedTrees.length}
                  <button
                    type="button"
                    aria-label="Odznacz wszystkie"
                    className="rounded-full p-0.5 hover:bg-emerald-100"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
            <TreesDataTable
              trees={filtered}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              focusedId={focusedId}
              onShowOnMap={showOnMap}
            />
          </Card>

          <div ref={mapRef} className="min-w-0 scroll-mt-4 2xl:sticky 2xl:top-4">
            <Card className="flex h-[620px] flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
                <MapIcon className="size-4 text-emerald-700" />
                <h2 className="font-semibold text-slate-900">Mapa przefiltrowanych roślin</h2>
                {focused && <span className="ml-auto truncate text-sm text-slate-500">Wybrano: {focused.code}</span>}
              </div>
              <div className="relative min-h-0 flex-1">
                <ListMapPanel
                  trees={filtered}
                  focused={focused}
                  focusRequest={focusRequest}
                  onTreeClick={onMapTreeClick}
                  generatedBy={user?.full_name ?? null}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
