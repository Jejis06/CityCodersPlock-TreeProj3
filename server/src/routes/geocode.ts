import { Router } from 'express';
import { queryAll } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { requireRole } from '../middleware/requireRole.js';

/**
 * Geocoding helpers backed by official GUGiK services only:
 *  - ULDK (parcel by XY, incl. geometry),
 *  - Usługa Lokalizacji (UUG): address reverse geocoding and address search.
 */
export const geocodeRouter = Router();
geocodeRouter.use(requireRole('official'));

const ULDK_URL = 'https://uldk.gugik.gov.pl/';
const UUG_URL = 'https://services.gugik.gov.pl/uug/';
const UPSTREAM_TIMEOUT_MS = 8000;
const CITY = 'Płock';
const MIN_SUGGEST_LENGTH = 2;
const MAX_SUGGESTIONS = 8;

// Płock and a small margin; guards against nonsense coordinates hitting GUGiK.
const PLOCK_BOUNDS = { minLat: 52.45, maxLat: 52.65, minLng: 19.5, maxLng: 19.9 };

export interface ParcelGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface ReverseGeocodeResult {
  lat: number;
  lng: number;
  /** "Henryka Sienkiewicza 63, Płock" or null when no address point is nearby. */
  address: string | null;
  street: string | null;
  house_number: string | null;
  /** Ewidencyjny identifier, e.g. 146201_1.0008.512/9 (format used by `trees.plot_number`). */
  plot_number: string | null;
  /** Parcel number only, e.g. 512/9. */
  parcel_number: string | null;
  /** "dz. 512/9" */
  parcel_label: string | null;
  /** Obręb ewidencyjny, e.g. Śródmieście. */
  precinct: string | null;
  commune: string | null;
  /** GeoJSON geometry in WGS84 (lng, lat order) or null when no parcel was found. */
  geometry: ParcelGeometry | null;
}

export interface AddressSuggestion {
  label: string;
  detail: string;
  source: 'trees' | 'gugik';
  /** Value for GET /api/trees?address= (only for suggestions coming from our tree database). */
  filter_value: string | null;
  lat: number;
  lng: number;
}

async function fetchUpstream(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// ---------- WKT -> GeoJSON ----------

function parseRing(text: string): number[][] {
  return text.split(',').map((pair) => {
    const [x = Number.NaN, y = Number.NaN] = pair.trim().split(/\s+/).map(Number);
    return [x, y];
  });
}

function parseRings(text: string): number[][][] {
  return text
    .trim()
    .replace(/^\(+|\)+$/g, '')
    .split(/\)\s*,\s*\(/)
    .map(parseRing);
}

/** Converts `SRID=4326;POLYGON((x y,...))` / `MULTIPOLYGON(...)` to GeoJSON; null when unsupported. */
export function wktToGeometry(wkt: string): ParcelGeometry | null {
  const body = wkt.replace(/^SRID=\d+;/i, '').trim();
  const match = /^(POLYGON|MULTIPOLYGON)\s*\(([\s\S]*)\)$/i.exec(body);
  if (!match) return null;
  const [, kind = '', inner = ''] = match;
  const geometry: ParcelGeometry =
    kind.toUpperCase() === 'POLYGON'
      ? { type: 'Polygon', coordinates: parseRings(inner) }
      : { type: 'MultiPolygon', coordinates: inner.trim().split(/\)\)\s*,\s*\(\(/).map(parseRings) };
  // NaN serializes to null: reject malformed coordinates.
  return JSON.stringify(geometry.coordinates).includes('null') ? null : geometry;
}

// ---------- ULDK ----------

interface ParcelInfo {
  plot_number: string;
  parcel_number: string;
  precinct: string;
  commune: string;
  geometry: ParcelGeometry | null;
}

async function fetchParcel(lat: number, lng: number): Promise<ParcelInfo | null> {
  const params = new URLSearchParams({
    request: 'GetParcelByXY',
    xy: `${lng},${lat},4326`,
    result: 'teryt,parcel,region,commune,geom_wkt',
    srid: '4326',
  });
  const text = await fetchUpstream(`${ULDK_URL}?${params.toString()}`);
  const [status, data] = text.split(/\r?\n/);
  // "0" = OK; "-1 brak wyników" (no parcel at this point) or other negative codes.
  if (status?.trim() !== '0' || !data) return null;
  const [teryt, parcel, region, commune, wkt] = data.split('|');
  if (!teryt || !parcel) return null;
  return {
    plot_number: teryt,
    parcel_number: parcel,
    precinct: region ?? '',
    commune: commune ?? '',
    geometry: wkt ? wktToGeometry(wkt) : null,
  };
}

// ---------- UUG (address) ----------

interface UugResult {
  city?: string;
  street?: string | null;
  number?: string | null;
  x?: string;
  y?: string;
  distance?: string;
}

interface UugResponse {
  results?: Record<string, UugResult>;
}

async function fetchUug(params: Record<string, string>): Promise<UugResult[]> {
  const text = await fetchUpstream(`${UUG_URL}?${new URLSearchParams(params).toString()}`);
  const parsed = JSON.parse(text) as UugResponse;
  return Object.values(parsed.results ?? {});
}

function pickClosestAddress(results: UugResult[]): UugResult | null {
  if (results.length === 0) return null;
  return results.reduce((best, cur) => {
    const bestDist = Number(best.distance ?? Number.POSITIVE_INFINITY);
    const curDist = Number(cur.distance ?? Number.POSITIVE_INFINITY);
    return curDist < bestDist ? cur : best;
  });
}

async function fetchAddress(lat: number, lng: number): Promise<UugResult | null> {
  const near = pickClosestAddress(
    await fetchUug({
      request: 'GetAddressReverse',
      location: `POINT(${lng} ${lat})`,
      srid: '4326',
    }),
  );
  if (near?.street) return near;

  const wider = pickClosestAddress(
    await fetchUug({
      request: 'GetAddressReverse',
      location: `POINT(${lng} ${lat})`,
      srid: '4326',
      radius: '500',
    }),
  );
  return wider ?? near;
}

function formatAddress(street: string | null, number: string | null, city: string): string | null {
  if (!street) return null;
  return `${[street, number].filter(Boolean).join(' ')}, ${city}`;
}

export async function reverseGeocodePoint(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const [parcelResult, addressResult] = await Promise.allSettled([fetchParcel(lat, lng), fetchAddress(lat, lng)]);
  if (parcelResult.status === 'rejected' && addressResult.status === 'rejected') {
    throw new HttpError(502, 'Usługi GUGiK (ULDK / lokalizacji) są chwilowo niedostępne.');
  }

  const parcel = parcelResult.status === 'fulfilled' ? parcelResult.value : null;
  const address = addressResult.status === 'fulfilled' ? addressResult.value : null;
  const street = address?.street ?? null;
  const houseNumber = address?.number ?? null;

  return {
    lat,
    lng,
    address: formatAddress(street, houseNumber, address?.city ?? CITY),
    street,
    house_number: houseNumber,
    plot_number: parcel?.plot_number ?? null,
    parcel_number: parcel?.parcel_number ?? null,
    parcel_label: parcel ? `dz. ${parcel.parcel_number}` : null,
    precinct: parcel?.precinct || null,
    commune: parcel?.commune || null,
    geometry: parcel?.geometry ?? null,
  };
}

/**
 * GET /api/geocode/reverse?lat=&lng=
 * Parcel (ULDK, with outline geometry) + nearest street address (GUGiK UUG).
 * One upstream failing degrades gracefully (the other part is still returned).
 */
geocodeRouter.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, 'Parametry "lat" i "lng" muszą być liczbami.');
  }
  if (lat < PLOCK_BOUNDS.minLat || lat > PLOCK_BOUNDS.maxLat || lng < PLOCK_BOUNDS.minLng || lng > PLOCK_BOUNDS.maxLng) {
    throw new HttpError(400, 'Współrzędne poza obszarem Płocka.');
  }

  const body = await reverseGeocodePoint(lat, lng);
  res.json(body);
});

