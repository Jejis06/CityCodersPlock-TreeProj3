import './export-and-list.css';
import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import { TreeMap } from '@/features/map/TreeMap';
import type { TreeListItem } from '@/types/domain';
import type { ListTree } from './inventoryModel';
import { MapAreaPdfSelector } from './MapAreaPdfSelector';

const FOCUS_ZOOM = 19;

/** Flies to the plant chosen with "Pokaż na mapie" (`request` changes on every click, even for the same plant). */
function FocusOnTree({ tree, request }: { tree: ListTree | null; request: number }) {
  const map = useMap();
  useEffect(() => {
    if (!tree) return;
    map.flyTo([tree.latitude, tree.longitude], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.8 });
  }, [map, tree, request]);
  return null;
}

/** Fits the map to the filtered plants whenever the filter result changes. */
function FitToTrees({ trees }: { trees: ListTree[] }) {
  const map = useMap();
  const key = useMemo(() => trees.map((t) => t.id).join(','), [trees]);
  useEffect(() => {
    if (trees.length === 0) return;
    const bounds = trees.map((t) => [t.latitude, t.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
  }, [map, key]); // refit only when the set of plants changes, not on every new array instance
  return null;
}

interface ListMapPanelProps {
  trees: ListTree[];
  focused: ListTree | null;
  focusRequest: number;
  onTreeClick: (tree: ListTree) => void;
  generatedBy: string | null;
}

export function ListMapPanel({ trees, focused, focusRequest, onTreeClick, generatedBy }: ListMapPanelProps) {
  const byId = useMemo(() => new Map(trees.map((t) => [t.id, t])), [trees]);
  const handleClick = (tree: TreeListItem) => {
    const listTree = byId.get(tree.id);
    if (listTree) onTreeClick(listTree);
  };

  return (
    <TreeMap
      trees={trees}
      selectedTreeId={focused?.id ?? null}
      onTreeClick={handleClick}
      showLegend={false}
      layersCollapsed
    >
      <FitToTrees trees={trees} />
      <FocusOnTree tree={focused} request={focusRequest} />
      <MapAreaPdfSelector trees={trees} generatedBy={generatedBy} />
    </TreeMap>
  );
}
