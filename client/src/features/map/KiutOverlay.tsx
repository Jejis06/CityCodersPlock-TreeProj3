import { Zap } from 'lucide-react';
import type { TileLayer } from 'leaflet';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { LayersControl, useMap, useMapEvents } from 'react-leaflet';
import { cn } from '@/lib/utils';
import { GeoportalWms } from './GeoportalWms';
import { KIUT_OVERLAY } from './mapConfig';

const KIUT_LEGEND: { color: string; label: string }[] = [
  { color: '#eab308', label: 'Gaz' },
  { color: '#2563eb', label: 'Wodociąg' },
  { color: '#92400e', label: 'Kanalizacja' },
  { color: '#dc2626', label: 'Prąd' },
];

/** Keeps clicks / wheel on our floating UI from reaching the map (add-mode click, drag, zoom). */
function useIsolatedFromMap<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  return ref;
}

/**
 * KIUT (Krajowa Integracja Uzbrojenia Terenu) overlay: entry in LayersControl,
 * quick toggle button on the map and a colour legend while the layer is visible.
 * Must be rendered inside <LayersControl>.
 */
export function KiutOverlay() {
  const map = useMap();
  const layerRef = useRef<TileLayer.WMS | null>(null);
  const [active, setActive] = useState(false);
  const controlsRef = useIsolatedFromMap<HTMLDivElement>();

  // LayersControl fires overlayadd/overlayremove for every add/remove, whoever triggered it.
  useMapEvents({
    overlayadd: (e) => e.layer === layerRef.current && setActive(true),
    overlayremove: (e) => e.layer === layerRef.current && setActive(false),
  });

  const toggle = () => {
    const layer = layerRef.current;
    if (!layer) return;
    if (map.hasLayer(layer)) map.removeLayer(layer);
    else map.addLayer(layer);
  };

  return (
    <>
      <LayersControl.Overlay name={KIUT_OVERLAY.name}>
        <GeoportalWms ref={layerRef} layer={KIUT_OVERLAY} />
      </LayersControl.Overlay>

      <div ref={controlsRef} className="absolute left-14 top-3 z-[1001] flex flex-col items-start gap-2">
        <button
          type="button"
          aria-pressed={active}
          onClick={toggle}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-lg transition-colors',
            active
              ? 'border-amber-600 bg-amber-500 text-white'
              : 'border-slate-300 bg-white/95 text-slate-700 hover:bg-white',
          )}
          title="Uzbrojenie terenu (KIUT) — widoczne przy dużym przybliżeniu"
        >
          <Zap className="size-4" />
          Uzbrojenie terenu: Rury / Gaz / Prąd
        </button>

        {active && (
          <ul
            aria-label="Legenda uzbrojenia terenu"
            className="flex gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
          >
            {KIUT_LEGEND.map(({ color, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-slate-700">
                <span className="h-1 w-5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
