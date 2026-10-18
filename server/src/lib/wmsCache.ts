import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export type WmsLayerKey = 'basemap' | 'orto' | 'kieg' | 'kiut';

export interface UpstreamWmsLayerDef {
  key: WmsLayerKey;
  upstreamUrl: string;
  hostGroup: 'geoportal' | 'integracja';
  layers: string;
  format: 'image/png' | 'image/jpeg';
  transparent: 'true' | 'false';
  version: '1.1.1' | '1.3.0';
  srsKey: 'srs' | 'crs';
}

export const WMS_LAYER_DEFS: Record<WmsLayerKey, UpstreamWmsLayerDef> = {
  basemap: {
    key: 'basemap',
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/ext/OSM/BaseMap/service',
    hostGroup: 'geoportal',
    layers: 'osm',
    format: 'image/png',
    transparent: 'false',
    version: '1.1.1',
    srsKey: 'srs',
  },
  orto: {
    key: 'orto',
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    hostGroup: 'geoportal',
    layers: 'Raster',
    format: 'image/jpeg',
    transparent: 'false',
    version: '1.3.0',
    srsKey: 'crs',
  },
  kieg: {
    key: 'kieg',
    upstreamUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
    hostGroup: 'integracja',
    layers: 'dzialki,numery_dzialek,budynki',
    format: 'image/png',
    transparent: 'true',
    version: '1.1.1',
    srsKey: 'srs',
  },
  kiut: {
    key: 'kiut',
    upstreamUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
    hostGroup: 'integracja',
    layers:
      'przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_cieplowniczy,przewod_telekomunikacyjny',
    format: 'image/png',
    transparent: 'true',
    version: '1.1.1',
    srsKey: 'srs',
  },
};

export function isWmsLayerKey(value: string): value is WmsLayerKey {
  return value in WMS_LAYER_DEFS;
}

const EARTH_RADIUS = 6378137;
const HALF_CIRCUMFERENCE = Math.PI * EARTH_RADIUS; // 20037508.342789244
const FULL_CIRCUMFERENCE = 2 * HALF_CIRCUMFERENCE; // 40075016.68557849
export const DEFAULT_WMS_TILE_SIZE = 512;

/**
 * Converts Leaflet tile coordinates (z, x, y) for a given tileSize into an EPSG:3857 BBOX string
 * matching L.TileLayer.WMS.prototype.getTileUrl to full floating-point precision.
 */
export function zxyToBbox(z: number, x: number, y: number, tileSize = DEFAULT_WMS_TILE_SIZE): string {
  const worldPixels = 256 * Math.pow(2, z);
  const minX = (x * tileSize) / worldPixels * FULL_CIRCUMFERENCE - HALF_CIRCUMFERENCE;
  const maxX = ((x + 1) * tileSize) / worldPixels * FULL_CIRCUMFERENCE - HALF_CIRCUMFERENCE;
  const maxY = HALF_CIRCUMFERENCE - (y * tileSize) / worldPixels * FULL_CIRCUMFERENCE;
  const minY = HALF_CIRCUMFERENCE - ((y + 1) * tileSize) / worldPixels * FULL_CIRCUMFERENCE;
  return `${minX},${minY},${maxX},${maxY}`;
}

/**
 * Recovers exact integer tile coordinates (z, x, y) from an EPSG:3857 BBOX string sent by Leaflet.
 */
export function bboxToZxy(
  bboxStr: string,
  tileSize = DEFAULT_WMS_TILE_SIZE,
): { z: number; x: number; y: number } | null {
  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, maxX, maxY] = parts;
  if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) return null;
  const span = maxX - minX;
  if (span <= 0) return null;
  const gridN = Math.round(FULL_CIRCUMFERENCE / span);
  if (gridN <= 0) return null;
  const x = Math.round(((minX + HALF_CIRCUMFERENCE) / FULL_CIRCUMFERENCE) * gridN);
  const y = Math.round(((HALF_CIRCUMFERENCE - maxY) / FULL_CIRCUMFERENCE) * gridN);
  const z = Math.round(Math.log2(gridN * (tileSize / 256)));
  return { z, x, y };
}

/**
 * Converts WGS84 (lat, lng) to Leaflet tile grid coordinates (x, y) at zoom `z` for `tileSize`.
 */
export function latLngToTileXY(
  lat: number,
  lng: number,
  z: number,
  tileSize = DEFAULT_WMS_TILE_SIZE,
): { x: number; y: number } {
  const worldPixels = 256 * Math.pow(2, z);
  const gridN = worldPixels / tileSize;
  const x = Math.floor(((lng + 180) / 360) * gridN);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * gridN);
  return { x, y };
}

// --- Persistent SQLite Tile Cache (database/wms-cache.db) ---

mkdirSync(path.dirname(config.wmsCacheDbPath), { recursive: true });
const wmsDb = new DatabaseSync(config.wmsCacheDbPath);
wmsDb.exec('PRAGMA journal_mode = WAL;');
wmsDb.exec('PRAGMA synchronous = NORMAL;');
wmsDb.exec('PRAGMA busy_timeout = 5000;');
wmsDb.exec(`
  CREATE TABLE IF NOT EXISTS wms_tiles (
    layer TEXT NOT NULL,
    z INTEGER NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    tile_size INTEGER NOT NULL DEFAULT 512,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (layer, z, x, y, tile_size)
  ) STRICT;
`);

