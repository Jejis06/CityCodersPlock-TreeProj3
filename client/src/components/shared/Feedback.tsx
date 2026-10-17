import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-emerald-700', className)} />;
}

export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 p-8 text-center', className)}>
      {icon && <div className="text-slate-400 [&_svg]:size-10">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
    </div>
  );
}
