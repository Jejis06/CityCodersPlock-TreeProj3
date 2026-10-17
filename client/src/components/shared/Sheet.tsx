import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { dialogOverlayClass } from './Dialog';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  side?: 'right' | 'left';
  /** Without overlay the map stays interactive while the panel is open. */
  modal?: boolean;
}

export function SheetContent({
  side = 'right',
  modal = true,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      {modal && <DialogPrimitive.Overlay className={dialogOverlayClass} />}
      <DialogPrimitive.Content
        className={cn(
          'fixed top-0 z-[2001] flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl focus:outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <X className="size-5" />
          <span className="sr-only">Zamknij</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 border-b p-6 pr-12', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-xl font-semibold', className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-slate-500', className)} {...props} />;
}
