import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export interface FlyTarget {
  lat: number;
  lng: number;
  zoom?: number;
  /** Change the nonce to fly again to the same coordinates. */
  nonce: number;
}

const DEFAULT_FLY_ZOOM = 19;

/** Centers the map (flyTo) whenever `target` changes. Render inside <MapContainer>. */
export function MapFlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? DEFAULT_FLY_ZOOM);
  }, [map, target]);
  return null;
}
