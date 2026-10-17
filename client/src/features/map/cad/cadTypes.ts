import type { GeoJsonObject } from 'geojson';
import type { LatLngTuple } from 'leaflet';

export type CadShape =
  | { kind: 'polyline'; points: LatLngTuple[]; closed: boolean }
  | { kind: 'circle'; center: LatLngTuple; radiusMeters: number };

export type CadLayerData =
  | { source: 'demo' }
  | { source: 'vector'; fileName: string; shapes: CadShape[] }
  | { source: 'geojson'; fileName: string; data: GeoJsonObject }
  | { source: 'raster'; fileName: string; url: string };
