import type { TileErrorEvent } from 'leaflet';
import { LayersControl, WMSTileLayer } from 'react-leaflet';
import { CadLayer } from './cad/CadLayer';
import type { CadLayerData } from './cad/cadTypes';
import { BASE_LAYERS, CAD_OVERLAY_NAME, KIEG_OVERLAY, MAP_MAX_ZOOM, type WmsLayerConfig } from './mapConfig';

const MAX_TILE_RETRIES = 10;

// Geoportal ORTO intermittently answers 404 for valid GetMap requests; a retry usually succeeds.
function retryTile({ tile }: TileErrorEvent) {
  const attempt = Number(tile.dataset.retry ?? '0') + 1;
  if (attempt > MAX_TILE_RETRIES) return;
  tile.dataset.retry = String(attempt);
  const url = new URL(tile.src);
  url.searchParams.set('_retry', String(attempt));
  setTimeout(() => {
    tile.src = url.toString();
  }, Math.min(300 * attempt, 2000));
}

const wmsEventHandlers = { tileerror: retryTile };

function GeoportalWms({ layer }: { layer: WmsLayerConfig }) {
  return (
    <WMSTileLayer
      url={layer.url}
      params={layer.params}
      maxZoom={MAP_MAX_ZOOM}
      zIndex={layer.zIndex}
      attribution={layer.attribution}
      eventHandlers={wmsEventHandlers}
    />
  );
}

interface MapLayersProps {
  cad: CadLayerData;
  collapsed?: boolean;
}

/** Official Geoportal (GUGiK) WMS layers only + local CAD underlay. */
export function MapLayers({ cad, collapsed = false }: MapLayersProps) {
  return (
    <LayersControl position="topright" collapsed={collapsed}>
      {BASE_LAYERS.map((layer) => (
        <LayersControl.BaseLayer key={layer.name} name={layer.name} checked={layer.checked}>
          <GeoportalWms layer={layer} />
        </LayersControl.BaseLayer>
      ))}
      <LayersControl.Overlay name={KIEG_OVERLAY.name} checked={KIEG_OVERLAY.checked}>
        <GeoportalWms layer={KIEG_OVERLAY} />
      </LayersControl.Overlay>
      <LayersControl.Overlay name={CAD_OVERLAY_NAME}>
        <CadLayer data={cad} />
      </LayersControl.Overlay>
    </LayersControl>
  );
}
