import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { StatusDot } from '@/components/shared/StatusDot';
import { cn } from '@/lib/utils';
import { TREE_STATUS_META, TREE_STATUSES, type TreeListItem, type TreeStatus } from '@/types/domain';

type StatsScope = 'viewport' | 'filter';

const SCOPE_OPTIONS: { value: StatsScope; label: string; title: string }[] = [
  { value: 'viewport', label: 'W widoku', title: 'W aktualnym obszarze mapy (widoku ekranu)' },
  { value: 'filter', label: 'Wg filtra', title: 'Dla wybranego zlecenia / filtra' },
];

const STATUS_SHORT: Record<TreeStatus, string> = {
  green: 'Zdrowe',
  yellow: 'W trakcie prac',
  red: 'Do wycinki',
  blue: 'Do posadzenia',
};

/**
 * Floating counter in the bottom-left corner of the map.
 * "viewport" counts trees inside `map.getBounds()`, "filter" counts all trees passed in
 * (already filtered server-side). Render inside <MapContainer>.
 */
export function ViewportStatsWidget({ trees, className }: { trees: TreeListItem[]; className?: string }) {
  const map = useMap();
  const [scope, setScope] = useState<StatsScope>('viewport');
  const [bounds, setBounds] = useState<L.LatLngBounds>(() => map.getBounds());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    L.DomEvent.disableClickPropagation(rootRef.current);
    L.DomEvent.disableScrollPropagation(rootRef.current);
  }, []);

  useMapEvents({ moveend: () => setBounds(map.getBounds()), zoomend: () => setBounds(map.getBounds()) });

  const counts = useMemo(() => {
    const scoped = scope === 'viewport' ? trees.filter((t) => bounds.contains([t.latitude, t.longitude])) : trees;
    const byStatus: Record<TreeStatus, number> = { green: 0, yellow: 0, red: 0, blue: 0 };
    for (const tree of scoped) byStatus[tree.status] += 1;
    return { total: scoped.length, byStatus };
  }, [trees, scope, bounds]);

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute bottom-8 left-3 z-[1001] w-60 rounded-xl border border-slate-200 bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur',
        className,
      )}
    >
      <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Zakres licznika">
        {SCOPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={scope === option.value}
            onClick={() => setScope(option.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 font-medium transition-colors',
              scope === option.value ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 flex items-baseline justify-between px-0.5 text-slate-600">
        <span>{scope === 'viewport' ? 'W aktualnym obszarze mapy' : 'Dla wybranego zlecenia / filtra'}</span>
        <span className="text-sm font-bold text-slate-900">{counts.total}</span>
      </p>

      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {TREE_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-1.5" title={TREE_STATUS_META[status].label}>
            <StatusDot status={status} className="size-2.5" />
            <span className="flex-1 truncate text-slate-600">{STATUS_SHORT[status]}</span>
            <span className="font-semibold text-slate-900">{counts.byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
