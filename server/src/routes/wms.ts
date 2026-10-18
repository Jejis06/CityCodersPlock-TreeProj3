import { Router } from 'express';
import { HttpError } from '../lib/http.js';
import {
  bboxToZxy,
  DEFAULT_WMS_TILE_SIZE,
  getOrFetchTile,
  getWmsCacheStats,
  isWmsLayerKey,
} from '../lib/wmsCache.js';

export const wmsRouter = Router();

/**
 * GET /api/wms/stats — summary of locally cached GUGiK tiles in database/wms-cache.db
 */
wmsRouter.get('/stats', (_req, res) => {
  res.json(getWmsCacheStats());
});

/**
 * GET /api/wms/:layer — Local WMS tile endpoint for Leaflet WMSTileLayer.
 * Public (no x-user-id needed for <img> tags).
 * Serves tiles from database/wms-cache.db in <1ms on cache HIT, or fetches from GUGiK
 * through a concurrency-limited, deduplicated queue and persists to SQLite on MISS.
 */
wmsRouter.get('/:layer', async (req, res) => {
  const layerParam = String(req.params.layer ?? '').toLowerCase();
  if (!isWmsLayerKey(layerParam)) {
    throw new HttpError(400, `Nieznana warstwa WMS: ${layerParam}`);
  }

  // Case-insensitive query lookup (Leaflet may send lowercase or uppercase WMS params)
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') {
      query[k.toLowerCase()] = v;
    }
  }

  const rawWidth = Number(query.width ?? DEFAULT_WMS_TILE_SIZE);
  const tileSize = rawWidth === 256 || rawWidth === 512 || rawWidth === 1024 ? rawWidth : DEFAULT_WMS_TILE_SIZE;
  const bbox = query.bbox;

  let z = Number(query.z);
  let x = Number(query.x);
  let y = Number(query.y);

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    if (!bbox) {
      throw new HttpError(400, 'Brak parametru BBOX lub współrzędnych kafelka (z, x, y).');
    }
    const derived = bboxToZxy(bbox, tileSize);
    if (!derived) {
      throw new HttpError(400, 'Nieprawidłowy parametr BBOX.');
    }
    z = derived.z;
    x = derived.x;
    y = derived.y;
  }

  try {
    const tile = await getOrFetchTile({
      layer: layerParam,
      z,
      x,
      y,
      tileSize,
      bboxOverride: bbox,
    });

    res.setHeader('Content-Type', tile.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Tile-Cache', tile.hit ? 'HIT' : 'MISS');
    res.setHeader('X-Tile-Coords', `${z}/${x}/${y}`);
    res.send(tile.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Błąd pobierania kafelka WMS (${layerParam}): ${msg}` });
  }
});
