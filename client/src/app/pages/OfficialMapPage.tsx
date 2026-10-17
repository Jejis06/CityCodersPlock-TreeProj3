import { CheckCircle2, Crosshair, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { StatusDot } from '@/components/shared/StatusDot';
import { AddTreeDialog, type LatLng } from '@/features/map/AddTreeDialog';
import { MapFilterBar } from '@/features/map/MapFilterBar';
import { MapFiltersPanel } from '@/features/map/MapFiltersPanel';
import { MapFlyTo, type FlyTarget } from '@/features/map/MapFlyTo';
import { ParcelHighlighter } from '@/features/map/ParcelHighlighter';
import { EMPTY_TREE_FILTERS, type TreeFilters } from '@/features/map/treeFilters';
import { TreeMap } from '@/features/map/TreeMap';
import {
  useReverseGeocode,
  type AddressSuggestion,
  type ParcelGeometry,
} from '@/features/map/useReverseGeocode';
import { useTrees } from '@/features/map/useTrees';
import { ViewportStatsWidget } from '@/features/map/ViewportStatsWidget';
import {
  DecisionWarrantyModal,
  getExpiringDecisionTrees,
} from '@/features/tree-card/DecisionWarrantyModal';
import { TreeCardSheet } from '@/features/tree-card/TreeCardSheet';
import type { RelocateTarget } from '@/features/tree-card/TreeLocationEditor';
import { TREE_STATUS_META, TREE_STATUSES, type TreeListItem } from '@/types/domain';

const SUCCESS_NOTICE_MS = 4000;

function parseStoredGeometry(raw: string | null | undefined): ParcelGeometry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParcelGeometry;
  } catch {
    return null;
  }
}

export function OfficialMapPage() {
  const [filters, setFilters] = useState<TreeFilters>(EMPTY_TREE_FILTERS);
  const all = useTrees(undefined, { live: true });
  const filtered = useTrees(filters, { live: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [relocateMode, setRelocateMode] = useState(false);
  const [relocateTarget, setRelocateTarget] = useState<RelocateTarget | null>(null);
  const [pendingPosition, setPendingPosition] = useState<LatLng | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [warrantyModalOpen, setWarrantyModalOpen] = useState(false);

  const expiringDecisionTrees = useMemo(() => getExpiringDecisionTrees(all.trees), [all.trees]);

  // Parcel outline + address for the point being added, otherwise for the selected tree.
  const selectedTree = useMemo(
    () => (selectedId ? (all.trees.find((t) => t.id === selectedId) ?? null) : null),
    [all.trees, selectedId],
  );
  const focusPoint = useMemo(
    () => pendingPosition ?? (selectedTree ? { lat: selectedTree.latitude, lng: selectedTree.longitude } : null),
    [pendingPosition, selectedTree],
  );
  const geocode = useReverseGeocode(focusPoint);
  const parcelGeometry = useMemo(
    () => geocode.data?.geometry ?? parseStoredGeometry(selectedTree?.parcel_geometry),
    [geocode.data?.geometry, selectedTree?.parcel_geometry],
  );

  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    setFilters((current) => ({ ...current, address: suggestion.filter_value }));
    setFlyTarget({ lat: suggestion.lat, lng: suggestion.lng, nonce: Date.now() });
  };

  const plantingYears = useMemo(
    () =>
      [...new Set(all.trees.map((t) => t.planting_year).filter((y): y is number => y !== null))].sort(
        (a, b) => b - a,
      ),
    [all.trees],
  );

  useEffect(() => {
    setRelocateMode(false);
    setRelocateTarget(null);
  }, [selectedId]);

  useEffect(() => {
    if (!addMode && !relocateMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddMode(false);
        setRelocateMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addMode, relocateMode]);

  useEffect(() => {
    if (!createdCode) return;
    const timer = setTimeout(() => setCreatedCode(null), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [createdCode]);

  const handleCreated = (tree: TreeListItem) => {
    setPendingPosition(null);
    setSelectedId(tree.id);
    setCreatedCode(tree.code);
    void all.reload();
    void filtered.reload();
  };

  const handleTreeUpdated = () => {
    void all.reload();
    void filtered.reload();
  };

  const handleTreeDeleted = () => {
    setSelectedId(null);
    setRelocateMode(false);
    void all.reload();
    void filtered.reload();
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtry</CardTitle>
          </CardHeader>
          <CardContent>
            <MapFiltersPanel
              filters={filters}
              onChange={setFilters}
              plantingYears={plantingYears}
              onAddressSelect={handleAddressSelect}
            />
          </CardContent>
        </Card>

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
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <MapFilterBar
          shownCount={filtered.trees.length}
          totalCount={all.trees.length}
          loading={filtered.loading}
          addMode={addMode}
          onToggleAddMode={() => {
            setRelocateMode(false);
            setAddMode((m) => !m);
          }}
          decisionAlertCount={expiringDecisionTrees.length}
          onOpenDecisionAlerts={() => setWarrantyModalOpen(true)}
        />

        <div className="relative min-h-0 flex-1">
          <TreeMap
            trees={filtered.trees}
            selectedTreeId={selectedId}
            onTreeClick={addMode || relocateMode ? undefined : (tree) => setSelectedId(tree.id)}
            addMode={addMode || relocateMode}
            pendingPosition={pendingPosition}
            legendClassName="bottom-44"
            onMapClick={
              addMode
                ? (position) => {
                    setAddMode(false);
                    setPendingPosition(position);
                  }
                : relocateMode
                  ? (position) => {
                      setRelocateMode(false);
                      setRelocateTarget({ lat: position.lat, lng: position.lng, nonce: Date.now() });
                    }
                  : undefined
            }
          >
            <ParcelHighlighter geometry={parcelGeometry} />
            <MapFlyTo target={flyTarget} />
            <ViewportStatsWidget trees={filtered.trees} />
          </TreeMap>

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

          {relocateMode && (
            <div className="absolute left-1/2 top-3 z-[1001] flex -translate-x-1/2 items-center gap-3 rounded-full bg-blue-800 py-2 pl-4 pr-2 text-sm font-medium text-white shadow-xl">
              <Crosshair className="size-4 animate-pulse" />
              Kliknij nowe miejsce na mapie dla rośliny {selectedTree?.code ?? ''}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-white hover:bg-white/15"
                onClick={() => setRelocateMode(false)}
              >
                <X />
                Anuluj (Esc)
              </Button>
            </div>
          )}

          {createdCode && !addMode && !relocateMode && (
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
        geocode={pendingPosition ? geocode : undefined}
      />

      <TreeCardSheet
        treeId={selectedId}
        onClose={() => setSelectedId(null)}
        onTreeUpdated={handleTreeUpdated}
        onTreeDeleted={handleTreeDeleted}
        relocating={relocateMode}
        relocateTarget={relocateTarget}
        onToggleRelocate={() => {
          setAddMode(false);
          setRelocateMode((m) => !m);
        }}
      />

      <DecisionWarrantyModal
        open={warrantyModalOpen}
        onClose={() => setWarrantyModalOpen(false)}
        trees={all.trees}
        onTasksGenerated={handleTreeUpdated}
        onSelectTree={(tree) => {
          setSelectedId(tree.id);
          setFlyTarget({ lat: tree.latitude, lng: tree.longitude, nonce: Date.now() });
        }}
      />
    </div>
  );
}