// ---------- Address suggestions ----------

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** "ul. Tumska 8, Płock" -> "Tumska"; "Stary Rynek, Płock" -> "Stary Rynek". */
export function streetOf(address: string): string {
  return (address.split(',')[0] ?? address)
    .trim()
    .replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/i, '')
    .replace(/\s+\d+[a-z]?(\/\d+[a-z]?)?$/i, '')
    .trim();
}

interface TreeAddressRow {
  address: string;
  lat: number;
  lng: number;
  n: number;
}

function treeStreetSuggestions(query: string): AddressSuggestion[] {
  const rows = queryAll<TreeAddressRow>(
    `SELECT address, AVG(latitude) AS lat, AVG(longitude) AS lng, COUNT(*) AS n
       FROM trees WHERE address IS NOT NULL AND address <> '' GROUP BY address`,
  );
  const streets = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const row of rows) {
    const street = streetOf(row.address);
    if (!street) continue;
    const entry = streets.get(street) ?? { latSum: 0, lngSum: 0, count: 0 };
    entry.latSum += row.lat * row.n;
    entry.lngSum += row.lng * row.n;
    entry.count += row.n;
    streets.set(street, entry);
  }

  const needle = normalize(query);
  return [...streets.entries()]
    .filter(([street]) => normalize(street).includes(needle))
    .sort(([a], [b]) => a.localeCompare(b, 'pl'))
    .map(([street, e]) => ({
      label: street,
      detail: `${e.count} ${e.count === 1 ? 'roślina' : 'roślin'} w ewidencji`,
      source: 'trees' as const,
      filter_value: street,
      lat: e.latSum / e.count,
      lng: e.lngSum / e.count,
    }));
}

async function gugikAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const results = await fetchUug({ request: 'GetAddress', address: `${CITY}, ${query}`, srid: '4326' });
  const suggestions: AddressSuggestion[] = [];
  for (const r of results) {
    const lng = Number(r.x);
    const lat = Number(r.y);
    const label = formatAddress(r.street ?? null, r.number ?? null, r.city ?? CITY);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < PLOCK_BOUNDS.minLat || lat > PLOCK_BOUNDS.maxLat || lng < PLOCK_BOUNDS.minLng || lng > PLOCK_BOUNDS.maxLng) continue;
    suggestions.push({ label, detail: 'Adres w Płocku (GUGiK)', source: 'gugik', filter_value: null, lat, lng });
  }
  return suggestions;
}

/**
 * GET /api/geocode/suggest?q=
 * Streets from our tree database first, then Płock addresses from GUGiK.
 */
geocodeRouter.get('/suggest', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < MIN_SUGGEST_LENGTH) {
    res.json([]);
    return;
  }

  const fromTrees = treeStreetSuggestions(query);
  let fromGugik: AddressSuggestion[] = [];
  try {
    fromGugik = await gugikAddressSuggestions(query);
  } catch {
    // GUGiK is optional here: our own streets are still useful offline.
  }

  const seen = new Set(fromTrees.map((s) => normalize(s.label)));
  const merged = [...fromTrees, ...fromGugik.filter((s) => !seen.has(normalize(s.label)))];
  res.json(merged.slice(0, MAX_SUGGESTIONS));
});
