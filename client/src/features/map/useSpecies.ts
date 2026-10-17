import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PlantType, Species } from '@/types/domain';

const SEARCH_DEBOUNCE_MS = 200;

/** Species dictionary search (GET /api/species?q=&type=), debounced. */
export function useSpecies(query: string, type: PlantType | null) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (type) params.set('type', type);

    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get<Species[]>(`/api/species?${params.toString()}`)
        .then((result) => {
          if (cancelled) return;
          setSpecies(result);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Nie udało się pobrać gatunków.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, type]);

  return { species, loading, error };
}
