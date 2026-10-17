import { CheckCircle2, Crosshair, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { StatusDot } from '@/components/shared/StatusDot';
import { AddTreeDialog, type LatLng } from '@/features/map/AddTreeDialog';
import { CursorModeToolbar, type CursorMode } from '@/features/map/CursorModeToolbar';
import { MapFilterBar } from '@/features/map/MapFilterBar';
import { MapFiltersPanel } from '@/features/map/MapFiltersPanel';
import { MapFlyTo, type FlyTarget } from '@/features/map/MapFlyTo';
import { ParcelHighlighter } from '@/features/map/ParcelHighlighter';
import { SpatialBoxSelector } from '@/features/map/SpatialBoxSelector';
import { EMPTY_TREE_FILTERS, type TreeFilters } from '@/features/map/treeFilters';
import { TreeMap } from '@/features/map/TreeMap';
import {
  useReverseGeocode,
  type AddressSuggestion,
  type ParcelGeometry,
} from '@/features/map/useReverseGeocode';
import { useTrees } from '@/features/map/useTrees';
import { ViewportStatsWidget } from '@/features/map/ViewportStatsWidget';
import { BulkSelectionDrawer } from '@/features/tree-card/BulkSelectionDrawer';
import {
  DecisionWarrantyModal,
  getExpiringDecisionTrees,
} from '@/features/tree-card/DecisionWarrantyModal';
import { TreeCardSheet } from '@/features/tree-card/TreeCardSheet';
import type { RelocateTarget } from '@/features/tree-card/TreeLocationEditor';
import { TREE_STATUS_META, TREE_STATUSES, type TreeListItem } from '@/types/domain';

const SUCCESS_NOTICE_MS = 4000;
const PLANT_SEARCH_ZOOM = 20;

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
  const [cursorMode, setCursorMode] = useState<CursorMode>('single');
  const [selectedTreeIds, setSelectedTreeIds] = useState<string[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [relocateMode, setRelocateMode] = useState(false);
  const [relocateTarget, setRelocateTarget] = useState<RelocateTarget | null>(null);
  const [pendingPosition, setPendingPosition] = useState<LatLng | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [warrantyModalOpen, setWarrantyModalOpen] = useState(false);

  const isMultiMode = cursorMode !== 'single';

  const selectedTrees = useMemo(() => {
    if (selectedTreeIds.length === 0) return [];
    const byId = new Map(all.trees.map((t) => [t.id, t]));
    return selectedTreeIds.map((id) => byId.get(id)).filter((t): t is TreeListItem => Boolean(t));
  }, [all.trees, selectedTreeIds]);

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

  const handleCursorModeChange = useCallback((nextMode: CursorMode) => {
    setCursorMode(nextMode);
    setAddMode(false);
    setRelocateMode(false);
    if (nextMode === 'single') {
      setSelectedTreeIds([]);
    } else {
      setSelectedId(null);
    }
  }, []);

  const handleToggleTreeSelection = useCallback((tree: TreeListItem) => {
    setSelectedTreeIds((prev) =>
      prev.includes(tree.id) ? prev.filter((id) => id !== tree.id) : [...prev, tree.id],
    );
  }, []);

  const handleSelectTreesInBox = useCallback((ids: string[]) => {
    setSelectedTreeIds((prev) => [...new Set([...prev, ...ids])]);
  }, []);

  const handleRemoveSelectedTree = useCallback((treeId: string) => {
    setSelectedTreeIds((prev) => prev.filter((id) => id !== treeId));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedTreeIds([]);
  }, []);

  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    setFilters((current) => ({ ...current, address: suggestion.filter_value }));
    setFlyTarget({
      lat: suggestion.lat,
      lng: suggestion.lng,
      zoom: suggestion.source === 'plant' ? PLANT_SEARCH_ZOOM : undefined,
      nonce: Date.now(),
    });
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
    setCursorMode('single');
    setSelectedTreeIds([]);
    setSelectedId(tree.id);
    setCreatedCode(tree.code);
    void all.reload();
    void filtered.reload();
  };

  const handleTreeUpdated = useCallback(() => {
    void all.reload();
    void filtered.reload();
  }, [all, filtered]);

  const handleTreeDeleted = (deletedId: string) => {
    setSelectedId(null);
    setSelectedTreeIds((prev) => prev.filter((id) => id !== deletedId));
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
        >
          <CursorModeToolbar
            mode={cursorMode}
            onModeChange={handleCursorModeChange}
            selectedCount={selectedTrees.length}
            onClearSelection={handleClearSelection}
            disabled={addMode || relocateMode}
          />
        </MapFilterBar>

        <div className="relative min-h-0 flex-1">
          <TreeMap
            trees={filtered.trees}
            selectedTreeId={cursorMode === 'single' ? selectedId : null}
            selectedTreeIds={isMultiMode ? selectedTreeIds : undefined}
            onTreeClick={
              addMode || relocateMode
                ? undefined
                : cursorMode === 'single'
                  ? (tree) => setSelectedId(tree.id)
                  : handleToggleTreeSelection
            }
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
            <SpatialBoxSelector
              active={cursorMode === 'spatial_box' && !addMode && !relocateMode}
              trees={filtered.trees}
              onSelectTreesInBox={handleSelectTreesInBox}
            />
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
        treeId={cursorMode === 'single' ? selectedId : null}
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

      <BulkSelectionDrawer
        trees={isMultiMode ? selectedTrees : []}
        onRemoveTree={handleRemoveSelectedTree}
        onClearSelection={handleClearSelection}
        onFocusTree={(tree) =>
          setFlyTarget({
            lat: tree.latitude,
            lng: tree.longitude,
            zoom: PLANT_SEARCH_ZOOM,
            nonce: Date.now(),
          })
        }
        onTasksCreated={handleTreeUpdated}
      />

      <DecisionWarrantyModal
        open={warrantyModalOpen}
        onClose={() => setWarrantyModalOpen(false)}
        trees={all.trees}
        onTasksGenerated={handleTreeUpdated}
        onSelectTree={(tree) => {
          setCursorMode('single');
          setSelectedTreeIds([]);
          setSelectedId(tree.id);
          setFlyTarget({ lat: tree.latitude, lng: tree.longitude, nonce: Date.now() });
        }}
      />
    </div>
  );
}
