import { queryAll } from '../lib/db.js';
import {
  DEFAULT_WMS_TILE_SIZE,
  getOrFetchTile,
  getWmsCacheStats,
  hasCachedTile,
  isWmsLayerKey,
  latLngToTileXY,
  type WmsLayerKey,
} from '../lib/wmsCache.js';

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

// Whole Płock city bounds (for overview zooms 10..16)
const PLOCK_CITY_BOUNDS = {
  minLat: 52.505,
  maxLat: 52.58,
  minLng: 19.635,
  maxLng: 19.785,
};

// Full Płock urban belt (Stare Miasto, Śródmieście, Winiary, Kostrogaj, Podolszyce, Radziwie) for max detail zooms 17..18
const PLOCK_URBAN_BOUNDS = {
  minLat: 52.527,
  maxLat: 52.562,
  minLng: 19.665,
  maxLng: 19.772,
};

function buildTilePlan(maxZoom: number, fullCityHighZoom: boolean, tileSize = DEFAULT_WMS_TILE_SIZE): TileCoord[] {
  let trees: Array<{ latitude: number; longitude: number }> = [];
  try {
    trees = queryAll<{ latitude: number; longitude: number }>('SELECT latitude, longitude FROM trees');
  } catch {
    trees = [{ latitude: 52.5463, longitude: 19.6885 }];
  }

  const coords: TileCoord[] = [];
  const seen = new Set<string>();

  const addTile = (z: number, x: number, y: number) => {
    const key = `${z}:${x}:${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    coords.push({ z, x, y });
  };

  const addBounds = (z: number, b: typeof PLOCK_CITY_BOUNDS) => {
    const nw = latLngToTileXY(b.maxLat, b.minLng, z, tileSize);
    const se = latLngToTileXY(b.minLat, b.maxLng, z, tileSize);
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) {
        addTile(z, x, y);
      }
    }
  };

  for (let z = 10; z <= maxZoom; z++) {
    if (z <= 16) {
      addBounds(z, PLOCK_CITY_BOUNDS);
    } else {
      addBounds(z, fullCityHighZoom ? PLOCK_CITY_BOUNDS : PLOCK_URBAN_BOUNDS);
      for (const t of trees) {
        const center = latLngToTileXY(t.latitude, t.longitude, z, tileSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            addTile(z, center.x + dx, center.y + dy);
          }
        }
      }
    }
  }

  return coords;
}

async function main() {
  const args = process.argv.slice(2);
  const layersArg = args.find((a) => a.startsWith('--layers='))?.split('=')[1];
  const maxZoomArg = Number(args.find((a) => a.startsWith('--max-zoom='))?.split('=')[1] ?? 18);
  const maxZoom = Number.isFinite(maxZoomArg) ? Math.min(Math.max(maxZoomArg, 10), 19) : 18;
  const fullCityHighZoom = args.includes('--full-bounds');

  const layers: WmsLayerKey[] = layersArg
    ? layersArg.split(',').filter(isWmsLayerKey)
    : ['basemap', 'kieg', 'orto', 'kiut'];

  const tiles = buildTilePlan(maxZoom, fullCityHighZoom, DEFAULT_WMS_TILE_SIZE);

  // Build tasks list (skip KIUT at low zooms < 17 where GUGiK renders empty tiles anyway)
  const jobs: Array<{ layer: WmsLayerKey; z: number; x: number; y: number }> = [];
  let alreadyCached = 0;

  for (const layer of layers) {
    for (const t of tiles) {
      if (layer === 'kiut' && t.z < 17) continue;
      if (hasCachedTile(layer, t.z, t.x, t.y, DEFAULT_WMS_TILE_SIZE)) {
        alreadyCached++;
      } else {
        jobs.push({ layer, ...t });
      }
    }
  }

  console.log(
    `[map:prefetch] Plan Płock (zoom 10..${maxZoom}, tile 512px): ${
      jobs.length + alreadyCached
    } kafelków łącznie (${alreadyCached} już w lokalnej bazie, ${jobs.length} do pobrania).`,
  );

  if (jobs.length === 0) {
    const stats = getWmsCacheStats();
    console.log(
      `[map:prefetch] Wszystkie kafelki są już pobrane! Łącznie w cache: ${stats.totalTiles} szt. (${(
        stats.totalBytes /
        (1024 * 1024)
      ).toFixed(1)} MB).`,
    );
    return;
  }

  let completed = 0;
  let failed = 0;
  const startedAt = Date.now();

  // Process with concurrency of 8 (the internal hostLimiters in wmsCache cap each GUGiK host at 6)
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      const job = jobs[idx];
      if (!job) break;
      try {
        await getOrFetchTile({
          layer: job.layer,
          z: job.z,
          x: job.x,
          y: job.y,
          tileSize: DEFAULT_WMS_TILE_SIZE,
        });
        completed++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[map:prefetch] Błąd ${job.layer} ${job.z}/${job.x}/${job.y}: ${msg}`);
      }

      const done = completed + failed;
      if (done % 25 === 0 || done === jobs.length) {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        const pct = ((done / jobs.length) * 100).toFixed(1);
        console.log(
          `[map:prefetch] Postęp: ${done}/${jobs.length} (${pct}%) | pobrano: ${completed}, błędy: ${failed} | czas: ${elapsedSec}s`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const stats = getWmsCacheStats();
  console.log(
    `[map:prefetch] Gotowe! Lokalna baza kafelków (${stats.dbPath}): ${stats.totalTiles} kafelków (${(
      stats.totalBytes /
      (1024 * 1024)
    ).toFixed(1)} MB).`,
  );
}

main().catch((err) => {
  console.error('[map:prefetch] Krytyczny błąd:', err);
  process.exit(1);
});
