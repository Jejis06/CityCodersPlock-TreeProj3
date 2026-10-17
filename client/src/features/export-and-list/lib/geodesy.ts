/**
 * WGS84/ETRS89 -> Polish national grids (Transverse Mercator on GRS80, Snyder series; mm accuracy inside a zone).
 * Easting/northing are returned in the GIS order (x = easting, y = northing) used by DXF and Shapefile.
 */

interface TransverseMercator {
  centralMeridian: number;
  scale: number;
  falseEasting: number;
  falseNorthing: number;
}

export interface ProjectedPoint {
  easting: number;
  northing: number;
}

/** PL-2000 zone 7 (EPSG:2178) — the zone covering Płock (19.5°E–22.5°E), used in city geodetic maps. */
export const PL_2000_ZONE_7: TransverseMercator = {
  centralMeridian: 21,
  scale: 0.999923,
  falseEasting: 7_500_000,
  falseNorthing: 0,
};

/** PUWG 1992 (EPSG:2180) — national GIS grid. */
export const PUWG_1992: TransverseMercator = {
  centralMeridian: 19,
  scale: 0.9993,
  falseEasting: 500_000,
  falseNorthing: -5_300_000,
};

export const PUWG_1992_PRJ =
  'PROJCS["ETRS89_Poland_CS92",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",-5300000.0],PARAMETER["Central_Meridian",19.0],' +
  'PARAMETER["Scale_Factor",0.9993],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const A = 6_378_137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const E4 = E2 * E2;
const E6 = E4 * E2;

function meridianArc(phi: number): number {
  return (
    A *
    ((1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256) * phi -
      ((3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024) * Math.sin(2 * phi) +
      ((15 * E4) / 256 + (45 * E6) / 1024) * Math.sin(4 * phi) -
      ((35 * E6) / 3072) * Math.sin(6 * phi))
  );
}

export function projectTransverseMercator(lat: number, lng: number, grid: TransverseMercator): ProjectedPoint {
  const phi = (lat * Math.PI) / 180;
  const dLambda = ((lng - grid.centralMeridian) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);

  const n = A / Math.sqrt(1 - E2 * sin * sin);
  const t = tan * tan;
  const c = EP2 * cos * cos;
  const a = dLambda * cos;

  const x =
    grid.scale *
    n *
    (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);
  const y =
    grid.scale *
    (meridianArc(phi) +
      n *
        tan *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));

  return { easting: grid.falseEasting + x, northing: grid.falseNorthing + y };
}

export const toPl2000 = (lat: number, lng: number) => projectTransverseMercator(lat, lng, PL_2000_ZONE_7);
export const toPuwg1992 = (lat: number, lng: number) => projectTransverseMercator(lat, lng, PUWG_1992);

/** Great-circle distance in metres (used for the map scale bar). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}
