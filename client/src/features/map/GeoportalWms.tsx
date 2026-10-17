import type { TileErrorEvent } from 'leaflet';
import { forwardRef } from 'react';
import type { TileLayer } from 'leaflet';
import { WMSTileLayer } from 'react-leaflet';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, type WmsLayerConfig } from './mapConfig';

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

/** One official GUGiK WMS layer (with tile retry). Shared by MapLayers and feature overlays. */
export const GeoportalWms = forwardRef<TileLayer.WMS, { layer: WmsLayerConfig }>(function GeoportalWms(
  { layer },
  ref,
) {
  return (
    <WMSTileLayer
      ref={ref}
      url={layer.url}
      params={layer.params}
      minZoom={MAP_MIN_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      zIndex={layer.zIndex}
      attribution={layer.attribution}
      eventHandlers={wmsEventHandlers}
    />
  );
});
