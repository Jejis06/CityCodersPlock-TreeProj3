import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface ParcelGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

/** Response of GET /api/geocode/reverse. */
export interface ReverseGeocodeResult {
  lat: number;
  lng: number;
  address: string | null;
  street: string | null;
  house_number: string | null;
  plot_number: string | null;
  parcel_number: string | null;
  parcel_label: string | null;
  precinct: string | null;
  commune: string | null;
  geometry: ParcelGeometry | null;
}

/** Response item of GET /api/geocode/suggest. */
export interface AddressSuggestion {
  label: string;
  detail: string;
  /** `plant` = single plant by inventory code, `trees` = street from our database. */
  source: 'plant' | 'trees' | 'gugik';
  filter_value: string | null;
  lat: number;
  lng: number;
  tree_id?: string;
}

const cache = new Map<string, ReverseGeocodeResult>();
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

interface ReverseGeocodeState {
  data: ReverseGeocodeResult | null;
  loading: boolean;
  error: string | null;
}

/** Parcel + address for a point (`null` = idle). Results are cached per coordinate. */
export function useReverseGeocode(point: { lat: number; lng: number } | null): ReverseGeocodeState {
  const lat = point?.lat;
  const lng = point?.lng;
  const [state, setState] = useState<ReverseGeocodeState>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = cache.get(cacheKey(lat, lng));
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    api
      .get<ReverseGeocodeResult>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      .then((data) => {
        cache.set(cacheKey(lat, lng), data);
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Nie udało się pobrać działki i adresu.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return state;
}
