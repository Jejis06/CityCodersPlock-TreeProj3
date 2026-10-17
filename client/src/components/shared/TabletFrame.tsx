import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabletFrameProps {
  /** false = full screen, no bezel */
  framed: boolean;
  children: ReactNode;
}

export function TabletFrame({ framed, children }: TabletFrameProps) {
  if (!framed) {
    return <div className="h-full w-full overflow-hidden bg-white">{children}</div>;
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-gradient-to-br from-slate-200 to-slate-300 p-6">
      <div
        className={cn(
          'relative flex aspect-[4/3] w-full max-w-[1180px] max-h-full flex-col',
          'rounded-[2.75rem] border-[16px] border-slate-900 bg-slate-900 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.6)]',
        )}
      >
        <span className="absolute -top-[11px] left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-slate-600" />
        <div className="relative flex-1 overflow-hidden rounded-[1.5rem] bg-white">{children}</div>
      </div>
    </div>
  );
}
