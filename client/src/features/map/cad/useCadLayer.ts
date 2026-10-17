import { useCallback, useEffect, useRef, useState } from 'react';
import type { CadLayerData } from './cadTypes';
import { parseCadFile } from './parseCadFile';

export interface CadLayerState {
  data: CadLayerData;
  loading: boolean;
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  resetToDemo: () => void;
}

export function useCadLayer(): CadLayerState {
  const [data, setData] = useState<CadLayerData>({ source: 'demo' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const replaceData = useCallback((next: CadLayerData) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = next.source === 'raster' ? next.url : null;
    setData(next);
  }, []);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const loadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        replaceData(await parseCadFile(file));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać pliku.');
      } finally {
        setLoading(false);
      }
    },
    [replaceData],
  );

  const resetToDemo = useCallback(() => {
    setError(null);
    replaceData({ source: 'demo' });
  }, [replaceData]);

  return { data, loading, error, loadFile, resetToDemo };
}
