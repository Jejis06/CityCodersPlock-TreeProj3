import type { GeoJsonObject } from 'geojson';
import type { PathOptions } from 'leaflet';
import { GeoJSON } from 'react-leaflet';
import type { ParcelGeometry } from './useReverseGeocode';

const PARCEL_STYLE: PathOptions = {
  color: '#facc15',
  weight: 3,
  opacity: 1,
  fillColor: '#facc15',
  fillOpacity: 0.15,
  dashArray: '6 4',
  interactive: false,
};

/** Outline of a cadastral parcel (GeoJSON, WGS84). Render inside <MapContainer>. */
export function ParcelHighlighter({ geometry }: { geometry: ParcelGeometry | null }) {
  if (!geometry) return null;
  // `key` forces a redraw: GeoJSON data cannot be swapped on an existing layer.
  return <GeoJSON key={JSON.stringify(geometry.coordinates).slice(0, 200)} data={geometry as GeoJsonObject} style={PARCEL_STYLE} />;
}
