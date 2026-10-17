import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Card look shared by every panel of the list view (rounded, soft layered shadow). */
export const PANEL_CLASS =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-18px_rgba(15,23,42,0.18)]';

/** Overrides for shared `Input` / `Select` inside the list view. */
export const FIELD_CLASS =
  'h-10 rounded-xl border-slate-200 bg-slate-50/60 shadow-none transition-colors hover:border-slate-300 focus:bg-white';

export const FIELD_LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500';

interface PanelHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export function PanelHeader({ icon: Icon, title, description, aside, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex items-start gap-3 px-6 pt-5', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-snug text-slate-500">{description}</p>}
      </div>
      {aside}
    </div>
  );
}
