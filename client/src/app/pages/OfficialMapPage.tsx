import { CheckCircle2, Crosshair, MousePointerClick, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card';
import { EmptyState, ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { StatusDot } from '@/components/shared/StatusDot';
import { AddTreeDialog, type LatLng } from '@/features/map/AddTreeDialog';
import { MapFilterBar } from '@/features/map/MapFilterBar';
import { EMPTY_TREE_FILTERS, type TreeFilters } from '@/features/map/treeFilters';
import { TreeMap } from '@/features/map/TreeMap';
import { useTrees } from '@/features/map/useTrees';
import { TreeQuickInfo } from '@/features/tree-card/TreeQuickInfo';
import { TREE_STATUS_META, TREE_STATUSES, type TreeListItem } from '@/types/domain';

const SUCCESS_NOTICE_MS = 4000;

export function OfficialMapPage() {
  const [filters, setFilters] = useState<TreeFilters>(EMPTY_TREE_FILTERS);
  const all = useTrees();
  const filtered = useTrees(filters);
  const [selected, setSelected] = useState<TreeListItem | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<LatLng | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const plantingYears = useMemo(
    () =>
      [...new Set(all.trees.map((t) => t.planting_year).filter((y): y is number => y !== null))].sort(
        (a, b) => b - a,
      ),
    [all.trees],
  );

  useEffect(() => {
    if (!addMode) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setAddMode(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addMode]);

  useEffect(() => {
    if (!createdCode) return;
    const timer = setTimeout(() => setCreatedCode(null), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [createdCode]);

  const handleCreated = (tree: TreeListItem) => {
    setPendingPosition(null);
    setSelected(tree);
    setCreatedCode(tree.code);
    void all.reload();
    void filtered.reload();
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Rośliny w ewidencji
              {all.loading ? <Spinner className="size-4" /> : <span className="text-slate-500">{all.trees.length}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {TREE_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2 text-sm">
                  <StatusDot status={status} />
                  <span className="flex-1 text-slate-700">{TREE_STATUS_META[status].label}</span>
                  <span className="font-semibold">{all.trees.filter((t) => t.status === status).length}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {(all.error ?? filtered.error) && <ErrorMessage>{all.error ?? filtered.error}</ErrorMessage>}

        {selected ? (
          <TreeQuickInfo tree={selected} onClose={() => setSelected(null)} />
        ) : (
          <Card>
            <EmptyState
              icon={<MousePointerClick />}
              title="Wybierz roślinę"
              description="Kliknij punkt na mapie, aby zobaczyć podstawowe dane rośliny."
            />
          </Card>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <MapFilterBar
          filters={filters}
          onChange={setFilters}
          plantingYears={plantingYears}
          shownCount={filtered.trees.length}
          totalCount={all.trees.length}
          loading={filtered.loading}
          addMode={addMode}
          onToggleAddMode={() => setAddMode((m) => !m)}
        />

        <div className="relative min-h-0 flex-1">
          <TreeMap
            trees={filtered.trees}
            selectedTreeId={selected?.id}
            onTreeClick={addMode ? undefined : setSelected}
            addMode={addMode}
            pendingPosition={pendingPosition}
            onMapClick={
              addMode
                ? (position) => {
                    setAddMode(false);
                    setPendingPosition(position);
                  }
                : undefined
            }
          />

          {addMode && (
            <div className="absolute left-1/2 top-3 z-[1001] flex -translate-x-1/2 items-center gap-3 rounded-full bg-emerald-800 py-2 pl-4 pr-2 text-sm font-medium text-white shadow-xl">
              <Crosshair className="size-4 animate-pulse" />
              Kliknij w dowolne miejsce na mapie Płocka, aby dodać roślinę
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-white hover:bg-white/15"
                onClick={() => setAddMode(false)}
              >
                <X />
                Anuluj (Esc)
              </Button>
            </div>
          )}

          {createdCode && !addMode && (
            <div
              role="status"
              className="absolute left-1/2 top-3 z-[1001] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-medium text-emerald-800 shadow-xl ring-1 ring-emerald-200"
            >
              <CheckCircle2 className="size-4 text-emerald-600" />
              Dodano roślinę <span className="font-bold">{createdCode}</span> do ewidencji
            </div>
          )}
        </div>
      </section>

      <AddTreeDialog
        position={pendingPosition}
        onClose={() => setPendingPosition(null)}
        onCreated={handleCreated}
      />
    </div>
  );
}
