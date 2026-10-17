import type L from 'leaflet';
import { useEffect, useRef } from 'react';
import { Circle, GeoJSON, ImageOverlay, LayerGroup, Polygon, Polyline, useMap } from 'react-leaflet';
import { STARY_RYNEK_BOUNDS } from '../mapConfig';
import { CadDemoProject } from './CadDemoProject';
import type { CadLayerData } from './cadTypes';

const vectorStyle = { color: '#22d3ee', weight: 2, fillOpacity: 0.08 };

export function CadLayer({ data }: { data: CadLayerData }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup>(null);

  // Show the overlay right after the user loads a file (also ticks the LayersControl checkbox).
  useEffect(() => {
    const group = groupRef.current;
    if (data.source !== 'demo' && group && !map.hasLayer(group)) {
      map.addLayer(group);
    }
  }, [data, map]);

  return (
    <LayerGroup ref={groupRef}>
      {data.source === 'demo' && <CadDemoProject />}

      {data.source === 'raster' && (
        <ImageOverlay key={data.url} url={data.url} bounds={STARY_RYNEK_BOUNDS} opacity={0.75} />
      )}

      {data.source === 'geojson' && (
        <GeoJSON key={data.fileName} data={data.data} style={() => vectorStyle} />
      )}

      {data.source === 'vector' &&
        data.shapes.map((shape, i) => {
          if (shape.kind === 'circle') {
            return <Circle key={i} center={shape.center} radius={shape.radiusMeters} pathOptions={vectorStyle} />;
          }
          return shape.closed ? (
            <Polygon key={i} positions={shape.points} pathOptions={vectorStyle} />
          ) : (
            <Polyline key={i} positions={shape.points} pathOptions={vectorStyle} />
          );
        })}
    </LayerGroup>
  );
}
