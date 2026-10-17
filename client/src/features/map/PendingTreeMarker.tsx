import L from 'leaflet';
import { Marker } from 'react-leaflet';

const pendingIcon = L.divIcon({
  className: 'tree-marker-icon',
  html: '<div class="tree-marker-pending"><span class="tree-marker-pending__dot"></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Temporary marker showing where a new plant is being added. */
export function PendingTreeMarker({ position }: { position: { lat: number; lng: number } }) {
  return <Marker position={[position.lat, position.lng]} icon={pendingIcon} interactive={false} zIndexOffset={2000} />;
}
