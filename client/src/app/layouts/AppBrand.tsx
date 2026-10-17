import { TreePine } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppBrand({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-lg',
          inverted ? 'bg-white text-emerald-700' : 'bg-emerald-700 text-white',
        )}
      >
        <TreePine className="size-5" />
      </span>
      <div className="leading-tight">
        <p className={cn('font-bold', inverted ? 'text-white' : 'text-slate-900')}>Tree Monitor</p>
        <p className={cn('text-xs', inverted ? 'text-emerald-100' : 'text-slate-500')}>Urząd Miasta Płocka</p>
      </div>
    </div>
  );
}
