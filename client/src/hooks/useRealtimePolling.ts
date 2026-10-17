import { useEffect, useRef } from 'react';

/** Globalny interwał cichego odświeżania danych w tle (kolejka, karta drzewa, mapa, listy zadań). */
export const REALTIME_POLL_MS = 3500;

export interface RealtimePollingOptions {
  intervalMs?: number;
  /** `false` zatrzymuje polling (np. zamknięta karta drzewa). */
  enabled?: boolean;
}

/**
 * Wywołuje `poll` cyklicznie w tle. Kolejny cykl startuje dopiero po zakończeniu poprzedniego (brak nakładających się
 * żądań). Gdy karta przeglądarki jest ukryta, polling stoi; po powrocie do karty dane odświeżają się od razu.
 * Hook nie robi pierwszego pobrania — to zadanie hooka danych. `poll` powinien aktualizować stan „cicho”
 * (bez spinnera, z `reconcileById`/`keepIfEqual`), żeby nie resetować modali, scrolla ani formularzy.
 */
export function useRealtimePolling(
  poll: () => Promise<unknown> | void,
  { intervalMs = REALTIME_POLL_MS, enabled = true }: RealtimePollingOptions = {},
): void {
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let running = false;
    let stopped = false;
    const isHidden = () => document.visibilityState === 'hidden';

    const schedule = () => {
      window.clearTimeout(timer);
      if (!stopped && !isHidden()) timer = window.setTimeout(() => void tick(), intervalMs);
    };

    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        await pollRef.current();
      } catch {
        // Błąd pojedynczego cyklu nie zatrzymuje pollingu; hook danych sam pokazuje komunikat.
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (isHidden()) window.clearTimeout(timer);
      else void tick();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Zwraca `prev`, jeśli dane się nie zmieniły — React pomija wtedy re-render. */
export function keepIfEqual<T>(prev: T, next: T): T {
  return sameJson(prev, next) ? prev : next;
}

/**
 * Scala nową listę z poprzednią: niezmienione elementy zachowują tożsamość obiektu (markery i wiersze się nie
 * przerysowują), a gdy nic się nie zmieniło, zwraca dokładnie `prev`.
 */
export function reconcileById<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  let changed = prev.length !== next.length;
  const merged = next.map((item, index) => {
    const old = prevById.get(item.id);
    if (old && sameJson(old, item)) {
      if (prev[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return item;
  });
  return changed ? merged : (prev as T[]);
}
