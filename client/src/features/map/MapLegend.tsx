import { StatusDot } from '@/components/shared/StatusDot';
import { TREE_STATUS_META, TREE_STATUSES } from '@/types/domain';

export function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-8 right-3 z-[1001] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
      <p className="mb-2 font-semibold uppercase tracking-wide text-slate-500">Legenda</p>
      <ul className="space-y-1.5">
        {TREE_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-2 text-slate-700">
            <StatusDot status={status} />
            {TREE_STATUS_META[status].label}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-3 border-t border-slate-200 pt-2 text-slate-600">
        <span className="flex items-center gap-1.5">
          <StatusDot status="green" /> drzewo
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot status="green" shape="square" /> krzew / bylina
        </span>
      </div>
    </div>
  );
}
