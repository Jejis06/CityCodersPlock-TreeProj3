import L, { type LeafletMouseEvent } from 'leaflet';
import { BoxSelect, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Rectangle, useMap } from 'react-leaflet';
import { Button } from '@/components/shared/Button';
import type { ListTree } from './inventoryModel';
import { MapAreaPdfDialog } from './MapAreaPdfDialog';
import { toAreaBounds, type AreaBounds } from './mapAreaCapture';

/** Rectangles smaller than this (screen px) are treated as an accidental click. */
const MIN_SIZE_PX = 12;

const RECTANGLE_STYLE = { color: '#f59e0b', weight: 3, dashArray: '8 6', fillColor: '#fbbf24', fillOpacity: 0.15 };

interface MapAreaPdfSelectorProps {
  /** Plants shown on the map; the ones inside the rectangle go to the PDF. */
  trees: ListTree[];
  generatedBy: string | null;
}

/**
 * Child of <TreeMap>: button "Zaznacz obszar na mapie do PDF" → drag a rectangle with the mouse → export dialog.
 * While drawing, map panning/box-zoom are disabled so the drag draws instead of moving the map.
 */
export function MapAreaPdfSelector({ trees, generatedBy }: MapAreaPdfSelectorProps) {
  const map = useMap();
  const controlRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<L.LatLngBounds | null>(null);
  const [area, setArea] = useState<AreaBounds | null>(null);

  useEffect(() => {
    const element = controlRef.current;
    if (!element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, []);

  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    container.classList.add('map-area-selector--drawing');
    map.dragging.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();

    let start: L.LatLng | null = null;
    let current: L.LatLng | null = null;

    const onDown = (e: LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      start = e.latlng;
      current = e.latlng;
      setDraft(L.latLngBounds(start, current));
    };
    const onMove = (e: LeafletMouseEvent) => {
      if (!start) return;
      current = e.latlng;
      setDraft(L.latLngBounds(start, current));
    };
    const finish = () => {
      if (!start || !current) return;
      const a = map.latLngToContainerPoint(start);
      const b = map.latLngToContainerPoint(current);
      const bounds = L.latLngBounds(start, current);
      start = null;
      current = null;
      if (Math.abs(a.x - b.x) < MIN_SIZE_PX || Math.abs(a.y - b.y) < MIN_SIZE_PX) {
        setDraft(null);
        return;
      }
      setDraft(bounds);
      setArea(toAreaBounds(bounds));
      setActive(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDraft(null);
      setActive(false);
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', finish);
    window.addEventListener('mouseup', finish);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      container.classList.remove('map-area-selector--drawing');
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', finish);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, map]);

  const closeDialog = () => {
    setArea(null);
    setDraft(null);
  };

  return (
    <>
      <div ref={controlRef} className="absolute left-14 top-2.5 z-[1001] flex items-center gap-2">
        <Button
          size="sm"
          variant={active ? 'destructive' : 'default'}
          className="h-9 rounded-full px-4 shadow-lg shadow-slate-900/25 ring-2 ring-white/70"
          onClick={() => {
            setDraft(null);
            setActive((a) => !a);
          }}
        >
          {active ? <X /> : <BoxSelect />}
          {active ? 'Anuluj zaznaczanie (Esc)' : 'Zaznacz obszar na mapie do PDF'}
        </Button>
        {active && (
          <span className="rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            Przytrzymaj lewy przycisk myszy i przeciągnij prostokąt
          </span>
        )}
      </div>

      {draft && <Rectangle bounds={draft} pathOptions={RECTANGLE_STYLE} interactive={false} />}

      <MapAreaPdfDialog area={area} trees={trees} generatedBy={generatedBy} onClose={closeDialog} />
    </>
  );
}
