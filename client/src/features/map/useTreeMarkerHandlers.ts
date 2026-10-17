import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { TreeListItem } from '@/types/domain';

const MARKER_DBLCLICK_ZOOM = 19;
const MARKER_DBLCLICK_FLY_SECONDS = 0.8;
/** A single click waits this long, so the second click of a double click is not swallowed by the opened tree card. */
const SINGLE_CLICK_DELAY_MS = 250;

/**
 * Horizontal parts of the map hidden behind side panels (e.g. the non-modal tree card sheet on the right).
 * Panels covering the map center (centered dialogs) are ignored.
 */
function sidePanelOcclusion(map: L.Map): { left: number; right: number } {
  const mapRect = map.getContainer().getBoundingClientRect();
  const centerX = mapRect.left + mapRect.width / 2;
  let left = 0;
  let right = 0;
  for (const panel of document.querySelectorAll<HTMLElement>('[role="dialog"]')) {
    const rect = panel.getBoundingClientRect();
    const overlapsVertically = rect.bottom > mapRect.top && rect.top < mapRect.bottom;
    if (!overlapsVertically || rect.width === 0) continue;
    if (rect.left >= centerX && rect.left < mapRect.right) right = Math.max(right, mapRect.right - rect.left);
    else if (rect.right <= centerX && rect.right > mapRect.left) left = Math.max(left, rect.right - mapRect.left);
  }
  return { left, right };
}

/** Flies so the plant lands in the middle of the visible part of the map, not behind a side panel. */
function flyToPlant(map: L.Map, tree: TreeListItem) {
  const zoom = Math.max(map.getZoom(), MARKER_DBLCLICK_ZOOM);
  const { left, right } = sidePanelOcclusion(map);
  const plantPoint = map.project([tree.latitude, tree.longitude], zoom);
  const center = map.unproject(plantPoint.add([(right - left) / 2, 0]), zoom);
  map.flyTo(center, zoom, { animate: true, duration: MARKER_DBLCLICK_FLY_SECONDS });
}

/**
 * Event handlers shared by all plant markers: `click` → `onClick(tree)` (e.g. opens the tree card),
 * `dblclick` → smooth `flyTo` over the plant (zoom ≥ 19) without opening the card. Use inside <MapContainer>.
 */
export function useTreeMarkerHandlers(
  tree: TreeListItem,
  onClick?: (tree: TreeListItem) => void,
): L.LeafletEventHandlerFnMap {
  const map = useMap();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClick = () => {
    if (clickTimer.current === null) return false;
    clearTimeout(clickTimer.current);
    clickTimer.current = null;
    return true;
  };

  useEffect(
    () => () => {
      cancelPendingClick();
    },
    [],
  );

  return useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click: () => {
        if (!onClick || cancelPendingClick()) return;
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null;
          onClick(tree);
        }, SINGLE_CLICK_DELAY_MS);
      },
      dblclick: (e) => {
        // Keeps Leaflet's own doubleClickZoom from zooming in on top of the flight.
        L.DomEvent.stopPropagation(e);
        cancelPendingClick();
        flyToPlant(map, tree);
      },
    }),
    [map, onClick, tree],
  );
}