const selectTileStmt = wmsDb.prepare(`
  SELECT content_type, data
  FROM wms_tiles
  WHERE layer = :layer AND z = :z AND x = :x AND y = :y AND tile_size = :tileSize
`);

const checkTileStmt = wmsDb.prepare(`
  SELECT 1
  FROM wms_tiles
  WHERE layer = :layer AND z = :z AND x = :x AND y = :y AND tile_size = :tileSize
`);

const insertTileStmt = wmsDb.prepare(`
  INSERT OR REPLACE INTO wms_tiles (layer, z, x, y, tile_size, content_type, data, created_at)
  VALUES (:layer, :z, :x, :y, :tileSize, :contentType, :data, :createdAt)
`);

export function hasCachedTile(
  layer: WmsLayerKey,
  z: number,
  x: number,
  y: number,
  tileSize = DEFAULT_WMS_TILE_SIZE,
): boolean {
  const row = checkTileStmt.get({ layer, z, x, y, tileSize });
  return Boolean(row);
}

export interface TileResult {
  contentType: string;
  data: Buffer;
  hit: boolean;
}

export function buildUpstreamWmsUrl(
  def: UpstreamWmsLayerDef,
  bbox: string,
  tileSize = DEFAULT_WMS_TILE_SIZE,
): string {
  const params = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    layers: def.layers,
    styles: '',
    format: def.format,
    transparent: def.transparent,
    version: def.version,
    width: String(tileSize),
    height: String(tileSize),
    [def.srsKey]: 'EPSG:3857',
    bbox,
  });
  return `${def.upstreamUrl}?${params.toString()}`;
}

// Per-host concurrency limiter so GUGiK never rate-limits our IP
class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const hostLimiters: Record<'geoportal' | 'integracja', ConcurrencyLimiter> = {
  geoportal: new ConcurrencyLimiter(6),
  integracja: new ConcurrencyLimiter(6),
};

const inFlight = new Map<string, Promise<TileResult>>();

async function fetchUpstreamWithRetry(
  def: UpstreamWmsLayerDef,
  bbox: string,
  tileSize: number,
  maxRetries = 6,
): Promise<{ contentType: string; data: Buffer }> {
  const url = buildUpstreamWmsUrl(def, bbox, tileSize);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await hostLimiters[def.hostGroup].run(async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) TreeMonitorPlock/1.0',
            Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) {
          throw new Error(`Upstream HTTP ${res.status} for ${def.key}`);
        }
        const contentType = ((res.headers.get('content-type') ?? '').split(';')[0] ?? '')
          .trim()
          .toLowerCase();
        const arrayBuf = await res.arrayBuffer();
        const data = Buffer.from(arrayBuf);

        // Guard against WMS XML ServiceException returned with HTTP 200
        if (!contentType.startsWith('image/') || data.byteLength < 80) {
          throw new Error(`Invalid WMS response content-type="${contentType}" (${data.byteLength}B) for ${def.key}`);
        }
        return { contentType, data };
      });
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = Math.min(250 * attempt, 1500);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch WMS tile for ${def.key}`);
}

export async function getOrFetchTile(params: {
  layer: WmsLayerKey;
  z: number;
  x: number;
  y: number;
  tileSize?: number;
  bboxOverride?: string;
}): Promise<TileResult> {
  const tileSize = params.tileSize ?? DEFAULT_WMS_TILE_SIZE;
  const { layer, z, x, y } = params;

  const cached = selectTileStmt.get({ layer, z, x, y, tileSize }) as
    | { content_type: string; data: Uint8Array }
    | undefined;

  if (cached) {
    return {
      contentType: cached.content_type,
      data: Buffer.from(cached.data.buffer, cached.data.byteOffset, cached.data.byteLength),
      hit: true,
    };
  }

  const key = `${layer}:${z}:${x}:${y}:${tileSize}`;
  const existingPromise = inFlight.get(key);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<TileResult> => {
    try {
      const def = WMS_LAYER_DEFS[layer];
      const bbox = params.bboxOverride ?? zxyToBbox(z, x, y, tileSize);
      const fetched = await fetchUpstreamWithRetry(def, bbox, tileSize);
      insertTileStmt.run({
        layer,
        z,
        x,
        y,
        tileSize,
        contentType: fetched.contentType,
        data: fetched.data,
        createdAt: new Date().toISOString(),
      });
      return {
        contentType: fetched.contentType,
        data: fetched.data,
        hit: false,
      };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export interface WmsLayerCacheStat {
  layer: string;
  tiles: number;
  total_bytes: number;
  min_zoom: number;
  max_zoom: number;
}

export function getWmsCacheStats(): {
  dbPath: string;
  layers: WmsLayerCacheStat[];
  totalTiles: number;
  totalBytes: number;
} {
  const rows = wmsDb
    .prepare(
      `SELECT layer, COUNT(*) AS tiles, COALESCE(SUM(LENGTH(data)), 0) AS total_bytes, MIN(z) AS min_zoom, MAX(z) AS max_zoom
       FROM wms_tiles
       GROUP BY layer
       ORDER BY layer`,
    )
    .all() as unknown as WmsLayerCacheStat[];

  const totalTiles = rows.reduce((acc, r) => acc + Number(r.tiles), 0);
  const totalBytes = rows.reduce((acc, r) => acc + Number(r.total_bytes), 0);
  return {
    dbPath: config.wmsCacheDbPath,
    layers: rows,
    totalTiles,
    totalBytes,
  };
}
