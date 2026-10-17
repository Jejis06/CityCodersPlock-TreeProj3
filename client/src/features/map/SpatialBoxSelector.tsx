import L, { type LeafletMouseEvent } from 'leaflet';
import { useEffect, useState } from 'react';
import { Rectangle, useMap } from 'react-leaflet';
import type { TreeListItem } from '@/types/domain';

/** Rectangles smaller than this (screen px) are ignored as accidental clicks. */
const MIN_BOX_SIZE_PX = 10;

const SELECTION_BOX_STYLE: L.PathOptions = {
  color: '#4f46e5',
  weight: 2.5,
  dashArray: '6 4',
  fillColor: '#6366f1',
  fillOpacity: 0.18,
};

export interface SpatialBoxSelectorProps {
  /** Whether spatial box drawing mode is currently active. */
  active: boolean;
  /** Visible trees on the map that can be matched by the drawn rectangle. */
  trees: TreeListItem[];
  /** Called with the IDs of all visible trees inside the drawn rectangle. */
  onSelectTreesInBox: (treeIds: string[]) => void;
}

/**
 * Child of `<TreeMap>`: enables drawing a selection rectangle on the Leaflet map
 * when `active` is true, and selects all visible plants inside the drawn bounds.
 */
export function SpatialBoxSelector({ active, trees, onSelectTreesInBox }: SpatialBoxSelectorProps) {
  const map = useMap();
  const [draftBounds, setDraftBounds] = useState<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!active) {
      setDraftBounds(null);
      return;
    }

    const container = map.getContainer();
    container.classList.add('tree-map--spatial-select');
    map.dragging.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();

    let startPoint: L.LatLng | null = null;
    let currentPoint: L.LatLng | null = null;

    const handleMouseDown = (e: LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      startPoint = e.latlng;
      currentPoint = e.latlng;
      setDraftBounds(L.latLngBounds(startPoint, currentPoint));
    };

    const handleMouseMove = (e: LeafletMouseEvent) => {
      if (!startPoint) return;
      currentPoint = e.latlng;
      setDraftBounds(L.latLngBounds(startPoint, currentPoint));
    };

    const finishDrawing = () => {
      if (!startPoint || !currentPoint) return;
      const p1 = map.latLngToContainerPoint(startPoint);
      const p2 = map.latLngToContainerPoint(currentPoint);
      const bounds = L.latLngBounds(startPoint, currentPoint);
      startPoint = null;
      currentPoint = null;
      setDraftBounds(null);

      if (Math.abs(p1.x - p2.x) < MIN_BOX_SIZE_PX && Math.abs(p1.y - p2.y) < MIN_BOX_SIZE_PX) {
        return;
      }

      const matchedIds = trees
        .filter((tree) => bounds.contains([tree.latitude, tree.longitude]))
        .map((tree) => tree.id);

      if (matchedIds.length > 0) {
        onSelectTreesInBox(matchedIds);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && startPoint) {
        startPoint = null;
        currentPoint = null;
        setDraftBounds(null);
      }
    };

    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', finishDrawing);
    window.addEventListener('mouseup', finishDrawing);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.classList.remove('tree-map--spatial-select');
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', finishDrawing);
      window.removeEventListener('mouseup', finishDrawing);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, map, onSelectTreesInBox, trees]);

  if (!draftBounds) return null;

  return <Rectangle bounds={draftBounds} pathOptions={SELECTION_BOX_STYLE} interactive={false} />;
}
