import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
} from 'dxf-parser';
import type { GeoJsonObject } from 'geojson';
import type { LatLngTuple } from 'leaflet';
import { STARY_RYNEK_BOUNDS } from '../mapConfig';
import type { CadLayerData, CadShape } from './cadTypes';

export const CAD_ACCEPT = '.dxf,.geojson,.json,.png,.jpg,.jpeg,.webp';

const RASTER_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);
const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

type RawShape =
  | { kind: 'polyline'; points: IPoint[]; closed: boolean }
  | { kind: 'circle'; center: IPoint; radius: number };

export async function parseCadFile(file: File): Promise<CadLayerData> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (RASTER_EXT.has(ext)) {
    return { source: 'raster', fileName: file.name, url: URL.createObjectURL(file) };
  }
  if (ext === 'geojson' || ext === 'json') {
    return { source: 'geojson', fileName: file.name, data: parseGeoJson(await file.text()) };
  }
  if (ext === 'dxf') {
    return { source: 'vector', fileName: file.name, shapes: parseDxf(await file.text()) };
  }
  throw new Error(`Nieobsługiwany format pliku: .${ext}. Dozwolone: ${CAD_ACCEPT}`);
}

function parseGeoJson(text: string): GeoJsonObject {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('type' in data) || typeof data.type !== 'string') {
    throw new Error('Plik nie jest poprawnym GeoJSON-em.');
  }
  return data as GeoJsonObject;
}

function parseDxf(text: string): CadShape[] {
  const dxf = new DxfParser().parseSync(text);
  const raw = (dxf?.entities ?? []).flatMap(toRawShapes);
  if (raw.length === 0) {
    throw new Error('Plik DXF nie zawiera obsługiwanych encji (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC).');
  }
  return fitToStaryRynek(raw);
}

function toRawShapes(entity: IEntity): RawShape[] {
  switch (entity.type) {
    case 'LINE': {
      const { vertices } = entity as ILineEntity;
      return vertices.length >= 2 ? [{ kind: 'polyline', points: vertices, closed: false }] : [];
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const e = entity as ILwpolylineEntity | IPolylineEntity;
      return e.vertices.length >= 2 ? [{ kind: 'polyline', points: e.vertices, closed: Boolean(e.shape) }] : [];
    }
    case 'CIRCLE': {
      const { center, radius } = entity as ICircleEntity;
      return [{ kind: 'circle', center, radius }];
    }
    case 'ARC': {
      const { center, radius, startAngle, endAngle } = entity as IArcEntity;
      const sweep = endAngle > startAngle ? endAngle - startAngle : endAngle + 2 * Math.PI - startAngle;
      const steps = 24;
      const points = Array.from({ length: steps + 1 }, (_, i) => {
        const angle = startAngle + (sweep * i) / steps;
        return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z: 0 };
      });
      return [{ kind: 'polyline', points, closed: false }];
    }
    default:
      return [];
  }
}

/** Simulated georeferencing: scales CAD units uniformly into the Stary Rynek frame. */
function fitToStaryRynek(shapes: RawShape[]): CadShape[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of shapes) {
    if (s.kind === 'circle') {
      extend(s.center.x - s.radius, s.center.y - s.radius);
      extend(s.center.x + s.radius, s.center.y + s.radius);
    } else {
      s.points.forEach((p) => extend(p.x, p.y));
    }
  }

  const [[south, west], [north, east]] = STARY_RYNEK_BOUNDS;
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const metersPerDegLng = METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((centerLat * Math.PI) / 180);
  const frameWidthM = (east - west) * metersPerDegLng;
  const frameHeightM = (north - south) * METERS_PER_DEG_LAT;

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const metersPerUnit = Math.min(frameWidthM / width, frameHeightM / height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const toLatLng = (p: IPoint): LatLngTuple => [
    centerLat + ((p.y - cy) * metersPerUnit) / METERS_PER_DEG_LAT,
    centerLng + ((p.x - cx) * metersPerUnit) / metersPerDegLng,
  ];

  return shapes.map((s) =>
    s.kind === 'circle'
      ? { kind: 'circle', center: toLatLng(s.center), radiusMeters: s.radius * metersPerUnit }
      : { kind: 'polyline', points: s.points.map(toLatLng), closed: s.closed },
  );
}
