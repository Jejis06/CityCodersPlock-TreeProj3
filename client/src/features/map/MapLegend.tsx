import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { StatusDot } from '@/components/shared/StatusDot';
import { cn } from '@/lib/utils';
import { TREE_STATUS_META, TREE_STATUSES, type PlantType } from '@/types/domain';

const CODE_LEGEND: { type: PlantType; code: string; title: string; description: string }[] = [
  { type: 'tree', code: 'D1/2026', title: 'Drzewo', description: 'kod D{nr}/{rok}, znacznik okrągły' },
  { type: 'shrub', code: 'K1/2026', title: 'Krzew / bylina', description: 'kod K{nr}/{rok}, znacznik kwadratowy' },
];

/** Static copy of the map marker (same CSS as TreeMarker) for the legend. */
function MarkerPreview({ type, code }: { type: PlantType; code: string }) {
  return (
    <span className="map-legend__marker">
      <span className={cn('tree-marker', 'tree-marker--green', `tree-marker--${type}`)}>
        <span className="tree-marker__dot" />
      </span>
      <span className="map-legend__code">{code}</span>
    </span>
  );
}

export function MapLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={cn(
        'absolute bottom-8 left-3 z-[1001] overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-xs shadow-lg backdrop-blur',
        open ? 'w-72' : 'w-auto',
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Info className="size-4 text-emerald-700" />
        <span className="font-semibold uppercase tracking-wide text-slate-600">Legenda</span>
        {!open && (
          <span className="ml-1 flex gap-1">
            {TREE_STATUSES.map((status) => (
              <StatusDot key={status} status={status} className="size-3" />
            ))}
          </span>
        )}
        <ChevronDown className={cn('ml-auto size-4 text-slate-400 transition-transform', !open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-slate-200 px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status rośliny</p>
          <ul className="space-y-1.5">
            {TREE_STATUSES.map((status) => (
              <li key={status} className="flex items-center gap-2 text-slate-700">
                <StatusDot status={status} />
                {TREE_STATUS_META[status].label}
              </li>
            ))}
          </ul>

          <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Oznaczenia ewidencyjne
          </p>
          <ul className="space-y-2">
            {CODE_LEGEND.map(({ type, code, title, description }) => (
              <li key={type} className="flex items-center gap-2.5">
                <MarkerPreview type={type} code={code} />
                <span className="leading-tight">
                  <span className="block font-semibold text-slate-800">{title}</span>
                  <span className="text-slate-500">{description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
