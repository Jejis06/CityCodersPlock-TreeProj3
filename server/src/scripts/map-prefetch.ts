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

// Whole Płock city bounds (for overview zooms 12..16)
const PLOCK_CITY_BOUNDS = {
  minLat: 52.51,
  maxLat: 52.575,
  minLng: 19.64,
  maxLng: 19.78,
};

// Stary Rynek + Śródmieście core bounds (for high zooms 17..19)
const PLOCK_CORE_BOUNDS = {
  minLat: 52.541,
  maxLat: 52.552,
  minLng: 19.68,
  maxLng: 19.702,
};

function buildTilePlan(maxZoom: number, tileSize = DEFAULT_WMS_TILE_SIZE): TileCoord[] {
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

  for (let z = 12; z <= maxZoom; z++) {
    if (z <= 16) {
      addBounds(z, PLOCK_CITY_BOUNDS);
    } else {
      // High zoom: Stary Rynek / Śródmieście core + neighborhood around every tree in DB
      addBounds(z, PLOCK_CORE_BOUNDS);
      const radius = z === 17 ? 1 : 0;
      for (const t of trees) {
        const center = latLngToTileXY(t.latitude, t.longitude, z, tileSize);
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
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
  const maxZoom = Number.isFinite(maxZoomArg) ? Math.min(Math.max(maxZoomArg, 12), 19) : 18;

  const layers: WmsLayerKey[] = layersArg
    ? layersArg.split(',').filter(isWmsLayerKey)
    : ['basemap', 'kieg', 'orto', 'kiut'];

  const tiles = buildTilePlan(maxZoom, DEFAULT_WMS_TILE_SIZE);

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
    `[map:prefetch] Plan Płock (zoom 12..${maxZoom}, tile 512px): ${
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
