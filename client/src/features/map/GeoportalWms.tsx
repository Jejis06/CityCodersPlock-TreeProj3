import type { TileErrorEvent, TileLayer } from 'leaflet';
import { forwardRef } from 'react';
import { WMSTileLayer } from 'react-leaflet';
import {
  MAP_MAX_NATIVE_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_TILE_SIZE,
  type WmsLayerConfig,
} from './mapConfig';

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

/** One official GUGiK WMS layer served via local cache proxy (/api/wms/:layer) with 512px tiles. */
export const GeoportalWms = forwardRef<TileLayer.WMS, { layer: WmsLayerConfig }>(function GeoportalWms(
  { layer },
  ref,
) {
  return (
    <WMSTileLayer
      ref={ref}
      url={layer.url}
      params={layer.params}
      tileSize={MAP_TILE_SIZE}
      minZoom={MAP_MIN_ZOOM}
      maxNativeZoom={MAP_MAX_NATIVE_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      keepBuffer={4}
      zIndex={layer.zIndex}
      attribution={layer.attribution}
      eventHandlers={wmsEventHandlers}
    />
  );
});
