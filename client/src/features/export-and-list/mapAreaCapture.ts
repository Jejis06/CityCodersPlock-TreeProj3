import L from 'leaflet';
import { BASE_LAYERS, KIEG_OVERLAY, type WmsLayerConfig } from '@/features/map/mapConfig';
import { TREE_STATUS_META, type TreeListItem } from '@/types/domain';
import { distanceMeters } from './lib/geodesy';

/**
 * Renders a map area to an image without screenshotting the DOM: one WMS GetMap per Geoportal layer for the exact
 * bounding box (EPSG:3857, services send `Access-Control-Allow-Origin: *`), then plant markers drawn on a canvas.
 */

export interface AreaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapAreaCaptureOptions {
  /** Index in BASE_LAYERS (0 = ortofotomapa, 1 = TOPO). */
  baseLayerIndex: number;
  withParcels: boolean;
}

export interface MapAreaImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Base layer actually drawn (may differ from the requested one after a fallback), null if none loaded. */
  baseLayerName: string | null;
  warnings: string[];
}

const MAX_SIDE_PX = 2000;
/** ~98% success when half of the requests fail; keeps the wait short before falling back to another base layer. */
const MAX_ATTEMPTS = 6;

export const toAreaBounds = (bounds: L.LatLngBounds): AreaBounds => ({
  south: bounds.getSouth(),
  west: bounds.getWest(),
  north: bounds.getNorth(),
  east: bounds.getEast(),
});

export const isInsideArea = (area: AreaBounds, lat: number, lng: number) =>
  lat >= area.south && lat <= area.north && lng >= area.west && lng <= area.east;

function projectedBox(area: AreaBounds) {
  const sw = L.CRS.EPSG3857.project(L.latLng(area.south, area.west));
  const ne = L.CRS.EPSG3857.project(L.latLng(area.north, area.east));
  return { minX: sw.x, minY: sw.y, maxX: ne.x, maxY: ne.y };
}

function getMapUrl(layer: WmsLayerConfig, box: ReturnType<typeof projectedBox>, width: number, height: number) {
  const version = layer.params.version ?? '1.1.1';
  const url = new URL(layer.url);
  const params: Record<string, string> = {
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: version,
    LAYERS: layer.params.layers,
    STYLES: layer.params.styles ?? '',
    FORMAT: layer.params.format ?? 'image/png',
    TRANSPARENT: layer.params.transparent ? 'TRUE' : 'FALSE',
    [version.startsWith('1.3') ? 'CRS' : 'SRS']: 'EPSG:3857',
    BBOX: [box.minX, box.minY, box.maxX, box.maxY].join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Geoportal ORTO answers 404 for ~half of valid GetMap requests — retry like the tile layer does. */
async function fetchWmsImage(url: URL): Promise<ImageBitmap> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) url.searchParams.set('_retry', String(attempt));
    try {
      const response = await fetch(url, { mode: 'cors' });
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && type.startsWith('image/')) return await createImageBitmap(await response.blob());
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(Math.min(300 * attempt, 2000));
  }
  throw lastError instanceof Error ? lastError : new Error('Brak odpowiedzi WMS');
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  trees: TreeListItem[],
  toPixel: (lat: number, lng: number) => { x: number; y: number },
  scale: number,
) {
  const size = 22 * scale;
  const border = 3 * scale;
  for (const tree of trees) {
    const { x, y } = toPixel(tree.latitude, tree.longitude);
    const color = TREE_STATUS_META[tree.status].color;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8 * scale;
    ctx.shadowOffsetY = 3 * scale;
    ctx.fillStyle = '#ffffff';
    if (tree.type === 'tree') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    } else {
      roundedRect(ctx, x - size / 2, y - size / 2, size, size, 6 * scale);
    }
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = color;
    if (tree.type === 'tree') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2 - border, 0, Math.PI * 2);
    } else {
      roundedRect(ctx, x - size / 2 + border, y - size / 2 + border, size - 2 * border, size - 2 * border, 4 * scale);
    }
    ctx.fill();

    ctx.font = `700 ${12 * scale}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const textWidth = ctx.measureText(tree.code).width;
    const padX = 7 * scale;
    const pillH = 19 * scale;
    const pillX = x - textWidth / 2 - padX;
    const pillY = y + size / 2 + 5 * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, pillX, pillY, textWidth + 2 * padX, pillH, pillH / 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = color;
    roundedRect(ctx, pillX, pillY, textWidth + 2 * padX, pillH, pillH / 2);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.fillText(tree.code, pillX + padX, pillY + pillH / 2 + 0.5 * scale);
  }
}

function niceScaleLength(maxMeters: number): number {
  const exponent = 10 ** Math.floor(Math.log10(maxMeters));
  const candidates = [5, 2, 1].map((m) => m * exponent);
  return candidates.find((c) => c <= maxMeters) ?? exponent;
}

function drawCartographicFrame(ctx: CanvasRenderingContext2D, area: AreaBounds, width: number, height: number, scale: number) {
  const midLat = (area.north + area.south) / 2;
  const metersPerPixel = distanceMeters(midLat, area.west, midLat, area.east) / width;
  const scaleMeters = niceScaleLength((width / 5) * metersPerPixel);
  const scalePx = scaleMeters / metersPerPixel;
  const label = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;

  const x = 18 * scale;
  const y = height - 22 * scale;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  roundedRect(ctx, x - 8 * scale, y - 22 * scale, scalePx + 16 * scale, 34 * scale, 6 * scale);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, scalePx, 4 * scale);
  ctx.fillRect(x, y - 6 * scale, 2 * scale, 10 * scale);
  ctx.fillRect(x + scalePx - 2 * scale, y - 6 * scale, 2 * scale, 10 * scale);
  ctx.font = `600 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y - 9 * scale);

  const nx = width - 30 * scale;
  const ny = 18 * scale;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  roundedRect(ctx, nx - 16 * scale, ny - 6 * scale, 32 * scale, 46 * scale, 6 * scale);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + 9 * scale, ny + 22 * scale);
  ctx.lineTo(nx, ny + 17 * scale);
  ctx.lineTo(nx - 9 * scale, ny + 22 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('N', nx, ny + 36 * scale);
  ctx.textAlign = 'left';

  const attribution = '© GUGiK Geoportal.gov.pl · TREE MONITOR Płock';
  ctx.font = `500 ${10 * scale}px ui-sans-serif, system-ui, sans-serif`;
  const aw = ctx.measureText(attribution).width;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(width - aw - 12 * scale, height - 18 * scale, aw + 12 * scale, 18 * scale);
  ctx.fillStyle = '#334155';
  ctx.fillText(attribution, width - aw - 6 * scale, height - 5 * scale);
}

