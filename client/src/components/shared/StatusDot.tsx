import { cn } from '@/lib/utils';
import { TREE_STATUS_META, type TreeStatus } from '@/types/domain';

interface StatusDotProps {
  status: TreeStatus;
  shape?: 'circle' | 'square';
  className?: string;
}

export function StatusDot({ status, shape = 'circle', className }: StatusDotProps) {
  return (
    <span
      aria-label={TREE_STATUS_META[status].label}
      className={cn(
        'inline-block size-3.5 shrink-0 border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]',
        shape === 'circle' ? 'rounded-full' : 'rounded-[3px]',
        className,
      )}
      style={{ backgroundColor: TREE_STATUS_META[status].color }}
    />
  );
}
