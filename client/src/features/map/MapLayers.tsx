import { LayersControl } from 'react-leaflet';
import { CadLayer } from './cad/CadLayer';
import type { CadLayerData } from './cad/cadTypes';
import { GeoportalWms } from './GeoportalWms';
import { KiutOverlay } from './KiutOverlay';
import { BASE_LAYERS, CAD_OVERLAY_NAME, KIEG_OVERLAY } from './mapConfig';

interface MapLayersProps {
  cad: CadLayerData;
  collapsed?: boolean;
}

/** Official Geoportal (GUGiK) WMS layers only + local CAD underlay. */
export function MapLayers({ cad, collapsed = false }: MapLayersProps) {
  return (
    <LayersControl position="topright" collapsed={collapsed}>
      {BASE_LAYERS.map((layer) => (
        <LayersControl.BaseLayer key={layer.name} name={layer.name} checked={layer.checked}>
          <GeoportalWms layer={layer} />
        </LayersControl.BaseLayer>
      ))}
      <LayersControl.Overlay name={KIEG_OVERLAY.name} checked={KIEG_OVERLAY.checked}>
        <GeoportalWms layer={KIEG_OVERLAY} />
      </LayersControl.Overlay>
      <KiutOverlay />
      <LayersControl.Overlay name={CAD_OVERLAY_NAME}>
        <CadLayer data={cad} />
      </LayersControl.Overlay>
    </LayersControl>
  );
}