export async function captureMapArea(
  area: AreaBounds,
  trees: TreeListItem[],
  options: MapAreaCaptureOptions,
): Promise<MapAreaImage> {
  const box = projectedBox(area);
  const ratio = (box.maxX - box.minX) / (box.maxY - box.minY);
  const width = Math.round(ratio >= 1 ? MAX_SIDE_PX : MAX_SIDE_PX * ratio);
  const height = Math.round(ratio >= 1 ? MAX_SIDE_PX / ratio : MAX_SIDE_PX);
  const scale = Math.max(width, height) / 900;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Przeglądarka nie obsługuje canvas 2D.');
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, width, height);

  const warnings: string[] = [];
  const fetchLayer = (layer: WmsLayerConfig) => fetchWmsImage(getMapUrl(layer, box, width, height));
  const requested = BASE_LAYERS[options.baseLayerIndex] ?? BASE_LAYERS[0];
  // Base layers in order of preference: the requested one first, then the others as a fallback.
  const baseCandidates = [requested, ...BASE_LAYERS.filter((l) => l !== requested)].filter(
    (l): l is WmsLayerConfig => l !== undefined,
  );
  const parcelsPromise = options.withParcels ? fetchLayer(KIEG_OVERLAY).then((img) => img, () => null) : null;

  let baseLayerName: string | null = null;
  for (const layer of baseCandidates) {
    try {
      const image = await fetchLayer(layer);
      ctx.drawImage(image, 0, 0, width, height);
      image.close();
      baseLayerName = layer.name;
      break;
    } catch {
      warnings.push(`Usługa „${layer.name}” nie odpowiada (Geoportal zwraca błąd).`);
    }
  }
  if (baseLayerName && baseLayerName !== requested?.name) warnings.push(`Użyto zastępczego podkładu: „${baseLayerName}”.`);

  const parcels = await parcelsPromise;
  if (parcels) {
    ctx.drawImage(parcels, 0, 0, width, height);
    parcels.close();
  } else if (options.withParcels) {
    warnings.push(`Nie udało się pobrać warstwy „${KIEG_OVERLAY.name}”.`);
  }

  const toPixel = (lat: number, lng: number) => {
    const p = L.CRS.EPSG3857.project(L.latLng(lat, lng));
    return {
      x: ((p.x - box.minX) / (box.maxX - box.minX)) * width,
      y: ((box.maxY - p.y) / (box.maxY - box.minY)) * height,
    };
  };
  drawMarkers(ctx, trees.filter((t) => isInsideArea(area, t.latitude, t.longitude)), toPixel, scale);
  drawCartographicFrame(ctx, area, width, height, scale);

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width, height, baseLayerName, warnings };
}
