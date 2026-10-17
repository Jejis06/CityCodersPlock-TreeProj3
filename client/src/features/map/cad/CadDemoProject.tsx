import L, { type LatLngTuple } from 'leaflet';
import { Circle, CircleMarker, Marker, Polygon, Polyline } from 'react-leaflet';
import { STARY_RYNEK_BOUNDS } from '../mapConfig';

const CAD_CYAN = '#22d3ee';
const CAD_MAGENTA = '#f0abfc';
const CAD_YELLOW = '#fde047';

const [[S, W], [N, E]] = STARY_RYNEK_BOUNDS;
const lat = (t: number) => S + (N - S) * t;
const lng = (t: number) => W + (E - W) * t;

const outline: LatLngTuple[] = [
  [S, W],
  [S, E],
  [N, E],
  [N, W],
];

const paths: LatLngTuple[][] = [
  [
    [lat(0.5), lng(0)],
    [lat(0.5), lng(1)],
  ],
  [
    [lat(0), lng(0.5)],
    [lat(1), lng(0.5)],
  ],
];

const plannedTrees: LatLngTuple[] = [0.12, 0.31, 0.69, 0.88].flatMap((t) => [
  [lat(0.1), lng(t)] as LatLngTuple,
  [lat(0.9), lng(t)] as LatLngTuple,
  [lat(t), lng(0.08)] as LatLngTuple,
  [lat(t), lng(0.92)] as LatLngTuple,
]);

const dimensionLine: LatLngTuple[] = [
  [S - (N - S) * 0.08, W],
  [S - (N - S) * 0.08, E],
];

function cadLabel(text: string) {
  return L.divIcon({ className: 'cad-label-icon', html: `<span class="cad-label">${text}</span>`, iconSize: [0, 0] });
}

const widthMeters = L.latLng(S, W).distanceTo(L.latLng(S, E));

const titleIcon = cadLabel('PROJEKT ZIELENI · STARY RYNEK · ZZ-01.dxf');
const dimensionIcon = cadLabel(`≈ ${widthMeters.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} m`);

/** Simulated design drawing imported from a local DXF (default content of the CAD overlay). */
export function CadDemoProject() {
  return (
    <>
      <Polygon
        positions={outline}
        pathOptions={{ color: CAD_CYAN, weight: 2, dashArray: '10 6', fillColor: CAD_CYAN, fillOpacity: 0.06 }}
      />
      {paths.map((p, i) => (
        <Polyline key={i} positions={p} pathOptions={{ color: CAD_YELLOW, weight: 4, opacity: 0.8 }} />
      ))}
      <Circle
        center={[lat(0.5), lng(0.5)]}
        radius={7}
        pathOptions={{ color: CAD_CYAN, weight: 2, fillOpacity: 0.15 }}
      />
      {plannedTrees.map((position, i) => (
        <Circle
          key={i}
          center={position}
          radius={2.5}
          pathOptions={{ color: CAD_MAGENTA, weight: 2, dashArray: '3 3', fillOpacity: 0.1 }}
        />
      ))}
      {plannedTrees.map((position, i) => (
        <CircleMarker key={`c${i}`} center={position} radius={1.5} pathOptions={{ color: CAD_MAGENTA, weight: 2 }} />
      ))}
      <Polyline positions={dimensionLine} pathOptions={{ color: CAD_CYAN, weight: 1.5, dashArray: '2 4' }} />
      <Marker position={[N, W]} icon={titleIcon} interactive={false} />
      <Marker position={[dimensionLine[0]![0], lng(0.5)]} icon={dimensionIcon} interactive={false} />
    </>
  );
}
