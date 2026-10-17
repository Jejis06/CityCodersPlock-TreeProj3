import type { LatLngTuple, WMSParams } from 'leaflet';

export const MAP_CENTER: LatLngTuple = [52.5463, 19.6885];
export const MAP_ZOOM = 17;
export const MAP_MAX_ZOOM = 21;

export const GEOPORTAL_ATTRIBUTION = 'GUGiK Geoportal.gov.pl';

export interface WmsLayerConfig {
  name: string;
  url: string;
  params: WMSParams;
  checked?: boolean;
  attribution?: string;
  /** Overlays must stay above base layers after switching the base layer. */
  zIndex: number;
}

export const BASE_LAYERS: WmsLayerConfig[] = [
  {
    name: 'Geoportal - Ortofotomapa HD',
    url: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    params: { layers: 'Raster', format: 'image/jpeg', transparent: false, version: '1.3.0' },
    checked: true,
    attribution: GEOPORTAL_ATTRIBUTION,
    zIndex: 1,
  },
  {
    name: 'Geoportal - Mapa Topograficzna (TOPO)',
    url: 'https://mapy.geoportal.gov.pl/wss/service/img/guest/TOPO/MapServer/WMSServer',
    params: { layers: 'Raster', format: 'image/png', transparent: false },
    attribution: GEOPORTAL_ATTRIBUTION,
    zIndex: 1,
  },
];

export const KIEG_OVERLAY: WmsLayerConfig = {
  name: 'Geoportal - Działki i Budynki (KIEG)',
  url: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
  params: { layers: 'dzialki,numery_dzialek,budynki', format: 'image/png', transparent: true },
  checked: true,
  zIndex: 10,
};

export const CAD_OVERLAY_NAME = 'Podkład projektowy CAD/DXF i Raster (Lokalny)';

/** Frame of Stary Rynek in Płock used to place the local CAD/raster underlay. */
export const STARY_RYNEK_BOUNDS: [LatLngTuple, LatLngTuple] = [
  [52.5443, 19.6844],
  [52.5453, 19.6863],
];
