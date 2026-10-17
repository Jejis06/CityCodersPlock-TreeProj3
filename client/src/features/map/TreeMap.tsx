import 'leaflet/dist/leaflet.css';
import './map.css';
import { useEffect, useMemo, type ReactNode } from 'react';
import { MapContainer, useMap, useMapEvents } from 'react-leaflet';
import { cn } from '@/lib/utils';
import type { TreeListItem } from '@/types/domain';
import { useCadLayer } from './cad/useCadLayer';
import { MapLayers } from './MapLayers';
import { MapLegend } from './MapLegend';
import { MAP_CENTER, MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_ZOOM } from './mapConfig';
import { PendingTreeMarker } from './PendingTreeMarker';
import { TreeMarker } from './TreeMarker';

export interface TreeMapProps {
  trees: TreeListItem[];
  selectedTreeId?: string | null;
  /** Optional set/list of plant IDs highlighted in multi-selection modes. */
  selectedTreeIds?: ReadonlySet<string> | readonly string[];
  onTreeClick?: (tree: TreeListItem) => void;
  onMapClick?: (position: { lat: number; lng: number }) => void;
  /** Crosshair cursor, e.g. "Dodaj roślinę na mapie". */
  addMode?: boolean;
  /** Temporary marker for a plant that is being added (not saved yet). */
  pendingPosition?: { lat: number; lng: number } | null;
  showLegend?: boolean;
  /** Extra classes for the legend, e.g. to lift it above a widget in the bottom-left corner. */
  legendClassName?: string;
  layersCollapsed?: boolean;
  className?: string;
  children?: ReactNode;
}

function MapClickHandler({ onClick }: { onClick: NonNullable<TreeMapProps['onMapClick']> }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Keeps Leaflet in sync when the container changes size (sidebar, tablet frame toggle). */
function MapResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function TreeMap({
  trees,
  selectedTreeId,
  selectedTreeIds,
  onTreeClick,
  onMapClick,
  addMode = false,
  pendingPosition = null,
  showLegend = true,
  legendClassName,
  layersCollapsed = false,
  className,
  children,
}: TreeMapProps) {
  const cad = useCadLayer();
  const multiSelectedSet = useMemo<ReadonlySet<string>>(() => {
    if (!selectedTreeIds) return new Set();
    return selectedTreeIds instanceof Set ? selectedTreeIds : new Set(selectedTreeIds);
  }, [selectedTreeIds]);

  return (
    <div className={cn('relative isolate h-full w-full', addMode && 'tree-map--add-mode', className)}>
      <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} className="h-full w-full">
        <MapLayers cad={cad.data} collapsed={layersCollapsed} />
        <MapResizeWatcher />
        {onMapClick && <MapClickHandler onClick={onMapClick} />}
        {trees.map((tree) => (
          <TreeMarker
            key={tree.id}
            tree={tree}
            selected={tree.id === selectedTreeId}
            multiSelected={multiSelectedSet.has(tree.id)}
            onClick={onTreeClick}
          />
        ))}
        {pendingPosition && <PendingTreeMarker position={pendingPosition} />}
        {children}
      </MapContainer>
      {showLegend && <MapLegend className={legendClassName} />}
    </div>
  );
}
